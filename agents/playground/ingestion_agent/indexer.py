"""Storage & Search Indexer Agent — uploads PDFs to GCS, generates embeddings, and saves metadata, chapters, and pages to Firestore."""
from __future__ import annotations

import os
import sys
import json
import asyncio
import hashlib
from typing import List, Dict, Any
from google import genai
from google.cloud import firestore
from google.cloud import storage

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-2")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "3072"))

def _sanitize_text(s: str) -> str:
    """Strip lone surrogate halves that crash Firestore JS SDK / utf-8 encoders."""
    if not s:
        return ""
    try:
        return s.encode("utf-8", errors="replace").decode("utf-8")
    except Exception:
        return s

class StorageIndexerAgent:
    def __init__(self, db: firestore.Client, storage_client: storage.Client, bucket_name: str):
        self.db = db
        self.storage_client = storage_client
        self.bucket_name = bucket_name
        self.client = genai.Client()

    def upload_pdf(self, pdf_bytes: bytes, destination_blob: str) -> str:
        """Upload raw PDF bytes to Google Cloud Storage."""
        print(f"[Indexer] Uploading raw PDF to gs://{self.bucket_name}/{destination_blob}...")
        bucket = self.storage_client.bucket(self.bucket_name)
        blob = bucket.blob(destination_blob)
        blob.upload_from_string(pdf_bytes, content_type='application/pdf')
        return f"gs://{self.bucket_name}/{destination_blob}"

    async def _embed_with_retry(self, text: str, max_attempts: int = 4) -> List[float]:
        """Embed text using gemini-embedding-2 with backoff and retry."""
        if not text.strip():
            return [0.0] * EMBEDDING_DIM
            
        delay = 1.0
        last_exc = None
        for attempt in range(max_attempts):
            try:
                response = await self.client.aio.models.embed_content(
                    model=f"models/{EMBEDDING_MODEL}",
                    contents=text,
                )
                return list(response.embeddings[0].values)
            except Exception as exc:
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
                
        print(f"[Indexer] Embedding failed after {max_attempts} attempts: {last_exc}")
        return [0.0] * EMBEDDING_DIM

    async def index_book(
        self,
        book_id: str,
        metadata: Dict[str, Any],
        formatted_pages: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Index textbook metadata, full content, and page-level embeddings in Firestore.

        Args:
            book_id: Unique book ID.
            metadata: Book metadata properties.
            formatted_pages: List of formatted page dicts: [{'pageNumber': N, 'text': '...'}]

        Returns:
            Dict summarizing indexing results.
        """
        print(f"[Indexer] Starting Firestore indexing for book {book_id}...")
        
        # 1. Sanitize pages
        for p in formatted_pages:
            p["text"] = _sanitize_text(p.get("text", ""))

        # 2. Assemble main lean book doc
        title = _sanitize_text(metadata.get("title", "Unknown Book"))
        subject = _sanitize_text(metadata.get("subject", "Unknown Subject"))
        stage = _sanitize_text(metadata.get("stage", ""))
        grade = _sanitize_text(metadata.get("grade", ""))
        term = _sanitize_text(metadata.get("term", ""))
        book_type = _sanitize_text(metadata.get("type", "Student Book"))
        language = metadata.get("language", "ar")
        year = metadata.get("year", 2026)
        gov_url = metadata.get("govUrl", "")
        gcs_uri = metadata.get("gcsUri", "")
        chapters = metadata.get("chapters", [])
        
        book_doc = {
            "id": book_id,
            "title": title,
            "stage": stage,
            "grade": grade,
            "term": term,
            "subject": subject,
            "type": book_type,
            "language": language,
            "year": year,
            "govUrl": gov_url,
            "storagePath": gcs_uri,
            "chapters": chapters,
            "pages": len(formatted_pages),
            "status": "indexed",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }

        # Write to main books collection
        print(f"[Indexer] Writing books/{book_id} lean metadata...")
        self.db.collection("books").document(book_id).set(book_doc)

        # 3. Write joined full rich text to content/full
        consolidated_pages = [
            f"--- PAGE {p.get('pageNumber')} ---\n\n{p.get('text', '')}"
            for p in formatted_pages
        ]
        full_rich_text = _sanitize_text("\n\n".join(consolidated_pages))

        content_payload = {
            "bookId": book_id,
            "pagesList": formatted_pages,
            "text": full_rich_text,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }

        try:
            print(f"[Indexer] Writing books/{book_id}/content/full document...")
            self.db.collection("books").document(book_id).collection("content").document("full").set(content_payload)
        except Exception as e:
            print(f"[Indexer] Full joined document write failed (>1 MiB limit): {e}. Writing pagesList only...")
            self.db.collection("books").document(book_id).collection("content").document("full").set({
                "bookId": book_id,
                "pagesList": formatted_pages,
                "updatedAt": firestore.SERVER_TIMESTAMP
            })

        # 4. Generate embeddings in parallel
        print(f"[Indexer] Generating page embeddings in parallel for {len(formatted_pages)} pages...")
        embed_semaphore = asyncio.Semaphore(10)
        
        async def embed_single_page(p):
            p_num = p.get("pageNumber")
            p_text = p.get("text", "")
            emb = await self._embed_with_retry(p_text)
            return p_num, emb

        embed_tasks = [embed_single_page(p) for p in formatted_pages]
        embed_results = await asyncio.gather(*embed_tasks)
        embeddings_map = {p_num: emb for p_num, emb in embed_results}

        # 5. Write page documents in batches of 400
        print(f"[Indexer] Writing page subcollections in batches...")
        loop = asyncio.get_running_loop()
        batch_size = 400
        
        for i in range(0, len(formatted_pages), batch_size):
            chunk = formatted_pages[i:i + batch_size]
            batch = self.db.batch()
            for p in chunk:
                p_num = p.get("pageNumber")
                p_text = p.get("text", "")
                emb_vector = embeddings_map.get(p_num, [0.0] * EMBEDDING_DIM)
                
                page_ref = self.db.collection("books").document(book_id).collection("pages").document(f"page_{p_num}")
                batch.set(page_ref, {
                    "pageNumber": p_num,
                    "text": p_text,
                    "bookId": book_id,
                    "bookTitle": title,
                    "grade": grade,
                    "subject": subject,
                    "stage": stage,
                    "term": term,
                    "type": book_type,
                    "language": language,
                    "year": year,
                    "embedding": emb_vector
                })
            await loop.run_in_executor(None, batch.commit)

        print(f"[Indexer] Finished indexing book: {book_id}")
        return {
            "bookId": book_id,
            "status": "indexed",
            "totalPages": len(formatted_pages)
        }
