"""Ingestion Orchestrator Agent — coordinates scraping, downloads, and PDF parsing."""
from __future__ import annotations

import os
import sys
import json
import httpx
import asyncio
import hashlib
import uuid
import re
import urllib.parse
from datetime import datetime, timezone

from google.adk.agents.llm_agent import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from google.cloud import firestore
from google.cloud import storage

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except AttributeError:
    pass

from ingestion_agent.downloader import downloader_agent
from ingestion_agent.parser import parser_agent, split_pdf_to_pages, ocr_pages_with_gemini, index_book_to_firestore

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
GCS_BUCKET = os.getenv("GCS_BUCKET", "moe-textbooks")

# Orchestrator helper tools
async def get_catalog_summary() -> str:
    """Scrapes studentbooks.moe.gov.eg and returns total count and a list of subjects available."""
    catalog_url = "https://studentbooks.moe.gov.eg/books/books.json"
    headers = {'User-Agent': 'Mozilla/5.0'}
    catalog = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(catalog_url, headers=headers)
            if res.status_code == 200:
                catalog = res.json()
    except Exception:
        pass
    
    if not catalog:
        fallback_path = os.path.join(os.path.dirname(__file__), "books_fallback.json")
        if os.path.exists(fallback_path):
            with open(fallback_path, "r", encoding="utf-8") as f:
                catalog = json.load(f)
                
    total = len(catalog)
    subjects = list(set(book.get("subject", "Unknown") for book in catalog if book.get("subject")))[:10]
    return json.dumps({
        "total": total,
        "sample_subjects": subjects
    }, ensure_ascii=False)


INSTRUCTION = """\
You are the Ingestion Orchestrator Agent.
Your role is to manage the textbook ingestion pipeline by coordinating with sequential subagents.

Workflow:
1. When starting, check the catalog using `get_catalog_summary` to see how many textbooks are available.
2. Report the total number of books found on https://studentbooks.moe.gov.eg/ and ask the user how many books they want to ingest/sync (e.g. 1 to the maximum count, or "all").
3. Once the user responds with their choice (limit), call `downloader_agent` tool passing the requested limit as `limit`.
4. Receive the output from `downloader_agent` (a JSON string listing the downloaded files and GCS URIs).
5. Pass that exact output to `parser_agent` tool as `downloaded_books_json`.
6. Report the final success status to the user, listing the indexed books.

Be clear, accurate, organized, and helpful. Do not hallucinate or bypass the tools.
"""

root_agent = Agent(
    model=MODEL,
    name="ingestion_orchestrator",
    description="Orchestrated textbook acquisition workflow agent utilizing sequential subagents.",
    instruction=INSTRUCTION,
    sub_agents=[downloader_agent, parser_agent],
    tools=[get_catalog_summary],
)

# Cleanup helpers for paths
def clean_path_segment(seg: str) -> str:
    for c in ["?", "*", ":", "|", "\"", "<", ">", "\\"]:
        seg = seg.replace(c, "")
    return seg.strip()

def get_book_id(gov_url: str, subject: str = "book") -> str:
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
        return f"{clean_name.lower()}-{lang}-{year}"
    except Exception:
        import hashlib
        return hashlib.md5(gov_url.encode("utf-8")).hexdigest()

async def download_pdf(url: str) -> bytes:
    headers = {'User-Agent': 'Mozilla/5.0'}
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(url, headers=headers, follow_redirects=True)
        res.raise_for_status()
        return res.content

def upload_pdf_to_gcs(bucket, pdf_bytes: bytes, destination_blob: str) -> str:
    blob = bucket.blob(destination_blob)
    blob.upload_from_string(pdf_bytes, content_type='application/pdf')
    return f"gs://{bucket.name}/{destination_blob}"

async def fetch_catalog() -> list[dict]:
    url = "https://studentbooks.moe.gov.eg/books/books.json"
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url, headers=headers)
            if res.status_code == 200:
                return res.json()
    except Exception as e:
        print(f"Error fetching live books.json: {e}")
    
    fallback_path = os.path.join(os.path.dirname(__file__), "books_fallback.json")
    if os.path.exists(fallback_path):
        with open(fallback_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

async def run_sync_pipeline(
    db: firestore.Client,
    storage_client: storage.Client,
    bucket_name: str
) -> None:
    def append_log(logs_list: list, text: str, status: str = "info") -> None:
        logs_list.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "text": text,
            "status": status,
            "agent": "IngestionAgent"
        })
        if len(logs_list) > 100:
            logs_list.pop(0)

    status_ref = db.collection("ingestion").document("status")
    
    status_doc = status_ref.get()
    status_data = status_doc.to_dict() or {}
    
    logs = status_data.get("logs", [])
    append_log(logs, "Sync pipeline started. Fetching MOE library catalog...", "info")
    
    status_ref.set({
        "status": "running",
        "pausedByRequest": False,
        "logs": logs,
        "totalBooks": 0,
        "downloadedBooks": 0,
        "parsedBooks": 0,
        "totalPagesProcessed": status_data.get("totalPagesProcessed", 0),
        "progressMessage": "",
        "percentage": 0.0,
        "activeBookId": "",
        "activeBookTitle": "",
        "booksList": status_data.get("booksList", {}),
        "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
        "executionName": status_data.get("executionName", ""),
    }, merge=True)
    
    try:
        catalog = await fetch_catalog()
        total_books = len(catalog)
        append_log(logs, f"Found {total_books} books in catalog.", "info")
        
        if total_books == 0:
            status_ref.update({
                "status": "completed",
                "percentage": 100.0,
                "logs": logs
            })
            return
            
        books_coll = db.collection("books").stream()
        indexed_book_ids = {doc.id for doc in books_coll}
        
        bucket = storage_client.bucket(bucket_name)
        
        books_list = status_data.get("booksList", {})
        for book in catalog:
            gov_url = book.get("link")
            if not gov_url:
                continue
            b_id = get_book_id(gov_url, book.get("subject", "book"))
            
            if b_id not in books_list:
                books_list[b_id] = {
                    "id": b_id,
                    "title": book.get("subject", "Unknown Book"),
                    "stage": book.get("stage", ""),
                    "grade": book.get("grade", ""),
                    "term": book.get("term", ""),
                    "type": book.get("type", ""),
                    "status": "completed" if b_id in indexed_book_ids else "queued",
                    "progress": 100 if b_id in indexed_book_ids else 0,
                    "govUrl": gov_url
                }
        
        completed_count = len([b for b in books_list.values() if b["status"] == "completed"])
        percentage = round((completed_count / total_books) * 100, 1)
        
        status_ref.update({
            "totalBooks": total_books,
            "downloadedBooks": completed_count,
            "parsedBooks": completed_count,
            "percentage": percentage,
            "booksList": books_list,
            "logs": logs
        })
        
        for idx, book in enumerate(catalog):
            curr_status = status_ref.get().to_dict() or {}
            if curr_status.get("pausedByRequest") or curr_status.get("status") == "paused":
                append_log(logs, "Sync pipeline paused by user request.", "warn")
                status_ref.update({
                    "status": "paused",
                    "logs": logs,
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
                })
                return

            gov_url = book.get("link")
            if not gov_url:
                continue
            b_id = get_book_id(gov_url, book.get("subject", "book"))

            if books_list.get(b_id, {}).get("status") == "completed":
                continue

            b_title = book.get("subject", "Unknown Subject")
            append_log(logs, f"Processing book {idx+1}/{total_books}: {b_title} ({book.get('grade')})", "info")

            books_list[b_id]["status"] = "downloading"
            books_list[b_id]["progress"] = 20

            # Progress message for download
            progress_msg = f"I am Downloading on {b_title} || {completed_count} out of {total_books}"
            status_ref.update({
                "activeBookId": b_id,
                "activeBookTitle": b_title,
                "progressMessage": progress_msg,
                "booksList": books_list,
                "logs": logs,
                "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            })
            
            # Step 1: Download
            try:
                append_log(logs, f"Downloading from government site: {gov_url}", "info")
                pdf_bytes = await download_pdf(gov_url)
                books_list[b_id]["progress"] = 50
                progress_msg = f"I am Downloading on {b_title} || {completed_count} out of {total_books}"
                status_ref.update({
                    "progressMessage": progress_msg,
                    "booksList": books_list,
                    "logs": logs
                })
            except Exception as e:
                append_log(logs, f"Failed to download {b_title}: {e}", "error")
                books_list[b_id]["status"] = "failed"
                books_list[b_id]["progress"] = 0
                status_ref.update({
                    "booksList": books_list,
                    "logs": logs
                })
                continue
                
            # Step 2: Upload to GCS
            try:
                stage_c = clean_path_segment(book.get("stage", "Other"))
                grade_c = clean_path_segment(book.get("grade", "Other"))
                term_c = clean_path_segment(book.get("term", "Other"))
                sub_c = clean_path_segment(book.get("subject", "Other"))
                type_c = clean_path_segment(book.get("type", "Other"))
                
                filename = os.path.basename(gov_url)
                if not filename.endswith(".pdf"):
                    filename = f"{sub_c}_{type_c}.pdf"
                filename = clean_path_segment(filename)
                
                destination_blob = f"moe-textbooks/{stage_c}/{grade_c}/{term_c}/{sub_c}/{type_c}/{filename}"
                
                # Progress message for upload
                progress_msg = f"I am Uploading on {b_title} || {completed_count} out of {total_books}"
                append_log(logs, f"Uploading PDF to Cloud Storage: gs://{bucket_name}/{destination_blob}", "info")
                gcs_uri = upload_pdf_to_gcs(bucket, pdf_bytes, destination_blob)
                
                books_list[b_id]["status"] = "parsing"
                books_list[b_id]["progress"] = 75
                status_ref.update({
                    "progressMessage": progress_msg,
                    "booksList": books_list,
                    "logs": logs
                })
            except Exception as e:
                append_log(logs, f"Failed to upload GCS for {b_title}: {e}", "error")
                books_list[b_id]["status"] = "failed"
                books_list[b_id]["progress"] = 0
                status_ref.update({
                    "booksList": books_list,
                    "logs": logs
                })
                continue
                
            # Step 3: Run Page Splitting, OCR, and Indexing
            try:
                # Progress message for splitting
                progress_msg = f"I am Splitting on {b_title} || {completed_count} out of {total_books}"
                status_ref.update({
                    "progressMessage": progress_msg,
                    "booksList": books_list,
                    "logs": logs
                })
                
                append_log(logs, f"Splitting PDF into single-page files...", "info")
                pages_json = await split_pdf_to_pages(gcs_uri, b_id)
                
                # Get total pages
                try:
                    pages_data = json.loads(pages_json)
                    num_pages = pages_data.get("totalPages", 0)
                except Exception:
                    num_pages = 0
                pages_str = f"({num_pages} pages)" if num_pages > 0 else ""
                
                # Progress message for OCR
                progress_msg = f"I am OCR on {b_title} {pages_str} || {completed_count} out of {total_books}"
                status_ref.update({
                    "progressMessage": progress_msg,
                    "booksList": books_list,
                    "logs": logs
                })
                
                append_log(logs, f"Running OCR on each page using Gemini...", "info")
                ocr_results_json = await ocr_pages_with_gemini(pages_json)
                
                # Progress message for indexing
                progress_msg = f"I am Indexing on {b_title} {pages_str} || {completed_count} out of {total_books}"
                status_ref.update({
                    "progressMessage": progress_msg,
                    "booksList": books_list,
                    "logs": logs
                })
                
                append_log(logs, f"Assembling book document and indexing to Firestore...", "info")
                
                # Determine language for catalog item
                lang_code = "ar"
                sub_lower = b_title.lower()
                if "english" in sub_lower or "الانجليزية" in sub_lower:
                    lang_code = "en"
                elif "french" in sub_lower or "الفرنسية" in sub_lower:
                    lang_code = "fr"
                
                # Extract year
                year_match = re.search(r'/(\d{4})/', gov_url)
                year_val = int(year_match.group(1)) if year_match else 2026

                book_metadata = {
                    "id": b_id,
                    "title": b_title,
                    "stage": book.get("stage", ""),
                    "grade": book.get("grade", ""),
                    "term": book.get("term", ""),
                    "subject": book.get("subject", ""),
                    "type": book.get("type", "Student Book"),
                    "language": lang_code,
                    "year": year_val,
                    "govUrl": gov_url,
                    "gcsUri": gcs_uri,
                    "chapters": 8
                }
                await index_book_to_firestore(b_id, ocr_results_json, json.dumps(book_metadata))
                
                books_list[b_id]["status"] = "completed"
                books_list[b_id]["progress"] = 100
                completed_count += 1
                percentage = round((completed_count / total_books) * 100, 1)
                
                append_log(logs, f"Successfully parsed and indexed: {b_title}!", "ok")
                
                # Update total pages processed in Firestore
                current_status = status_ref.get().to_dict() or {}
                total_pages_processed = current_status.get("totalPagesProcessed", 0) + num_pages
                
                status_ref.update({
                    "downloadedBooks": completed_count,
                    "parsedBooks": completed_count,
                    "totalPagesProcessed": total_pages_processed,
                    "percentage": percentage,
                    "booksList": books_list,
                    "logs": logs
                })
            except Exception as e:
                append_log(logs, f"Parsing/Indexing failed for {b_title}: {e}", "error")
                books_list[b_id]["status"] = "failed"
                books_list[b_id]["progress"] = 0
                status_ref.update({
                    "booksList": books_list,
                    "logs": logs
                })
                continue
                
            await asyncio.sleep(0.5)
            
        append_log(logs, "Textbook sync completed successfully!", "ok")
        status_ref.update({
            "status": "completed",
            "activeBookId": "",
            "activeBookTitle": "",
            "progressMessage": "",
            "logs": logs,
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
        })

    except Exception as general_err:
        append_log(logs, f"Sync pipeline failed with error: {general_err}", "error")
        status_ref.update({
            "status": "error",
            "logs": logs,
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
        })
