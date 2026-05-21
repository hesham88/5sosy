"""Ingestion Orchestrator Agent — coordinates scraping, videos, page counting, formatting, and indexing."""
from __future__ import annotations

import os
import sys
import json
import httpx
import asyncio
import hashlib
import re
import urllib.parse
from datetime import datetime, timezone
import io

from google.adk.agents.llm_agent import Agent
from google.cloud import firestore
from google.cloud import storage

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

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
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
    
    def append_log(text: str, status: str = "info") -> None:
        logs.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "text": text,
            "status": status,
            "agent": "IngestionOrchestrator"
        })
        # Keep logs within last 120 lines
        if len(logs) > 120:
            logs.pop(0)

    append_log("Sync pipeline started. Stage 1: Crawling website and discovering resources...", "info")
    
    # 1. Update status to 'running'
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
        "booksList": status_data.get("booksList", {}),
        "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
        "executionName": status_data.get("executionName", ""),
    }, merge=True)

    try:
        # Step 1: Crawl Books
        crawler = CrawlerAgent()
        catalog = await crawler.run()
        total_books = len(catalog)
        append_log(f"Crawler discovered {total_books} unique book/PDF resources.", "ok")
        
        status_ref.update({
            "tasks.crawler.status": "completed",
            "tasks.crawler.progress": 100,
            "logs": logs
        })

        # Step 2: Scrape Videos
        append_log("Stage 2: Scraping and indexing educational videos...", "info")
        status_ref.update({
            "tasks.video_extractor.status": "running",
            "tasks.video_extractor.progress": 30,
            "progressMessage": "Scraping videos..."
        })
        
        video_extractor = VideoExtractorAgent(db)
        videos_extracted = await video_extractor.run()
        append_log(f"Video Extractor saved {len(videos_extracted)} educational videos to Firestore.", "ok")
        
        status_ref.update({
            "tasks.video_extractor.status": "completed",
            "tasks.video_extractor.progress": 100,
            "logs": logs
        })

        # Step 3: Initialize granular tasks for all books
        total_tasks = total_books + 2
        tasks_map = {
            "crawler": {"name": "Crawling MOE Portal", "status": "completed", "progress": 100},
            "video_extractor": {"name": "Scraping Video Catalog", "status": "completed", "progress": 100}
        }
        
        # Load existing indexed books to support resuming
        indexed_book_ids = set()
        for doc in db.collection("books").stream():
            data = doc.to_dict() or {}
            if data.get("status") == "indexed" and (data.get("pages") or 0) > 0:
                indexed_book_ids.add(doc.id)

        legacy_books_list = status_data.get("booksList", {})
        
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

        status_ref.update({
            "totalTasks": total_tasks,
            "completedTasks": completed_tasks,
            "progressPercentage": progress_percentage,
            "tasks": tasks_map,
            # Legacy compatibility:
            "totalBooks": total_books,
            "downloadedBooks": len([b for b in legacy_books_list.values() if b.get("status") == "completed"]),
            "parsedBooks": len([b for b in legacy_books_list.values() if b.get("status") == "completed"]),
            "percentage": float(progress_percentage),
            "booksList": legacy_books_list,
            "logs": logs
        })

        # Concurrency limit for running parallel book ingestion pipelines
        semaphore = asyncio.Semaphore(3)
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
            curr_status = status_ref.get().to_dict() or {}
            if curr_status.get("pausedByRequest") or curr_status.get("status") == "paused":
                return

            # Check if already completed
            if tasks_map[task_key]["status"] == "completed":
                return

            # Update book progress to running
            tasks_map[task_key]["status"] = "running"
            tasks_map[task_key]["progress"] = 10
            legacy_books_list[b_id]["status"] = "downloading"
            legacy_books_list[b_id]["progress"] = 10
            
            append_log(f"Processing book {book_idx+1}/{total_books}: {b_title} ({grade})", "info")
            
            status_ref.update({
                "activeBookId": b_id,
                "activeBookTitle": b_title,
                "progressMessage": f"Downloading {b_title}...",
                f"tasks.{task_key}": tasks_map[task_key],
                f"booksList.{b_id}": legacy_books_list[b_id],
                "logs": logs,
                "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
            })

            try:
                # 1. Download PDF
                pdf_bytes = await download_pdf(gov_url)
                
                # Check for pause
                curr_status = status_ref.get().to_dict() or {}
                if curr_status.get("pausedByRequest") or curr_status.get("status") == "paused":
                    return

                tasks_map[task_key]["progress"] = 30
                legacy_books_list[b_id]["status"] = "counting"
                legacy_books_list[b_id]["progress"] = 30
                status_ref.update({
                    "progressMessage": f"Analyzing pages & chapters for {b_title}...",
                    f"tasks.{task_key}": tasks_map[task_key],
                    f"booksList.{b_id}": legacy_books_list[b_id],
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                })

                # 2. Count pages & extract chapters
                count_results = await counter_agent.get_page_count_and_chapters(pdf_bytes)
                total_pages = count_results.get("pageCount", 0)
                chapters_list = count_results.get("chapters", [])
                
                # Check for pause
                curr_status = status_ref.get().to_dict() or {}
                if curr_status.get("pausedByRequest") or curr_status.get("status") == "paused":
                    return

                tasks_map[task_key]["progress"] = 40
                legacy_books_list[b_id]["status"] = "uploading"
                legacy_books_list[b_id]["progress"] = 40
                status_ref.update({
                    "progressMessage": f"Uploading original PDF: {b_title}...",
                    f"tasks.{task_key}": tasks_map[task_key],
                    f"booksList.{b_id}": legacy_books_list[b_id],
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                })

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
                
                gcs_uri = indexer.upload_pdf(pdf_bytes, destination_blob)

                # Check for pause
                curr_status = status_ref.get().to_dict() or {}
                if curr_status.get("pausedByRequest") or curr_status.get("status") == "paused":
                    return

                tasks_map[task_key]["progress"] = 50
                legacy_books_list[b_id]["status"] = "parsing"
                legacy_books_list[b_id]["progress"] = 50
                status_ref.update({
                    "progressMessage": f"Formatting {total_pages} pages for {b_title}...",
                    f"tasks.{task_key}": tasks_map[task_key],
                    f"booksList.{b_id}": legacy_books_list[b_id],
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                })

                # 4. Split PDF locally and format each page in parallel
                reader = PdfReader(io.BytesIO(pdf_bytes))
                
                # Split pages locally
                page_tasks = []
                for p_idx in range(total_pages):
                    page_num = p_idx + 1
                    writer = PdfWriter()
                    writer.add_page(reader.pages[p_idx])
                    
                    page_io = io.BytesIO()
                    writer.write(page_io)
                    page_bytes = page_io.getvalue()
                    
                    # Concurrently format pages
                    t = formatter_agent.format_single_page(page_num, page_bytes, semaphore)
                    page_tasks.append(t)

                formatted_pages = await asyncio.gather(*page_tasks)
                formatted_pages.sort(key=lambda x: x["pageNumber"])

                # Check for pause
                curr_status = status_ref.get().to_dict() or {}
                if curr_status.get("pausedByRequest") or curr_status.get("status") == "paused":
                    return

                tasks_map[task_key]["progress"] = 80
                legacy_books_list[b_id]["status"] = "indexing"
                legacy_books_list[b_id]["progress"] = 80
                status_ref.update({
                    "progressMessage": f"Indexing full document and generating search embeddings...",
                    f"tasks.{task_key}": tasks_map[task_key],
                    f"booksList.{b_id}": legacy_books_list[b_id],
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                })

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
                
                await indexer.index_book(b_id, book_metadata, formatted_pages)

                # Completed!
                tasks_map[task_key]["status"] = "completed"
                tasks_map[task_key]["progress"] = 100
                legacy_books_list[b_id]["status"] = "completed"
                legacy_books_list[b_id]["progress"] = 100
                
                append_log(f"Successfully processed and indexed: {b_title}!", "ok")
                
                # Fetch fresh status to update stats
                curr_status = status_ref.get().to_dict() or {}
                completed_count = len([t for t in tasks_map.values() if t["status"] == "completed"])
                progress_percentage = int((completed_count / total_tasks) * 100)
                total_pages_processed = curr_status.get("totalPagesProcessed", 0) + total_pages

                status_ref.update({
                    "completedTasks": completed_count,
                    "progressPercentage": progress_percentage,
                    "downloadedBooks": len([b for b in legacy_books_list.values() if b.get("status") == "completed"]),
                    "parsedBooks": len([b for b in legacy_books_list.values() if b.get("status") == "completed"]),
                    "totalPagesProcessed": total_pages_processed,
                    "percentage": float(progress_percentage),
                    f"tasks.{task_key}": tasks_map[task_key],
                    f"booksList.{b_id}": legacy_books_list[b_id],
                    "logs": logs,
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                })

            except Exception as e:
                append_log(f"Failed to process book {b_title}: {e}", "error")
                tasks_map[task_key]["status"] = "failed"
                tasks_map[task_key]["progress"] = 0
                tasks_map[task_key]["errorMessage"] = str(e)
                legacy_books_list[b_id]["status"] = "failed"
                legacy_books_list[b_id]["progress"] = 0
                
                status_ref.update({
                    f"tasks.{task_key}": tasks_map[task_key],
                    f"booksList.{b_id}": legacy_books_list[b_id],
                    "logs": logs,
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                })

        # Process books sequentially (or we can run them in a restricted concurrent worker queue)
        # We will use sequential loop or light parallel gathering. Since each book formats pages in parallel,
        # processing books sequentially is actually very fast and prevents hitting Gemini rate limits.
        # Let's process books sequentially.
        for idx, book_data in enumerate(catalog):
            curr_status = status_ref.get().to_dict() or {}
            if curr_status.get("pausedByRequest") or curr_status.get("status") == "paused":
                append_log("Sync pipeline paused by user request.", "warn")
                status_ref.update({
                    "status": "paused",
                    "logs": logs,
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
                })
                return
            await process_single_book(idx, book_data)

        # Mark final status as completed
        append_log("Multi-Agent Textbook Sync completed successfully!", "ok")
        status_ref.update({
            "status": "completed",
            "activeBookId": "",
            "activeBookTitle": "",
            "progressMessage": "",
            "logs": logs,
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP
        })

    except Exception as general_err:
        append_log(f"Sync pipeline failed with error: {general_err}", "error")
        status_ref.update({
            "status": "error",
            "logs": logs,
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            "errorMessage": str(general_err)[:500]
        })

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
