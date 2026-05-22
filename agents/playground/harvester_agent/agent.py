"""Harvester pipeline — discover MOE books + videos, download raw PDFs, upload to
GCS, write skeleton `books/{id}` docs with `status='downloaded'`. No PDF parsing
happens here. The analyzer job consumes these skeleton docs.

Memory profile is dominated by `pdf_bytes` held while uploading to GCS. That's
30-200 MB per worker, freed immediately after upload completes. No
accumulation across books (no formatted text, no embeddings, no tasks_map).

Status doc: `ingestion/harvester_status`.
"""
from __future__ import annotations

import asyncio
import gc
import hashlib
import io
import os
import re
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx
from google.cloud import firestore, storage

from ingestion_agent.crawler import CrawlerAgent
from ingestion_agent.video_extractor import VideoExtractorAgent

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass

try:
    import psutil
    _proc = psutil.Process()
    def _rss_mb() -> float:
        return _proc.memory_info().rss / 1_000_000
except Exception:
    def _rss_mb() -> float:
        return -1.0


GCS_BUCKET = os.getenv("GCS_BUCKET", "khsosy.firebasestorage.app")
SYNC_WORKER_COUNT = int(os.getenv("SYNC_WORKER_COUNT", "3") or 3)
LOG_AGENT = "Harvester"
STATUS_DOC = "harvester_status"
LOGS_CAP = 50


def clean_path_segment(seg: str) -> str:
    for c in ["?", "*", ":", "|", '"', "<", ">", "\\"]:
        seg = seg.replace(c, "")
    return seg.strip()


def get_book_id(gov_url: str, subject: str = "book") -> str:
    short_hash = hashlib.md5(gov_url.encode("utf-8")).hexdigest()[:8]
    try:
        path = urllib.parse.urlparse(gov_url).path
        filename = path.split("/")[-1]
        name_without_ext = filename.rsplit(".", 1)[0]
        year_match = re.search(r"/(\d{4})/", gov_url)
        year = year_match.group(1) if year_match else "2026"
        lang = "ar"
        sub_lower = subject.lower()
        f_lower = name_without_ext.lower()
        if "english" in sub_lower or "_en_" in f_lower or f_lower.endswith("_en") or "english" in f_lower:
            lang = "en"
        elif "french" in sub_lower or "_fr_" in f_lower or f_lower.endswith("_fr") or "french" in f_lower:
            lang = "fr"
        slug = re.sub(r"[^a-z0-9]+", "-", subject.lower()).strip("-")[:40] or "book"
        return f"{slug}-{lang}-{year}-{short_hash}"
    except Exception:
        return f"book-{short_hash}"


async def download_pdf(url: str) -> bytes:
    headers = {"User-Agent": "Mozilla/5.0"}
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.get(url, headers=headers, follow_redirects=True)
        res.raise_for_status()
        return res.content


async def run_harvester_pipeline(
    db: firestore.Client,
    storage_client: storage.Client,
    bucket_name: str = GCS_BUCKET,
) -> None:
    """Crawl, scrape videos, download all MOE PDFs, upload to GCS, write
    skeleton book docs. Resumable via existing `books/{id}` docs with
    `storagePath` set."""
    status_ref = db.collection("ingestion").document(STATUS_DOC)
    existing = (status_ref.get().to_dict() or {})
    logs = existing.get("logs", [])

    status_lock = asyncio.Lock()

    def _append_log(text: str, lvl: str = "info") -> None:
        logs.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "text": text,
            "status": lvl,
            "agent": LOG_AGENT,
        })
        while len(logs) > LOGS_CAP:
            logs.pop(0)

    async def _update(updates: Dict[str, Any], log_text: Optional[str] = None, log_status: str = "info") -> None:
        async with status_lock:
            if log_text:
                _append_log(log_text, log_status)
            updates.setdefault("logs", logs[-LOGS_CAP:])
            updates.setdefault("lastHeartbeatAt", firestore.SERVER_TIMESTAMP)
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, lambda: status_ref.update(updates))

    async def _is_paused() -> bool:
        loop = asyncio.get_running_loop()
        doc = await loop.run_in_executor(None, status_ref.get)
        d = doc.to_dict() or {}
        return bool(d.get("pausedByRequest")) or d.get("status") == "paused"

    _append_log("Harvester pipeline started.", "info")

    status_ref.set({
        "status": "running",
        "pausedByRequest": False,
        "logs": logs,
        "totalBooks": 0,
        "downloadedBooks": 0,
        "skippedBooks": 0,
        "failedBooks": 0,
        "percentage": 0.0,
        "activeBookTitle": "",
        "progressMessage": "Crawling MOE portal...",
        "startedAt": firestore.SERVER_TIMESTAMP,
        "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
        "executionName": existing.get("executionName", ""),
        "errorMessage": "",
    }, merge=False)

    try:
        # 1. Crawl
        crawler = CrawlerAgent()
        catalog = await crawler.run()
        total = len(catalog)
        await _update(
            {"totalBooks": total, "progressMessage": f"Found {total} books. Scraping videos..."},
            log_text=f"Crawler discovered {total} books.",
            log_status="ok",
        )

        # 2. Videos (no PDF work, runs once per harvester execution)
        video_extractor = VideoExtractorAgent(db)
        try:
            videos = await video_extractor.run()
            await _update(
                {"progressMessage": "Videos saved. Downloading PDFs..."},
                log_text=f"Video Extractor saved {len(videos)} videos.",
                log_status="ok",
            )
        except Exception as ve:
            await _update(
                {"progressMessage": "Video extraction failed; continuing with PDFs."},
                log_text=f"Video extraction failed: {ve}",
                log_status="warn",
            )

        # 3. Find already-downloaded books to skip
        loop = asyncio.get_running_loop()
        def _existing_storage_paths() -> Dict[str, str]:
            out: Dict[str, str] = {}
            for d in db.collection("books").stream():
                data = d.to_dict() or {}
                sp = data.get("storagePath") or ""
                if sp.startswith("gs://"):
                    out[d.id] = sp
            return out
        already = await loop.run_in_executor(None, _existing_storage_paths)
        await _update(
            {"skippedBooks": len(already)},
            log_text=f"{len(already)} books already downloaded — will skip.",
        )

        # 4. Worker pool: download + upload + skeleton doc
        bucket = storage_client.bucket(bucket_name)
        queue: asyncio.Queue = asyncio.Queue()
        for idx, b in enumerate(catalog):
            await queue.put((idx, b))

        downloaded = 0
        failed = 0

        async def harvest_one(book_idx: int, book_data: Dict[str, Any]) -> str:
            """Returns 'downloaded' | 'skipped' | 'failed'."""
            nonlocal downloaded, failed
            gov_url = book_data["link"]
            subject = book_data.get("subject", "book")
            b_id = get_book_id(gov_url, subject)
            b_title = subject

            if b_id in already:
                return "skipped"

            async with status_lock:
                _append_log(f"Downloading {b_title} ({book_idx + 1}/{total})", "info")
            await _update({
                "activeBookTitle": b_title,
                "progressMessage": f"Downloading {b_title}...",
            })

            try:
                pdf_bytes = await download_pdf(gov_url)

                # Build GCS path with the same scheme the analyzer + indexer expect
                stage_c = clean_path_segment(book_data.get("stage", "Other"))
                grade_c = clean_path_segment(book_data.get("grade", "Other"))
                term_c = clean_path_segment(book_data.get("term", "Other"))
                sub_c = clean_path_segment(book_data.get("subject", "Other"))
                type_c = clean_path_segment(book_data.get("type", "Other"))
                filename = os.path.basename(gov_url)
                if not filename.endswith(".pdf"):
                    filename = f"{sub_c}_{type_c}.pdf"
                filename = clean_path_segment(filename)
                blob_path = f"moe-textbooks/{stage_c}/{grade_c}/{term_c}/{sub_c}/{type_c}/{filename}"

                # Upload synchronously inside executor (blob.upload is blocking)
                def _upload() -> str:
                    blob = bucket.blob(blob_path)
                    blob.upload_from_string(pdf_bytes, content_type="application/pdf")
                    return f"gs://{bucket_name}/{blob_path}"

                gcs_uri = await asyncio.get_running_loop().run_in_executor(None, _upload)

                # Detect language code once for the skeleton doc
                lang_code = "ar"
                f_lower = filename.lower()
                sub_lower = subject.lower()
                if "english" in sub_lower or "_en" in f_lower:
                    lang_code = "en"
                elif "french" in sub_lower or "_fr" in f_lower:
                    lang_code = "fr"

                year_match = re.search(r"/(\d{4})/", gov_url)
                year_val = int(year_match.group(1)) if year_match else 2026

                def _write_skeleton() -> None:
                    db.collection("books").document(b_id).set({
                        "id": b_id,
                        "title": b_title,
                        "stage": book_data.get("stage", ""),
                        "grade": book_data.get("grade", ""),
                        "term": book_data.get("term", ""),
                        "subject": subject,
                        "type": book_data.get("type", "Student Book"),
                        "language": lang_code,
                        "year": year_val,
                        "govUrl": gov_url,
                        "storagePath": gcs_uri,
                        "status": "downloaded",
                        "pages": 0,
                        "chapters": [],
                        "createdAt": firestore.SERVER_TIMESTAMP,
                        "updatedAt": firestore.SERVER_TIMESTAMP,
                    }, merge=True)

                await asyncio.get_running_loop().run_in_executor(None, _write_skeleton)

                # Drop the raw bytes immediately. This is the only heavy buffer
                # the harvester holds per book; freeing it here is what keeps RSS
                # flat across the catalog.
                del pdf_bytes
                gc.collect()
                return "downloaded"

            except Exception as ex:
                async with status_lock:
                    _append_log(f"Failed to download {b_title}: {ex}", "error")
                return "failed"

        async def worker(wid: int) -> None:
            nonlocal downloaded, failed
            while not queue.empty():
                try:
                    idx, bd = queue.get_nowait()
                except asyncio.QueueEmpty:
                    break

                if await _is_paused():
                    queue.task_done()
                    break

                print(f"[mem] harvester worker={wid} book={idx} step=start rss={_rss_mb():.0f}MB")
                outcome = await harvest_one(idx, bd)
                if outcome == "downloaded":
                    async with status_lock:
                        downloaded += 1
                elif outcome == "failed":
                    async with status_lock:
                        failed += 1
                gc.collect()
                print(f"[mem] harvester worker={wid} book={idx} step=end rss={_rss_mb():.0f}MB out={outcome}")

                done = downloaded + failed
                pct = (done / total * 100.0) if total else 0.0
                await _update({
                    "downloadedBooks": downloaded,
                    "failedBooks": failed,
                    "percentage": pct,
                })
                queue.task_done()

        workers = [asyncio.create_task(worker(i)) for i in range(SYNC_WORKER_COUNT)]
        await asyncio.gather(*workers)

        # Final state
        if await _is_paused():
            await _update({"status": "paused"}, log_text="Harvester paused by user.", log_status="warn")
            return

        await _update(
            {"status": "completed", "activeBookTitle": "", "progressMessage": ""},
            log_text=f"Harvester finished. Downloaded={downloaded} Skipped={len(already)} Failed={failed}",
            log_status="ok",
        )
    except Exception as ex:
        await _update(
            {"status": "error", "errorMessage": str(ex)[:500]},
            log_text=f"Harvester pipeline failed: {ex}",
            log_status="error",
        )
        raise
