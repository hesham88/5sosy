"""Downloader subagent for downloading textbooks and storing them in GCS."""
from __future__ import annotations

import os
import sys
import json
import httpx
import hashlib
from pydantic import BaseModel, Field
from google.cloud import storage
from google.adk.agents.llm_agent import Agent

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except AttributeError:
    pass

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
GCS_BUCKET = os.getenv("GCS_BUCKET", "moe-textbooks")

class DownloaderInput(BaseModel):
    limit: str = Field(
        description="The number of books to download (e.g. '3') or 'all' to download all books."
    )

def clean_path_segment(seg: str) -> str:
    for c in ["?", "*", ":", "|", "\"", "<", ">", "\\"]:
        seg = seg.replace(c, "")
    return seg.strip()

def get_book_id(gov_url: str) -> str:
    return hashlib.md5(gov_url.encode("utf-8")).hexdigest()

async def download_books_tool(limit: str) -> str:
    """Download textbooks from the MOE library and upload to GCS.

    Args:
        limit: The number of books to download (e.g. '3') or 'all'.

    Returns:
        JSON string of list of downloaded books with GCS URIs.
    """
    catalog_url = "https://studentbooks.moe.gov.eg/books/books.json"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    
    print(f"Fetching catalog from {catalog_url}...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(catalog_url, headers=headers)
            if res.status_code == 200:
                catalog = res.json()
            else:
                raise ValueError(f"HTTP {res.status_code}")
    except Exception as e:
        print(f"Error fetching catalog: {e}. Falling back to local file.")
        fallback_path = os.path.join(os.path.dirname(__file__), "books_fallback.json")
        if os.path.exists(fallback_path):
            with open(fallback_path, "r", encoding="utf-8") as f:
                catalog = json.load(f)
        else:
            catalog = []

    if limit.lower() != 'all':
        try:
            n = int(limit)
            catalog = catalog[:n]
        except ValueError:
            pass

    # Initialize GCS Client
    storage_client = storage.Client()
    bucket = storage_client.bucket(GCS_BUCKET)

    downloaded = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for book in catalog:
            gov_url = book.get("link")
            if not gov_url:
                continue

            b_id = get_book_id(gov_url)
            b_title = book.get("subject", "Unknown Book")
            
            try:
                print(f"Downloading: {b_title} from {gov_url}")
                res = await client.get(gov_url, headers=headers, follow_redirects=True)
                res.raise_for_status()
                pdf_bytes = res.content

                # Create GCS path
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
                blob = bucket.blob(destination_blob)
                blob.upload_from_string(pdf_bytes, content_type='application/pdf')
                gcs_uri = f"gs://{GCS_BUCKET}/{destination_blob}"

                downloaded.append({
                    "id": b_id,
                    "title": b_title,
                    "stage": book.get("stage", ""),
                    "grade": book.get("grade", ""),
                    "term": book.get("term", ""),
                    "subject": book.get("subject", ""),
                    "type": book.get("type", ""),
                    "govUrl": gov_url,
                    "gcsUri": gcs_uri
                })
            except Exception as exc:
                print(f"Failed to download/upload {b_title}: {exc}")

    return json.dumps(downloaded, ensure_ascii=False)

INSTRUCTION = """\
You are the Downloader Subagent.
Your goal is to download the textbooks from MOE portal and upload them to GCS.
Call the `download_books_tool` with the requested limit.
Return the exact JSON response from the tool.
"""

downloader_agent = Agent(
    model=MODEL,
    name="downloader_agent",
    description="Downloads textbooks from the MOE portal and uploads them to GCS.",
    instruction=INSTRUCTION,
    input_schema=DownloaderInput,
    mode="single_turn",
    tools=[download_books_tool],
)
