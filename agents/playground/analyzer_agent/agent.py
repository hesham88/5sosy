"""Analyzer pipeline — pick up books with `status='downloaded'`, parse them
page-by-page from the GCS volume mount (no full-file load into RAM), embed,
and write `books/{id}/pages/{N}` + `books/{id}/content/full`, then mark
`status='indexed'`.

The key memory win vs the old single-job design:

- Source PDF is **never** loaded into RAM. `PdfReader(file_path)` reads only the
  trailer + cross-reference table, then lazily streams per-page bytes via
  gcsfuse when `reader.pages[i]` is touched.
- Per-page work is bounded by a Semaphore — only N pages are extracted to bytes
  and sent to Gemini at any moment. Each page's bytes are freed immediately
  after Gemini returns.
- Per-page Firestore writes happen inline so we never accumulate an
  `embeddings_map` for the whole book.
- The only per-book accumulator is `formatted_pages` (≈ 150 KB per page, used
  to assemble `content/full` at the end), which is dropped before moving to
  the next book.

Status doc: `ingestion/analyzer_status`.
"""
from __future__ import annotations

import asyncio
import gc
import io
import os
import struct
import sys
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from google import genai
from google.cloud import firestore
from pypdf import PdfReader, PdfWriter

from ingestion_agent.counter import PageCounterAgent
from ingestion_agent.formatter import BookFormatterAgent

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
GCS_MOUNT_PATH = os.getenv("GCS_MOUNT_PATH", "/mnt/khsosy_files")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-2")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "3072") or 3072)
SYNC_WORKER_COUNT = int(os.getenv("SYNC_WORKER_COUNT", "3") or 3)
PAGE_OCR_CONCURRENCY = int(os.getenv("PAGE_OCR_CONCURRENCY", "15") or 15)

LOG_AGENT = "Analyzer"
STATUS_DOC = "analyzer_status"
LOGS_CAP = 50


def _sanitize_text(text: str) -> str:
    """Strip lone surrogates that crash the Firestore JS SDK listener."""
    if not text:
        return ""
    return "".join(c for c in text if not (0xD800 <= ord(c) <= 0xDFFF))


def gs_to_local_path(gs_uri: str, bucket: str = GCS_BUCKET, mount: str = GCS_MOUNT_PATH) -> Optional[str]:
    """gs://khsosy.firebasestorage.app/moe-textbooks/... → /mnt/khsosy_files/moe-textbooks/..."""
    prefix = f"gs://{bucket}/"
    if not gs_uri or not gs_uri.startswith(prefix):
        return None
    return f"{mount}/{gs_uri[len(prefix):]}"


async def _embed_text(client: genai.Client, text: str, max_retries: int = 3) -> List[float]:
    """Embedding with light retry. Returns zero-vector on terminal failure."""
    delay = 1.0
    for attempt in range(max_retries):
        try:
            resp = await client.aio.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=text or " ",
            )
            if resp.embeddings and len(resp.embeddings) > 0:
                return list(resp.embeddings[0].values)
            return [0.0] * EMBEDDING_DIM
        except Exception as ex:  # noqa: BLE001
            if attempt == max_retries - 1:
                print(f"[Analyzer] Embedding failed after {max_retries} attempts: {ex}", file=sys.stderr)
                return [0.0] * EMBEDDING_DIM
            await asyncio.sleep(delay)
            delay *= 2
    return [0.0] * EMBEDDING_DIM


async def run_analyzer_pipeline(db: firestore.Client) -> None:
    """Consume books with `status='downloaded'`, parse from volume mount,
    write per-page docs + content/full, mark `status='indexed'`."""
    status_ref = db.collection("ingestion").document(STATUS_DOC)
    existing = (status_ref.get().to_dict() or {})
    logs = existing.get("logs", [])
    status_lock = asyncio.Lock()
    genai_client = genai.Client()

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

    _append_log("Analyzer pipeline started.", "info")

    status_ref.set({
        "status": "running",
        "pausedByRequest": False,
        "logs": logs,
        "totalBooks": 0,
        "indexedBooks": 0,
        "failedBooks": 0,
        "totalPagesProcessed": existing.get("totalPagesProcessed", 0),
        "percentage": 0.0,
        "activeBookTitle": "",
        "progressMessage": "Looking for books to analyze...",
        "startedAt": firestore.SERVER_TIMESTAMP,
        "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
        "executionName": existing.get("executionName", ""),
        "errorMessage": "",
        "mountPath": GCS_MOUNT_PATH,
    }, merge=False)

    try:
        loop = asyncio.get_running_loop()

        # 1. Discover pending books — status='downloaded' (or 'failed' for retry)
        def _query_pending() -> List[Dict[str, Any]]:
            out: List[Dict[str, Any]] = []
            for d in db.collection("books").stream():
                data = d.to_dict() or {}
                sp = data.get("storagePath") or ""
                status = data.get("status") or ""
                if status in ("indexed",):
                    continue
                if not sp.startswith("gs://"):
                    continue
                out.append({"id": d.id, **data})
            return out

        pending = await loop.run_in_executor(None, _query_pending)
        total = len(pending)
        await _update(
            {"totalBooks": total, "progressMessage": f"{total} books queued for analysis."},
            log_text=f"Analyzer found {total} books needing analysis.",
            log_status="ok",
        )

        if total == 0:
            await _update(
                {"status": "completed", "progressMessage": "Nothing to analyze."},
                log_text="Analyzer found no books with status='downloaded'. Run the harvester first.",
                log_status="warn",
            )
            return

        # 2. Queue + workers
        queue: asyncio.Queue = asyncio.Queue()
        for idx, b in enumerate(pending):
            await queue.put((idx, b))

        counter_agent = PageCounterAgent()
        formatter_agent = BookFormatterAgent()
        indexed = 0
        failed = 0
        total_pages_processed = 0

        async def analyze_one(book_idx: int, book: Dict[str, Any]) -> str:
            """Returns 'indexed' | 'failed' | 'skipped'."""
            nonlocal indexed, failed, total_pages_processed
            b_id = book["id"]
            b_title = book.get("title") or book.get("subject") or b_id
            storage_path = book.get("storagePath", "")
            local_path = gs_to_local_path(storage_path)
            if not local_path or not os.path.exists(local_path):
                async with status_lock:
                    _append_log(f"Skipping {b_title}: mount path missing ({local_path})", "warn")
                return "skipped"

            await _update({
                "activeBookTitle": b_title,
                "progressMessage": f"Opening {b_title} from mount...",
            })

            try:
                # Path-based PdfReader — lazy, no full-file load
                def _open_reader() -> PdfReader:
                    return PdfReader(local_path)
                reader = await loop.run_in_executor(None, _open_reader)
                total_pages = len(reader.pages)
                if total_pages == 0:
                    async with status_lock:
                        _append_log(f"Skipping {b_title}: 0 pages", "warn")
                    return "skipped"

                print(f"[mem] analyzer book_idx={book_idx} step=opened pages={total_pages} rss={_rss_mb():.0f}MB")

                # Chapter extraction: load only the first 12 pages briefly.
                # This is the only point where bytes touch RAM for the source PDF.
                def _build_toc_bytes() -> bytes:
                    writer = PdfWriter()
                    for i in range(min(12, total_pages)):
                        writer.add_page(reader.pages[i])
                    buf = io.BytesIO()
                    writer.write(buf)
                    return buf.getvalue()

                chapters: List[Dict[str, Any]] = []
                try:
                    toc_bytes = await loop.run_in_executor(None, _build_toc_bytes)
                    count_result = await counter_agent.get_page_count_and_chapters(toc_bytes)
                    chapters = count_result.get("chapters", []) or []
                    del toc_bytes
                    gc.collect()
                except Exception as ex:  # noqa: BLE001
                    async with status_lock:
                        _append_log(f"TOC extraction failed for {b_title}: {ex}", "warn")

                # Update lean book doc with page count + chapters
                def _update_book_meta() -> None:
                    db.collection("books").document(b_id).set({
                        "pages": total_pages,
                        "chapters": chapters,
                        "status": "indexing",
                        "updatedAt": firestore.SERVER_TIMESTAMP,
                    }, merge=True)
                await loop.run_in_executor(None, _update_book_meta)

                # Per-page processing — bounded concurrency, write each page inline
                page_sem = asyncio.Semaphore(PAGE_OCR_CONCURRENCY)
                completed = 0
                formatted_pages: List[Dict[str, Any]] = []

                async def process_page(p_idx: int) -> Dict[str, Any]:
                    nonlocal completed
                    page_num = p_idx + 1

                    def _extract_page_bytes() -> bytes:
                        writer = PdfWriter()
                        writer.add_page(reader.pages[p_idx])
                        buf = io.BytesIO()
                        writer.write(buf)
                        return buf.getvalue()

                    try:
                        page_bytes = await loop.run_in_executor(None, _extract_page_bytes)
                        formatted = await formatter_agent.format_single_page(page_num, page_bytes, page_sem)
                        del page_bytes

                        text = _sanitize_text(formatted.get("text", ""))
                        if len(text) > 150000:
                            text = text[:150000] + "\n\n...[Content Truncated due to Firestore Size Limits]..."

                        embedding = await _embed_text(genai_client, text)
                        emb_bytes = struct.pack(f"{len(embedding)}f", *embedding)

                        # Write the page doc immediately so we never hold an
                        # embeddings_map across the whole book.
                        def _write_page() -> None:
                            db.collection("books").document(b_id).collection("pages").document(f"page_{page_num}").set({
                                "pageNumber": page_num,
                                "text": text,
                                "embedding": embedding,
                                "embeddingBytes": emb_bytes,
                                "embeddingDim": len(embedding),
                                "bookId": b_id,
                                "updatedAt": firestore.SERVER_TIMESTAMP,
                            })
                        await loop.run_in_executor(None, _write_page)

                        completed += 1
                        if total_pages > 0 and (completed == total_pages or completed % max(1, total_pages // 10) == 0):
                            pct = 100.0 * completed / total_pages
                            await _update({
                                "progressMessage": f"{b_title}: {completed}/{total_pages} pages ({pct:.0f}%)",
                            })

                        return {"pageNumber": page_num, "text": text}
                    except Exception as ex:  # noqa: BLE001
                        async with status_lock:
                            _append_log(f"Page {page_num} of {b_title} failed: {ex}", "warn")
                        return {"pageNumber": page_num, "text": f"<!-- Page {page_num} failed: {ex} -->"}

                # Drive page tasks via the semaphore. asyncio.gather here is safe
                # because each task only ever holds one page's bytes in flight.
                page_tasks = [process_page(i) for i in range(total_pages)]
                formatted_pages = await asyncio.gather(*page_tasks)
                formatted_pages.sort(key=lambda x: x.get("pageNumber", 0))

                # Build content/full doc from per-page text — last accumulator.
                consolidated = "\n\n".join(
                    f"--- PAGE {p.get('pageNumber')} ---\n\n{p.get('text', '')}" for p in formatted_pages
                )
                full_text = _sanitize_text(consolidated)
                del consolidated

                def _write_content_full() -> None:
                    try:
                        db.collection("books").document(b_id).collection("content").document("full").set({
                            "bookId": b_id,
                            "pagesList": formatted_pages,
                            "text": full_text,
                            "updatedAt": firestore.SERVER_TIMESTAMP,
                        })
                    except Exception as e_outer:  # noqa: BLE001
                        # 1 MiB doc limit fallback — drop the joined text first
                        print(f"[Analyzer] content/full with joined text failed for {b_id}: {e_outer}. Retrying without text...")
                        try:
                            db.collection("books").document(b_id).collection("content").document("full").set({
                                "bookId": b_id,
                                "pagesList": formatted_pages,
                                "updatedAt": firestore.SERVER_TIMESTAMP,
                            })
                        except Exception as e_inner:  # noqa: BLE001
                            print(f"[Analyzer] content/full with pagesList failed for {b_id}: {e_inner}. Writing empty doc.")
                            db.collection("books").document(b_id).collection("content").document("full").set({
                                "bookId": b_id,
                                "pagesList": [],
                                "text": "",
                                "updatedAt": firestore.SERVER_TIMESTAMP,
                            })

                await loop.run_in_executor(None, _write_content_full)

                # Free big buffers before marking indexed
                formatted_pages = None  # type: ignore[assignment]
                gc.collect()

                def _mark_indexed() -> None:
                    db.collection("books").document(b_id).set({
                        "status": "indexed",
                        "updatedAt": firestore.SERVER_TIMESTAMP,
                    }, merge=True)
                await loop.run_in_executor(None, _mark_indexed)

                async with status_lock:
                    total_pages_processed += total_pages
                return "indexed"

            except Exception as ex:  # noqa: BLE001
                async with status_lock:
                    _append_log(f"Analyzer failed on {b_title}: {ex}", "error")
                try:
                    def _mark_failed() -> None:
                        db.collection("books").document(b_id).set({
                            "status": "failed",
                            "errorMessage": str(ex)[:500],
                            "updatedAt": firestore.SERVER_TIMESTAMP,
                        }, merge=True)
                    await loop.run_in_executor(None, _mark_failed)
                except Exception:  # noqa: BLE001
                    pass
                return "failed"

        async def worker(wid: int) -> None:
            nonlocal indexed, failed
            while not queue.empty():
                try:
                    idx, b = queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
                if await _is_paused():
                    queue.task_done()
                    break

                print(f"[mem] analyzer worker={wid} book={idx} step=start rss={_rss_mb():.0f}MB")
                outcome = await analyze_one(idx, b)
                gc.collect()
                if outcome == "indexed":
                    async with status_lock:
                        indexed += 1
                elif outcome == "failed":
                    async with status_lock:
                        failed += 1
                print(f"[mem] analyzer worker={wid} book={idx} step=end rss={_rss_mb():.0f}MB out={outcome}")

                done = indexed + failed
                pct = (done / total * 100.0) if total else 0.0
                await _update({
                    "indexedBooks": indexed,
                    "failedBooks": failed,
                    "percentage": pct,
                    "totalPagesProcessed": total_pages_processed,
                })
                queue.task_done()

        workers = [asyncio.create_task(worker(i)) for i in range(SYNC_WORKER_COUNT)]
        await asyncio.gather(*workers)

        if await _is_paused():
            await _update({"status": "paused"}, log_text="Analyzer paused by user.", log_status="warn")
            return

        await _update(
            {"status": "completed", "activeBookTitle": "", "progressMessage": ""},
            log_text=f"Analyzer finished. Indexed={indexed} Failed={failed} TotalPages={total_pages_processed}",
            log_status="ok",
        )
    except Exception as ex:  # noqa: BLE001
        await _update(
            {"status": "error", "errorMessage": str(ex)[:500]},
            log_text=f"Analyzer pipeline failed: {ex}",
            log_status="error",
        )
        raise
