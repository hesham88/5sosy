"""Parser subagent for parsing downloaded textbooks using page-by-page OCR and indexing them in Firestore."""
from __future__ import annotations

import os
import sys
import json
import io
import uuid
import asyncio
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from google.cloud import firestore
from google.cloud import storage
from google import genai
from google.genai import types
from google.adk.agents.llm_agent import Agent
from pypdf import PdfReader, PdfWriter

# Load environment variables from .env file
load_dotenv()
if "GEMINI_API_KEY" not in os.environ and "GOOGLE_API_KEY" in os.environ:
    os.environ["GEMINI_API_KEY"] = os.environ["GOOGLE_API_KEY"]

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except AttributeError:
    pass

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
FIRESTORE_PROJECT = os.getenv("FIRESTORE_PROJECT", "khsosy")
FIRESTORE_DATABASE = os.getenv("FIRESTORE_DATABASE", "(default)")
GCS_BUCKET = os.getenv("GCS_BUCKET", "moe-textbooks")

# --- 1. Splitter Subagent ---

class SplitterInput(BaseModel):
    gcs_uri: str = Field(description="The GCS URI of the book PDF.")
    book_id: str = Field(description="The unique ID of the book.")

async def split_pdf_to_pages(gcs_uri: str, book_id: str) -> str:
    """Download PDF from GCS, count pages, split page-by-page, and upload them back to GCS.

    Args:
        gcs_uri: GCS URI of the source PDF.
        book_id: Unique identifier for the book.

    Returns:
        JSON string of the pages list with GCS paths and total page count.
    """
    storage_client = storage.Client()
    
    # Parse GCS URI
    if not gcs_uri.startswith("gs://"):
        raise ValueError(f"Invalid GCS URI: {gcs_uri}")
    
    parts = gcs_uri[5:].split("/", 1)
    bucket_name = parts[0]
    blob_name = parts[1]
    
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    
    print(f"Downloading source PDF from GCS: {gcs_uri}")
    pdf_bytes = blob.download_as_bytes()
    
    reader = PdfReader(io.BytesIO(pdf_bytes))
    total_pages = len(reader.pages)
    print(f"PDF loaded successfully. Total pages detected: {total_pages}")
    
    pages_list = []
    
    for page_idx in range(total_pages):
        page_num = page_idx + 1
        writer = PdfWriter()
        writer.add_page(reader.pages[page_idx])
        
        page_io = io.BytesIO()
        writer.write(page_io)
        page_data = page_io.getvalue()
        
        temp_blob_name = f"temp_splits/{book_id}/page_{page_num}.pdf"
        temp_blob = bucket.blob(temp_blob_name)
        temp_blob.upload_from_string(page_data, content_type='application/pdf')
        
        page_uri = f"gs://{bucket_name}/{temp_blob_name}"
        pages_list.append({
            "pageNumber": page_num,
            "gcsUri": page_uri
        })
        
    return json.dumps({
        "bookId": book_id,
        "totalPages": total_pages,
        "pages": pages_list
    }, ensure_ascii=False)

# --- 2. Parallel OCR with Gemini ---

async def ocr_pages_with_gemini(pages_json: str) -> str:
    """Send each page GCS PDF to Gemini Flash-Lite to perform OCR and extract clean text in parallel.

    Args:
        pages_json: JSON string matching the output of split_pdf_to_pages.

    Returns:
        JSON string of results: [{"pageNumber": X, "text": "..."}]
    """
    try:
        data = json.loads(pages_json)
        pages = data.get("pages", [])
    except Exception as e:
        return f"Error parsing input pages JSON: {e}"
        
    client = genai.Client()
    storage_client = storage.Client()
    
    # Process pages in parallel using a semaphore to limit concurrency
    semaphore = asyncio.Semaphore(10)
    
    async def ocr_single_page(p):
        page_num = p.get("pageNumber")
        page_uri = p.get("gcsUri")
        
        async with semaphore:
            print(f"Running OCR on Page {page_num}: {page_uri}")
            
            try:
                if not page_uri.startswith("gs://"):
                    raise ValueError(f"Invalid GCS URI: {page_uri}")
                
                parts = page_uri[5:].split("/", 1)
                bucket_name = parts[0]
                blob_name = parts[1]
                
                bucket = storage_client.bucket(bucket_name)
                blob = bucket.blob(blob_name)
                
                loop = asyncio.get_running_loop()
                pdf_bytes = await loop.run_in_executor(None, blob.download_as_bytes)
                
                import tempfile
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
                    tmp_file.write(pdf_bytes)
                    tmp_path = tmp_file.name
                
                try:
                    uploaded = await client.aio.files.upload(file=tmp_path)
                finally:
                    try:
                        os.unlink(tmp_path)
                    except Exception:
                        pass
                
                try:
                    response = await client.aio.models.generate_content(
                        model="gemini-3.1-flash-lite",
                        contents=[
                            uploaded,
                            "Perform OCR on this page of the textbook. Extract all text content. Return only the extracted text exactly as it appears. Do not summarize or explain."
                        ]
                    )
                    extracted_text = response.text or ""
                finally:
                    try:
                        await client.aio.files.delete(name=uploaded.name)
                    except Exception as del_err:
                        print(f"Failed to delete file from Gemini storage: {del_err}")
                
                return {
                    "pageNumber": page_num,
                    "text": extracted_text.strip()
                }
            except Exception as exc:
                print(f"OCR failed for Page {page_num}: {exc}")
                return {
                    "pageNumber": page_num,
                    "text": f"Error during OCR: {exc}"
                }
                
    tasks = [ocr_single_page(p) for p in pages]
    ocr_results = await asyncio.gather(*tasks)
    ocr_results.sort(key=lambda x: x["pageNumber"])
    
    return json.dumps(ocr_results, ensure_ascii=False)


# --- 3. Firestore Indexer ---

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "3072"))


def _sanitize_text(s: str) -> str:
    """Strip lone surrogate halves that crash Firestore JS SDK / utf-8 encoders.
    Gemini OCR occasionally emits U+DC80–U+DCFF (DCS-low surrogates) for bytes
    it couldn't decode, which Python strings allow but valid utf-8/utf-16 do not."""
    if not s:
        return ""
    # Re-encode round-trip, replacing anything that can't survive utf-8.
    try:
        return s.encode("utf-8", errors="replace").decode("utf-8")
    except Exception:
        return s


async def _embed_with_retry(client, text: str, max_attempts: int = 4) -> list[float]:
    """Embed one chunk with exponential backoff on 429/503. Returns a zero
    vector after exhausting retries so a single bad page doesn't fail the book."""
    delay = 1.0
    last_exc: Exception | None = None
    for attempt in range(max_attempts):
        try:
            response = await client.aio.models.embed_content(
                model=f"models/{EMBEDDING_MODEL}",
                contents=text,
            )
            return list(response.embeddings[0].values)
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            msg = str(exc).lower()
            transient = (
                "429" in msg
                or "resource_exhausted" in msg
                or "503" in msg
                or "unavailable" in msg
                or "deadline" in msg
            )
            if not transient or attempt == max_attempts - 1:
                break
            await asyncio.sleep(delay)
            delay = min(delay * 2, 16.0)
    print(f"Embedding failed after {max_attempts} attempts: {last_exc}")
    return [0.0] * EMBEDDING_DIM


async def index_book_to_firestore(book_id: str, ocr_results_json: str, book_metadata_json: str) -> str:
    """Assemble final indexed textbook document, save to Firestore 'books' (lean
    metadata) + 'books/{id}/content/full' (pagesList + joined text) + 'books/{id}/pages'
    subcollection (per-page with embeddings), and clean up GCS temp files.

    Args:
        book_id: Unique book identifier.
        ocr_results_json: JSON string of ocr_results list.
        book_metadata_json: JSON string of the book metadata.

    Returns:
        JSON string status of indexing.
    """
    try:
        ocr_results = json.loads(ocr_results_json)
        book_metadata = json.loads(book_metadata_json)
    except Exception as e:
        return f"Error parsing input JSONs: {e}"

    # Sanitize every OCR page so an invalid surrogate from one page can't break
    # downstream Firestore writes or the web listener.
    for p in ocr_results:
        p["text"] = _sanitize_text(p.get("text", ""))

    db = firestore.Client(project=FIRESTORE_PROJECT, database=FIRESTORE_DATABASE)
    storage_client = storage.Client()
    client = genai.Client()

    consolidated_pages = [
        f"--- PAGE {p.get('pageNumber')} ---\n\n{p.get('text', '')}"
        for p in ocr_results
    ]
    full_rich_text = _sanitize_text("\n\n".join(consolidated_pages))

    title = _sanitize_text(book_metadata.get("title", book_metadata.get("subject", "Unknown Book")))
    subject = _sanitize_text(book_metadata.get("subject", ""))

    # LEAN main book doc — no pagesList, no full text. Bulk content lives in the
    # `content/full` subcollection doc so the /books grid listener pulls ~2 KB
    # per book instead of ~500 KB.
    book_doc = {
        "id": book_id,
        "title": title,
        "stage": _sanitize_text(book_metadata.get("stage", "")),
        "grade": _sanitize_text(book_metadata.get("grade", "")),
        "term": _sanitize_text(book_metadata.get("term", "")),
        "subject": subject,
        "type": _sanitize_text(book_metadata.get("type", "Student Book")),
        "language": book_metadata.get("language", "ar"),
        "year": book_metadata.get("year", 2026),
        "govUrl": book_metadata.get("govUrl", book_metadata.get("link", "")),
        "storagePath": book_metadata.get("gcsUri", ""),
        "chapters": book_metadata.get("chapters", 8),
        "pages": len(ocr_results),
        "status": "indexed",
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }

    print(f"Indexing textbook (lean) to Firestore: books/{book_id}")
    db.collection("books").document(book_id).set(book_doc)

    # Bulk content — full joined text + per-page list. Split into multiple
    # chunks if it exceeds Firestore's 1 MiB doc limit.
    content_payload = {
        "bookId": book_id,
        "pagesList": ocr_results,
        "text": full_rich_text,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    try:
        db.collection("books").document(book_id).collection("content").document("full").set(content_payload)
    except Exception as e:
        # Some books exceed 1 MiB joined — fall back to writing just pagesList.
        print(f"content/full write failed (likely >1 MiB): {e} — retrying without joined text")
        db.collection("books").document(book_id).collection("content").document("full").set(
            {"bookId": book_id, "pagesList": ocr_results, "updatedAt": firestore.SERVER_TIMESTAMP}
        )

    print(f"Generating page-level embeddings using models/{EMBEDDING_MODEL} for book: {book_id}")
    embed_semaphore = asyncio.Semaphore(5)

    async def embed_single_page(p):
        p_num = p.get("pageNumber")
        p_text = p.get("text", "")
        if not p_text.strip():
            return p_num, [0.0] * EMBEDDING_DIM
        async with embed_semaphore:
            emb = await _embed_with_retry(client, p_text)
            return p_num, emb

    embed_tasks = [embed_single_page(p) for p in ocr_results]
    embed_results = await asyncio.gather(*embed_tasks)
    embeddings_map = {p_num: emb for p_num, emb in embed_results}
    
    # Index pages to subcollection 'pages' in batches
    print(f"Writing page documents with embeddings to books/{book_id}/pages subcollection...")
    
    # Break into batches of 400 documents to avoid Firestore batch limits (max 500)
    pages_to_write = list(ocr_results)
    batch_size = 400
    loop = asyncio.get_running_loop()
    
    for i in range(0, len(pages_to_write), batch_size):
        chunk = pages_to_write[i:i + batch_size]
        batch = db.batch()
        for p in chunk:
            p_num = p.get("pageNumber")
            p_text = p.get("text", "")
            emb_vector = embeddings_map.get(p_num, [0.0] * 3072)
            
            page_ref = db.collection("books").document(book_id).collection("pages").document(f"page_{p_num}")
            batch.set(page_ref, {
                "pageNumber": p_num,
                "text": p_text,
                "bookId": book_id,
                "bookTitle": book_doc["title"],
                "grade": book_doc["grade"],
                "subject": book_doc["subject"],
                "stage": book_doc["stage"],
                "term": book_doc["term"],
                "type": book_doc["type"],
                "language": book_doc["language"],
                "year": book_doc["year"],
                "embedding": emb_vector
            })
        await loop.run_in_executor(None, batch.commit)
        
    # Delete temporary GCS split files
    print(f"Cleaning up temporary split files in GCS: temp_splits/{book_id}/")
    bucket = storage_client.bucket(GCS_BUCKET)
    blobs = list(bucket.list_blobs(prefix=f"temp_splits/{book_id}/"))
    for blob in blobs:
        try:
            blob.delete()
        except Exception as e:
            print(f"Failed to delete temp blob {blob.name}: {e}")
            
    return json.dumps({
        "bookId": book_id,
        "status": "indexed",
        "totalPages": len(ocr_results)
    }, ensure_ascii=False)


# --- 4. Python Orchestrator Tool ---

async def parse_and_index_books_tool(downloaded_books_json: str) -> str:
    """Orchestrate PDF splitting, OCR, and Firestore indexing for a list of downloaded books.

    Args:
        downloaded_books_json: JSON string listing the downloaded books.

    Returns:
        JSON string summarizing status of parsed books.
    """
    try:
        books = json.loads(downloaded_books_json)
    except Exception as e:
        return f"Error parsing downloaded_books_json: {e}"
        
    summary_results = []
    
    for book in books:
        book_id = book.get("id") or book.get("bookId")
        gcs_uri = book.get("gcsUri") or book.get("storagePath")
        title = book.get("title") or book.get("subject") or "Unknown"
        
        if not book_id or not gcs_uri:
            print(f"Skipping book due to missing id or gcsUri: {book}")
            summary_results.append({
                "title": title,
                "status": "failed",
                "reason": "Missing book_id or gcsUri"
            })
            continue
            
        print(f"Starting parsing pipeline for book: {title} (ID: {book_id})")
        
        try:
            # 1. Split PDF to pages
            print(f"Splitting book {title} into pages...")
            pages_json = await split_pdf_to_pages(gcs_uri, book_id)
            
            # 2. Run OCR on all pages in parallel
            print(f"Running parallel OCR for book {title}...")
            ocr_results_json = await ocr_pages_with_gemini(pages_json)
            
            # 3. Index book to Firestore
            print(f"Indexing book {title} to Firestore...")
            book_metadata = {
                "id": book_id,
                "title": title,
                "stage": book.get("stage", ""),
                "grade": book.get("grade", ""),
                "term": book.get("term", ""),
                "subject": book.get("subject", ""),
                "type": book.get("type", ""),
                "govUrl": book.get("govUrl", book.get("link", "")),
                "gcsUri": gcs_uri,
                "chapters": book.get("chapters", 8)
            }
            indexer_status_json = await index_book_to_firestore(
                book_id=book_id,
                ocr_results_json=ocr_results_json,
                book_metadata_json=json.dumps(book_metadata)
            )
            
            indexer_status = json.loads(indexer_status_json)
            summary_results.append({
                "bookId": book_id,
                "title": title,
                "status": "success",
                "totalPages": indexer_status.get("totalPages", 0)
            })
            
        except Exception as e:
            print(f"Parsing/Indexing pipeline failed for book {title}: {e}")
            summary_results.append({
                "bookId": book_id,
                "title": title,
                "status": "failed",
                "reason": str(e)
            })
            
    return json.dumps(summary_results, ensure_ascii=False)


# --- 5. Parser Agent Orchestrator ---

class ParserInput(BaseModel):
    downloaded_books_json: str = Field(
        description="JSON string listing the downloaded books with GCS URIs."
    )

parser_instruction = """\
You are the Parser Agent.
Call `parse_and_index_books_tool` with the provided `downloaded_books_json`.
Return the exact summary status returned by the tool.
Provide a clean, summarized markdown report of the indexed textbooks.
"""

parser_agent = Agent(
    model=MODEL,
    name="parser_agent",
    description="Parser Agent that page-splits, runs OCR, and indexes textbooks.",
    instruction=parser_instruction,
    input_schema=ParserInput,
    mode="single_turn",
    tools=[parse_and_index_books_tool],
)
