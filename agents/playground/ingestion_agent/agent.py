"""Ingestion Orchestrator Agent — coordinates scraping, videos, page counting, formatting, and indexing."""
from __future__ import annotations

import os
from typing import Dict, Any, Optional
import sys
import json
import httpx
import asyncio
import hashlib
import re
import urllib.parse
from datetime import datetime, timezone
import io
import time
import gc

from google.adk.agents.llm_agent import Agent
from google.cloud import firestore
from google.cloud import storage
from pypdf import PdfReader, PdfWriter

from ingestion_agent.crawler import CrawlerAgent
from ingestion_agent.video_extractor import VideoExtractorAgent
from ingestion_agent.counter import PageCounterAgent
from ingestion_agent.formatter import BookFormatterAgent
from ingestion_agent.indexer import StorageIndexerAgent

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except AttributeError:
    pass

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
GCS_BUCKET = os.getenv("GCS_BUCKET", "khsosy.firebasestorage.app")

# Cleanup helpers for paths
def clean_path_segment(seg: str) -> str:
    for c in ["?", "*", ":", "|", "\"", "<", ">", "\\"]:
        seg = seg.replace(c, "")
    return seg.strip()

def get_book_id(gov_url: str, subject: str = "book") -> str:
    """Build a stable, COLLISION-FREE id from the gov URL."""
    short_hash = hashlib.md5(gov_url.encode("utf-8")).hexdigest()[:8]
    try:
        path = urllib.parse.urlparse(gov_url).path
        filename = path.split('/')[-1]
        name_without_ext = filename.rsplit('.', 1)[0]

        year_match = re.search(r'/(\d{4})/', gov_url)
        year = year_match.group(1) if year_match else "2026"

        lang = "ar"
        sub_lower = subject.lower()
        filename_lower = name_without_ext.lower()
        if "english" in sub_lower or "الانجليزية" in sub_lower or "_en_" in filename_lower or filename_lower.endswith("_en") or "english" in filename_lower:
            lang = "en"
        elif "french" in sub_lower or "الفرنسية" in sub_lower or "_fr_" in filename_lower or "_f_" in filename_lower or filename_lower.endswith("_fr") or filename_lower.endswith("_f") or "french" in filename_lower:
            lang = "fr"
        elif "deutsch" in sub_lower or "الالمانية" in sub_lower or "german" in sub_lower:
            lang = "de"
        elif "italiano" in sub_lower or "الايطالية" in sub_lower or "italian" in sub_lower:
            lang = "it"
        elif "español" in sub_lower or "الاسبانية" in sub_lower or "spanish" in sub_lower:
            lang = "es"

        clean_name = name_without_ext
        clean_name = re.sub(r'_(FR|AR|EN|F|E|ARABIC|FRENCH|ENGLISH)(?=\b|_)', '', clean_name, flags=re.IGNORECASE)
        clean_name = re.sub(r'_(prim\d+|prepratory\d+|sec\d+|prep\d+|\d+secondary|\d+prep|\d+prim|\d+|kg\d+|secondary\d+)(?=\b|_)', '', clean_name, flags=re.IGNORECASE)
        clean_name = re.sub(r'_(TR\d+|Term\d+|T\d+|TR1_2|Tr2|Tr1)(?=\b|_)', '', clean_name, flags=re.IGNORECASE)
        clean_name = re.sub(r'_(Secondary|Preparatory|Primary|Prepratory|KG|SB|WB|STORY|Notebook)(?=\b|_)', '', clean_name, flags=re.IGNORECASE)
        clean_name = clean_name.replace('_', '-').strip('-')
        if not clean_name:
            clean_name = "book"
        return f"{clean_name.lower()}-{lang}-{year}-{short_hash}"
    except Exception:
        return short_hash

async def download_pdf(url: str) -> bytes:
    headers = {'User-Agent': 'Mozilla/5.0'}
    async with httpx.AsyncClient(timeout=45.0) as client:
        res = await client.get(url, headers=headers, follow_redirects=True)
        res.raise_for_status()
        return res.content

def filter_status_maps(tasks_map: dict, books_list: dict) -> tuple[dict, dict]:
    """Filter tasks and booksList maps to avoid Firestore 1MB document size limits.
    
    We only keep:
      - 'crawler' and 'video_extractor' tasks
      - Any task that is currently 'running' or 'failed'
      - The most recent completed tasks, capped to a small number (e.g. 10)
      - We exclude 'queued' tasks entirely from the written document.
    """
    filtered_tasks = {}
    filtered_books = {}
    
    # 1. Always keep crawler and video_extractor
    for key in ["crawler", "video_extractor"]:
        if key in tasks_map:
            filtered_tasks[key] = tasks_map[key]
            
    # 2. Find active, failed, and completed book tasks
    active_keys = []
    completed_keys = []
    
    for key, task in tasks_map.items():
        if key in ["crawler", "video_extractor"]:
            continue
        if task.get("status") in ["running", "failed"]:
            active_keys.append(key)
        elif task.get("status") == "completed":
            completed_keys.append(key)
            
    # 3. Take all active keys, plus the last 10 completed ones
    show_keys = active_keys + completed_keys[-10:]
    
    for key in show_keys:
        filtered_tasks[key] = tasks_map[key]
        b_id = key.replace("book_", "")
        if b_id in books_list:
            filtered_books[b_id] = books_list[b_id]
            
    return filtered_tasks, filtered_books

async def run_sync_pipeline(
    db: firestore.Client,
    storage_client: storage.Client,
    bucket_name: str
) -> None:
    status_ref = db.collection("ingestion").document("status")
    
    # Read existing status to preserve executionName, totalPagesProcessed, etc.
    status_doc = status_ref.get()
    status_data = status_doc.to_dict() or {}
    
    logs = status_data.get("logs", [])
    
    status_lock = asyncio.Lock()

    _cached_status = None
    _cached_status_time = 0.0

    def append_log_sync(text: str, status: str = "info") -> None:
        """Helper to append log synchronously (only safe for sequential phase)."""
        logs.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "text": text,
            "status": status,
            "agent": "IngestionOrchestrator"
        })
        if len(logs) > 120:
            logs.pop(0)

    async def update_status_safe(updates: Dict[str, Any], log_text: Optional[str] = None, log_status: str = "info"):
        nonlocal _cached_status, _cached_status_time
        async with status_lock:
            if log_text:
                logs.append({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "text": log_text,
                    "status": log_status,
                    "agent": "IngestionOrchestrator"
                })
                if len(logs) > 120:
                    logs.pop(0)
            if "logs" not in updates:
                updates["logs"] = logs
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, lambda: status_ref.update(updates))
            _cached_status = None
            _cached_status_time = 0.0

    async def get_status_safe() -> Dict[str, Any]:
        async with status_lock:
            loop = asyncio.get_running_loop()
            status_doc = await loop.run_in_executor(None, status_ref.get)
            return status_doc.to_dict() or {}

    async def get_status_safe_cached() -> Dict[str, Any]:
        nonlocal _cached_status, _cached_status_time
        now = time.time()
        if _cached_status is not None and (now - _cached_status_time) < 5.0:
            return _cached_status
        async with status_lock:
            now = time.time()
            if _cached_status is not None and (now - _cached_status_time) < 5.0:
                return _cached_status
            loop = asyncio.get_running_loop()
            status_doc = await loop.run_in_executor(None, status_ref.get)
            _cached_status = status_doc.to_dict() or {}
            _cached_status_time = now
            return _cached_status

    append_log_sync("Sync pipeline started. Stage 1: Crawling website and discovering resources...", "info")
    
    # 1. Update status to 'running' and clear old booksList to prevent size errors
    status_ref.set({
        "status": "running",
        "pausedByRequest": False,
        "logs": logs,
        "totalTasks": 2, # initially crawler + video scraper
        "completedTasks": 0,
        "progressPercentage": 0,
        "tasks": {
            "crawler": {"name": "Crawling MOE Portal", "status": "running", "progress": 20},
            "video_extractor": {"name": "Scraping Video Catalog", "status": "queued", "progress": 0}
        },
        # Legacy compatibility fields:
        "totalBooks": 0,
        "downloadedBooks": 0,
        "parsedBooks": 0,
        "totalPagesProcessed": status_data.get("totalPagesProcessed", 0),
        "progressMessage": "Crawling portal...",
        "percentage": 0.0,
        "activeBookId": "",
        "activeBookTitle": "",
        "booksList": {},
        "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
        "executionName": status_data.get("executionName", ""),
    }, merge=False)

    try:
        # Step 1: Crawl Books
        crawler = CrawlerAgent()
        catalog = await crawler.run()
        total_books = len(catalog)
        
        await update_status_safe({
            "tasks.crawler.status": "completed",
            "tasks.crawler.progress": 100
        }, log_text=f"Crawler discovered {total_books} unique book/PDF resources.", log_status="ok")

        # Step 2: Scrape Videos
        await update_status_safe({
            "tasks.video_extractor.status": "running",
            "tasks.video_extractor.progress": 30,
            "progressMessage": "Scraping videos..."
        }, log_text="Stage 2: Scraping and indexing educational videos...", log_status="info")
        
        video_extractor = VideoExtractorAgent(db)
        videos_extracted = await video_extractor.run()
        
        await update_status_safe({
            "tasks.video_extractor.status": "completed",
            "tasks.video_extractor.progress": 100
        }, log_text=f"Video Extractor saved {len(videos_extracted)} educational videos to Firestore.", log_status="ok")

        # Step 3: Initialize granular tasks for all books
        total_tasks = total_books + 2
        tasks_map = {
            "crawler": {"name": "Crawling MOE Portal", "status": "completed", "progress": 100},
            "video_extractor": {"name": "Scraping Video Catalog", "status": "completed", "progress": 100}
        }
        
        # Load existing indexed books to support resuming
        loop = asyncio.get_running_loop()
        def get_indexed_books():
            docs = db.collection("books").where("status", "==", "indexed").stream()
            return {doc.id for doc in docs if (doc.to_dict() or {}).get("pages", 0) > 0}
        indexed_book_ids = await loop.run_in_executor(None, get_indexed_books)

        legacy_books_list = {}
        
        for idx, book in enumerate(catalog):
            gov_url = book["link"]
            b_id = get_book_id(gov_url, book.get("subject", "book"))
            b_title = book.get("subject", "Unknown Book")
            grade = book.get("grade", "General")
            
            task_id = f"book_{b_id}"
            is_done = b_id in indexed_book_ids
            
            tasks_map[task_id] = {
                "name": f"Book: {b_title} ({grade})",
                "status": "completed" if is_done else "queued",
                "progress": 100 if is_done else 0
            }
            
            # Legacy booksList support
            if b_id not in legacy_books_list:
                legacy_books_list[b_id] = {
                    "id": b_id,
                    "title": b_title,
                    "stage": book.get("stage", ""),
                    "grade": grade,
                    "term": book.get("term", ""),
                    "type": book.get("type", ""),
                    "status": "completed" if is_done else "queued",
                    "progress": 100 if is_done else 0,
                    "govUrl": gov_url
                }
            elif is_done:
                legacy_books_list[b_id]["status"] = "completed"
                legacy_books_list[b_id]["progress"] = 100

        completed_tasks = len([t for t in tasks_map.values() if t["status"] == "completed"])
        progress_percentage = int((completed_tasks / total_tasks) * 100)

        filtered_tasks, filtered_books = filter_status_maps(tasks_map, legacy_books_list)
        
        await update_status_safe({
            "totalTasks": total_tasks,
            "completedTasks": completed_tasks,
            "progressPercentage": progress_percentage,
            "tasks": filtered_tasks,
            # Legacy compatibility:
            "totalBooks": total_books,
            "downloadedBooks": len([b for b in legacy_books_list.values() if b.get("status") == "completed"]),
            "parsedBooks": len([b for b in legacy_books_list.values() if b.get("status") == "completed"]),
            "percentage": float(progress_percentage),
            "booksList": filtered_books
        })

        indexer = StorageIndexerAgent(db, storage_client, bucket_name)
        counter_agent = PageCounterAgent()
        formatter_agent = BookFormatterAgent()

        async def process_single_book(book_idx: int, book_data: Dict[str, Any]):
            gov_url = book_data["link"]
            b_id = get_book_id(gov_url, book_data.get("subject", "book"))
            b_title = book_data.get("subject", "Unknown Book")
            grade = book_data.get("grade", "General")
            task_key = f"book_{b_id}"

            # Check if user requested pause
            curr_status = await get_status_safe_cached()
            if curr_status.get("pausedByRequest") or curr_status.get("status") == "paused":
                return

            # Check if already completed
            if tasks_map[task_key]["status"] == "completed":
                return

            # Update book progress to running
            async with status_lock:
                tasks_map[task_key]["status"] = "running"
                tasks_map[task_key]["progress"] = 10
                legacy_books_list[b_id]["status"] = "downloading"
                legacy_books_list[b_id]["progress"] = 10
                
                logs.append({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "text": f"Processing book {book_idx+1}/{total_books}: {b_title} ({grade})",
                    "status": "info",
                    "agent": "IngestionOrchestrator"
                })
                if len(logs) > 120:
                    logs.pop(0)
                
                filtered_tasks, filtered_books = filter_status_maps(tasks_map, legacy_books_list)
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, lambda: status_ref.update({
                    "activeBookId": b_id,
                    "activeBookTitle": b_title,
                    "progressMessage": f"Downloading {b_title}...",
                    "tasks": filtered_tasks,
                    "booksList": filtered_books,
                    "logs": logs,
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                }))

            try:
                # 1. Download PDF
                pdf_bytes = await download_pdf(gov_url)
                
                # Check for pause
                curr_status = await get_status_safe_cached()
                if curr_status.get("pausedByRequest") or curr_status.get("status") == "paused":
                    return

                async with status_lock:
                    tasks_map[task_key]["progress"] = 30
                    legacy_books_list[b_id]["status"] = "counting"
                    legacy_books_list[b_id]["progress"] = 30
                    filtered_tasks, filtered_books = filter_status_maps(tasks_map, legacy_books_list)
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, lambda: status_ref.update({
                        "progressMessage": f"Analyzing pages & chapters for {b_title}...",
                        "tasks": filtered_tasks,
                        "booksList": filtered_books,
                        "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                    }))

                # 2. Count pages & extract chapters
                count_results = await counter_agent.get_page_count_and_chapters(pdf_bytes)
                total_pages = count_results.get("pageCount", 0)
                chapters_list = count_results.get("chapters", [])
                
                # Check for pause
                curr_status = await get_status_safe_cached()
                if curr_status.get("pausedByRequest") or curr_status.get("status") == "paused":
                    return

                async with status_lock:
                    tasks_map[task_key]["progress"] = 40
                    legacy_books_list[b_id]["status"] = "uploading"
                    legacy_books_list[b_id]["progress"] = 40
                    filtered_tasks, filtered_books = filter_status_maps(tasks_map, legacy_books_list)
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, lambda: status_ref.update({
                        "progressMessage": f"Uploading original PDF: {b_title}...",
                        "tasks": filtered_tasks,
                        "booksList": filtered_books,
                        "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                    }))

                # 3. Upload to GCS
                stage_c = clean_path_segment(book_data.get("stage", "Other"))
                grade_c = clean_path_segment(book_data.get("grade", "Other"))
                term_c = clean_path_segment(book_data.get("term", "Other"))
                sub_c = clean_path_segment(book_data.get("subject", "Other"))
                type_c = clean_path_segment(book_data.get("type", "Other"))
                
                filename = os.path.basename(gov_url)
                if not filename.endswith(".pdf"):
                    filename = f"{sub_c}_{type_c}.pdf"
                filename = clean_path_segment(filename)
                destination_blob = f"moe-textbooks/{stage_c}/{grade_c}/{term_c}/{sub_c}/{type_c}/{filename}"
                
                loop = asyncio.get_running_loop()
                gcs_uri = await loop.run_in_executor(None, indexer.upload_pdf, pdf_bytes, destination_blob)

                # Check for pause
                curr_status = await get_status_safe_cached()
                if curr_status.get("pausedByRequest") or curr_status.get("status") == "paused":
                    return

                async with status_lock:
                    tasks_map[task_key]["progress"] = 50
                    legacy_books_list[b_id]["status"] = "parsing"
                    legacy_books_list[b_id]["progress"] = 50
                    filtered_tasks, filtered_books = filter_status_maps(tasks_map, legacy_books_list)
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, lambda: status_ref.update({
                        "progressMessage": f"Formatting {total_pages} pages for {b_title}...",
                        "tasks": filtered_tasks,
                        "booksList": filtered_books,
                        "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                    }))

                # 4. Split PDF locally and format each page in parallel
                reader = PdfReader(io.BytesIO(pdf_bytes))
                
                # Split pages locally
                page_data_list = []
                for p_idx in range(total_pages):
                    writer = PdfWriter()
                    writer.add_page(reader.pages[p_idx])
                    page_io = io.BytesIO()
                    writer.write(page_io)
                    page_bytes = page_io.getvalue()
                    page_data_list.append((p_idx + 1, page_bytes))

                page_semaphore = asyncio.Semaphore(5)
                completed_count = 0
                async def format_and_track(page_num, page_bytes):
                    nonlocal completed_count
                    res = await formatter_agent.format_single_page(page_num, page_bytes, page_semaphore)
                    async with status_lock:
                        completed_count += 1
                        if total_pages > 0:
                            prog = 50 + int((completed_count / total_pages) * 30)
                            if completed_count == total_pages or completed_count % max(1, total_pages // 10) == 0:
                                tasks_map[task_key]["progress"] = prog
                                legacy_books_list[b_id]["progress"] = prog
                                filtered_tasks, filtered_books = filter_status_maps(tasks_map, legacy_books_list)
                                loop = asyncio.get_running_loop()
                                await loop.run_in_executor(None, lambda: status_ref.update({
                                    "progressMessage": f"Formatting page {completed_count}/{total_pages} for {b_title}...",
                                    "tasks": filtered_tasks,
                                    "booksList": filtered_books,
                                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                                }))
                    return res

                page_tasks = [format_and_track(p_num, p_bytes) for p_num, p_bytes in page_data_list]
                formatted_pages = await asyncio.gather(*page_tasks)
                formatted_pages.sort(key=lambda x: x["pageNumber"])

                # Check for pause
                curr_status = await get_status_safe_cached()
                if curr_status.get("pausedByRequest") or curr_status.get("status") == "paused":
                    return

                async with status_lock:
                    tasks_map[task_key]["progress"] = 80
                    legacy_books_list[b_id]["status"] = "indexing"
                    legacy_books_list[b_id]["progress"] = 80
                    filtered_tasks, filtered_books = filter_status_maps(tasks_map, legacy_books_list)
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, lambda: status_ref.update({
                        "progressMessage": f"Indexing full document and generating search embeddings...",
                        "tasks": filtered_tasks,
                        "booksList": filtered_books,
                        "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                    }))

                # 5. Index to Firestore
                lang_code = "ar"
                sub_lower = b_title.lower()
                if "english" in sub_lower or "الانجليزية" in sub_lower:
                    lang_code = "en"
                elif "french" in sub_lower or "الفرنسية" in sub_lower:
                    lang_code = "fr"
                
                year_match = re.search(r'/(\d{4})/', gov_url)
                year_val = int(year_match.group(1)) if year_match else 2026

                book_metadata = {
                    "id": b_id,
                    "title": b_title,
                    "stage": book_data.get("stage", ""),
                    "grade": book_data.get("grade", ""),
                    "term": book_data.get("term", ""),
                    "subject": book_data.get("subject", ""),
                    "type": book_data.get("type", "Student Book"),
                    "language": lang_code,
                    "year": year_val,
                    "govUrl": gov_url,
                    "gcsUri": gcs_uri,
                    "chapters": chapters_list
                }
                
                async def index_progress_callback(prog_val: int):
                    async with status_lock:
                        tasks_map[task_key]["progress"] = prog_val
                        legacy_books_list[b_id]["progress"] = prog_val
                        filtered_tasks, filtered_books = filter_status_maps(tasks_map, legacy_books_list)
                        loop = asyncio.get_running_loop()
                        await loop.run_in_executor(None, lambda: status_ref.update({
                            "progressMessage": f"Indexing and generating search embeddings ({prog_val}%)...",
                            "tasks": filtered_tasks,
                            "booksList": filtered_books,
                            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                        }))

                await indexer.index_book(b_id, book_metadata, formatted_pages, progress_callback=index_progress_callback)

                # Completed!
                async with status_lock:
                    tasks_map[task_key]["status"] = "completed"
                    tasks_map[task_key]["progress"] = 100
                    legacy_books_list[b_id]["status"] = "completed"
                    legacy_books_list[b_id]["progress"] = 100
                    
                    logs.append({
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "text": f"Successfully processed and indexed: {b_title}!",
                        "status": "ok",
                        "agent": "IngestionOrchestrator"
                    })
                    if len(logs) > 120:
                        logs.pop(0)
                    
                    # Fetch fresh status to update stats
                    loop = asyncio.get_running_loop()
                    curr_status_doc = await loop.run_in_executor(None, status_ref.get)
                    curr_status = curr_status_doc.to_dict() or {}
                    completed_count = len([t for t in tasks_map.values() if t["status"] == "completed"])
                    progress_percentage = int((completed_count / total_tasks) * 100)
                    total_pages_processed = curr_status.get("totalPagesProcessed", 0) + total_pages

                    filtered_tasks, filtered_books = filter_status_maps(tasks_map, legacy_books_list)
                    await loop.run_in_executor(None, lambda: status_ref.update({
                        "completedTasks": completed_count,
                        "progressPercentage": progress_percentage,
                        "downloadedBooks": len([b for b in legacy_books_list.values() if b.get("status") == "completed"]),
                        "parsedBooks": len([b for b in legacy_books_list.values() if b.get("status") == "completed"]),
                        "totalPagesProcessed": total_pages_processed,
                        "percentage": float(progress_percentage),
                        "tasks": filtered_tasks,
                        "booksList": filtered_books,
                        "logs": logs,
                        "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                    }))

            except Exception as e:
                async with status_lock:
                    logs.append({
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "text": f"Failed to process book {b_title}: {e}",
                        "status": "error",
                        "agent": "IngestionOrchestrator"
                    })
                    if len(logs) > 120:
                        logs.pop(0)
                    tasks_map[task_key]["status"] = "failed"
                    tasks_map[task_key]["progress"] = 0
                    tasks_map[task_key]["errorMessage"] = str(e)
                    legacy_books_list[b_id]["status"] = "failed"
                    legacy_books_list[b_id]["progress"] = 0
                    
                    filtered_tasks, filtered_books = filter_status_maps(tasks_map, legacy_books_list)
                    loop = asyncio.get_running_loop()
                    def _update_firestore_on_error():
                        # Update status document
                        status_ref.update({
                            "tasks": filtered_tasks,
                            "booksList": filtered_books,
                            "logs": logs,
                            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                        })
                        # Update specific book document to failed
                        db.collection("books").document(b_id).set({
                            "id": b_id,
                            "title": b_title,
                            "stage": book_data.get("stage", ""),
                            "grade": grade,
                            "term": book_data.get("term", ""),
                            "subject": book_data.get("subject", ""),
                            "type": book_data.get("type", "Student Book"),
                            "govUrl": gov_url,
                            "status": "failed",
                            "errorMessage": str(e),
                            "updatedAt": firestore.SERVER_TIMESTAMP
                        }, merge=True)
                    await loop.run_in_executor(None, _update_firestore_on_error)

        # Queue-based execution pool limit to 3 books in parallel.
        # This keeps memory down and handles resume skipping instantly without I/O.
        queue = asyncio.Queue()
        for idx, book_data in enumerate(catalog):
            await queue.put((idx, book_data))

        async def worker_loop():
            while not queue.empty():
                try:
                    idx, book_data = queue.get_nowait()
                except asyncio.QueueEmpty:
                    break

                gov_url = book_data["link"]
                b_id = get_book_id(gov_url, book_data.get("subject", "book"))
                
                # Check skip condition BEFORE doing any Firestore reads
                if b_id in indexed_book_ids:
                    queue.task_done()
                    continue

                # Check pause status using cached status to avoid hitting rate limits
                curr_status = await get_status_safe_cached()
                if curr_status.get("pausedByRequest") or curr_status.get("status") == "paused":
                    queue.task_done()
                    break

                try:
                    await process_single_book(idx, book_data)
                except Exception as ex:
                    print(f"Error in worker_loop processing book {idx}: {ex}")
                finally:
                    # Clean up memory aggressively
                    gc.collect()
                    queue.task_done()

        # Run exactly 3 worker tasks in parallel
        worker_tasks = [asyncio.create_task(worker_loop()) for _ in range(3)]
        await asyncio.gather(*worker_tasks)

        # Check final status
        final_status = await get_status_safe()
        if final_status.get("pausedByRequest") or final_status.get("status") == "paused":
            await update_status_safe({
                "status": "paused",
                "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
            }, log_text="Sync pipeline paused by user request.", log_status="warn")
            return

        # Mark final status as completed
        await update_status_safe({
            "status": "completed",
            "activeBookId": "",
            "activeBookTitle": "",
            "progressMessage": "",
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
        }, log_text="Multi-Agent Textbook Sync completed successfully!", log_status="ok")

    except Exception as general_err:
        await update_status_safe({
            "status": "error",
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            "errorMessage": str(general_err)[:500]
        }, log_text=f"Sync pipeline failed with error: {general_err}", log_status="error")

# Define the ADK Agent (legacy compatibility, though we run via sync_job_main.py)
INSTRUCTION = """\
You are the Ingestion Orchestrator Agent.
Your role is to crawl the MOE portal, scrape all curriculum PDFs and videos, format them with vision models, and index them into Firestore.
"""

root_agent = Agent(
    model=MODEL,
    name="ingestion_orchestrator",
    description="Orchestrator for scraping, formatting, and search indexing MOE textbooks.",
    instruction=INSTRUCTION
)
