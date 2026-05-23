"""Storage & Search Indexer Agent — uploads PDFs to GCS, generates embeddings, and saves metadata, chapters, and pages to Firestore."""
from __future__ import annotations

import os
import sys
import json
import asyncio
import hashlib
from typing import List, Dict, Any, Optional, Callable, Awaitable
from google import genai
from google.genai import types
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

    async def _get_localized_metadata(self, metadata: Dict[str, Any]) -> Dict[str, str]:
        """Translate book metadata (title, stage, grade, term, type, subject) to English and Arabic using Gemini 2.5 Flash."""
        title = metadata.get("title", "")
        stage = metadata.get("stage", "")
        grade = metadata.get("grade", "")
        term = metadata.get("term", "")
        book_type = metadata.get("type", "")
        subject = metadata.get("subject", "")
        
        prompt = (
            f"You are a translation and localization expert. Translate/localize the following school textbook metadata to both Arabic and English.\n"
            f"Input metadata:\n"
            f"- Raw Title: {title}\n"
            f"- Subject: {subject}\n"
            f"- Stage: {stage}\n"
            f"- Grade: {grade}\n"
            f"- Term: {term}\n"
            f"- Type: {book_type}\n\n"
            f"Please output a JSON object with exactly the following keys:\n"
            f"- \"arT\": The book title localized in Arabic\n"
            f"- \"enT\": The book title localized/translated in English\n"
            f"- \"arSub\": A natural Arabic subtitle incorporating the stage, grade, term, and type\n"
            f"- \"enSub\": A natural English subtitle incorporating the stage, grade, term, and type\n"
            f"- \"arStage\": The school stage localized in Arabic\n"
            f"- \"enStage\": The school stage localized/translated in English\n"
            f"- \"arGrade\": The grade localized in Arabic\n"
            f"- \"enGrade\": The grade localized/translated in English\n"
            f"- \"arTerm\": The term/semester localized in Arabic\n"
            f"- \"enTerm\": The term/semester localized/translated in English\n"
            f"- \"arType\": The book type (e.g. Student Book) localized in Arabic\n"
            f"- \"enType\": The book type localized/translated in English\n"
            f"- \"arSubject\": The subject localized in Arabic\n"
            f"- \"enSubject\": The subject localized/translated in English\n\n"
            f"Ensure the output is valid JSON."
        )
        
        # Default/fallback values
        fallback = {
            "arT": title,
            "enT": title,
            "arSub": f"{stage} - {grade} - {term} - {book_type}".strip(" -"),
            "enSub": f"{stage} - {grade} - {term} - {book_type}".strip(" -"),
            "arStage": stage,
            "enStage": stage,
            "arGrade": grade,
            "enGrade": grade,
            "arTerm": term,
            "enTerm": term,
            "arType": book_type,
            "enType": book_type,
            "arSubject": subject,
            "enSubject": subject
        }
        
        try:
            response = await self.client.aio.models.generate_content(
                model="gemini-3.1-flash-lite",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
            text = response.text or ""
            data = json.loads(text.strip())
            return {
                "arT": _sanitize_text(data.get("arT", fallback["arT"])),
                "enT": _sanitize_text(data.get("enT", fallback["enT"])),
                "arSub": _sanitize_text(data.get("arSub", fallback["arSub"])),
                "enSub": _sanitize_text(data.get("enSub", fallback["enSub"])),
                "arStage": _sanitize_text(data.get("arStage", fallback["arStage"])),
                "enStage": _sanitize_text(data.get("enStage", fallback["enStage"])),
                "arGrade": _sanitize_text(data.get("arGrade", fallback["arGrade"])),
                "enGrade": _sanitize_text(data.get("enGrade", fallback["enGrade"])),
                "arTerm": _sanitize_text(data.get("arTerm", fallback["arTerm"])),
                "enTerm": _sanitize_text(data.get("enTerm", fallback["enTerm"])),
                "arType": _sanitize_text(data.get("arType", fallback["arType"])),
                "enType": _sanitize_text(data.get("enType", fallback["enType"])),
                "arSubject": _sanitize_text(data.get("arSubject", fallback["arSubject"])),
                "enSubject": _sanitize_text(data.get("enSubject", fallback["enSubject"]))
            }
        except Exception as e:
            print(f"[Indexer] Localization metadata generation failed: {e}. Using fallback values.")
            return fallback

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
        formatted_pages: List[Dict[str, Any]],
        progress_callback: Optional[Callable[[int], Awaitable[None]]] = None
    ) -> Dict[str, Any]:
        """Index textbook metadata, full content, and page-level embeddings in Firestore.

        Args:
            book_id: Unique book ID.
            metadata: Book metadata properties.
            formatted_pages: List of formatted page dicts: [{'pageNumber': N, 'text': '...'}]
            progress_callback: Optional async callback to report progress percentage.

        Returns:
            Dict summarizing indexing results.
        """
        print(f"[Indexer] Starting database indexing for book {book_id}...")
        
        # 1. Sanitize and truncate pages
        for p in formatted_pages:
            t = _sanitize_text(p.get("text", ""))
            if len(t) > 150000:
                t = t[:150000] + "\n\n...[Content Truncated due to size limits]..."
            p["text"] = t

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
        
        # Get localized metadata
        localized = await self._get_localized_metadata(metadata)
        
        provider = os.getenv("DATABASE_PROVIDER", "firestore").lower()
        
        if provider == "mongodb":
            from datetime import datetime, timezone
            from shared.mongodb_client import get_mongodb_client
            _, mongo_db = get_mongodb_client()
            
            book_doc = {
                "_id": book_id,
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
                "status": "indexing",
                "createdAt": datetime.now(timezone.utc),
                "updatedAt": datetime.now(timezone.utc),
                **localized
            }
            
            print(f"[Indexer] Writing books/{book_id} lean metadata to MongoDB...")
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, lambda: mongo_db["books"].replace_one({"_id": book_id}, book_doc, upsert=True))
            
            # Write joined full rich text to book_contents
            consolidated_pages = [
                f"--- PAGE {p.get('pageNumber')} ---\n\n{p.get('text', '')}"
                for p in formatted_pages
            ]
            full_rich_text = _sanitize_text("\n\n".join(consolidated_pages))
            
            content_payload = {
                "_id": f"{book_id}_full",
                "bookId": book_id,
                "pagesList": formatted_pages,
                "text": full_rich_text,
                "updatedAt": datetime.now(timezone.utc),
            }
            
            print(f"[Indexer] Writing book content to MongoDB...")
            await loop.run_in_executor(None, lambda: mongo_db["book_contents"].replace_one({"_id": content_payload["_id"]}, content_payload, upsert=True))
            
            # Generate page embeddings
            print(f"[Indexer] Generating page embeddings in parallel for {len(formatted_pages)} pages...")
            embed_semaphore = asyncio.Semaphore(20)
            
            embed_completed = 0
            async def embed_single_page(p):
                nonlocal embed_completed
                p_num = p.get("pageNumber")
                p_text = p.get("text", "")
                emb = await self._embed_with_retry(p_text)
                embed_completed += 1
                if progress_callback and len(formatted_pages) > 0:
                    current_prog = 80 + int((embed_completed / len(formatted_pages)) * 11)
                    if embed_completed == len(formatted_pages) or embed_completed % max(1, len(formatted_pages) // 10) == 0:
                        await progress_callback(current_prog)
                return p_num, emb

            embed_tasks = [embed_single_page(p) for p in formatted_pages]
            embed_results = await asyncio.gather(*embed_tasks)
            embeddings_map = {p_num: emb for p_num, emb in embed_results}
            
            # Write pages in batches to MongoDB
            print(f"[Indexer] Writing page records in batches to MongoDB...")
            batch_size = 20
            total_chunks = (len(formatted_pages) + batch_size - 1) // batch_size
            chunk_count = 0
            
            for i in range(0, len(formatted_pages), batch_size):
                chunk = formatted_pages[i:i + batch_size]
                
                def _write_mongo_batch(pages_chunk, chunk_idx):
                    from pymongo import ReplaceOne
                    requests = []
                    for p in pages_chunk:
                        p_num = p.get("pageNumber")
                        p_text = p.get("text", "")
                        emb_vector = embeddings_map.get(p_num, [0.0] * EMBEDDING_DIM)
                        
                        page_doc = {
                            "_id": f"{book_id}_page_{p_num}",
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
                            "embedding": emb_vector, # list of floats for Mongo
                            "arStage": localized.get("arStage", stage),
                            "enStage": localized.get("enStage", stage),
                            "arGrade": localized.get("arGrade", grade),
                            "enGrade": localized.get("enGrade", grade),
                            "arTerm": localized.get("arTerm", term),
                            "enTerm": localized.get("enTerm", term),
                            "arType": localized.get("arType", book_type),
                            "enType": localized.get("enType", book_type),
                            "arSubject": localized.get("arSubject", subject),
                            "enSubject": localized.get("enSubject", subject)
                        }
                        requests.append(ReplaceOne({"_id": page_doc["_id"]}, page_doc, upsert=True))
                    mongo_db["book_pages"].bulk_write(requests)
                    
                await loop.run_in_executor(None, _write_mongo_batch, chunk, chunk_count)
                chunk_count += 1
                if progress_callback and total_chunks > 0:
                    current_prog = 91 + int((chunk_count / total_chunks) * 8)
                    await progress_callback(current_prog)
                    
            print(f"[Indexer] Finalizing status to indexed for book in MongoDB: {book_id}")
            await loop.run_in_executor(None, lambda: mongo_db["books"].update_one(
                {"_id": book_id},
                {"$set": {"status": "indexed", "updatedAt": datetime.now(timezone.utc)}}
            ))
            
            print(f"[Indexer] Finished indexing book in MongoDB: {book_id}")
            return {
                "bookId": book_id,
                "status": "indexed",
                "totalPages": len(formatted_pages)
            }

        # Otherwise, default to Firestore
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
            "status": "indexing",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
            **localized
        }

        # Write to main books collection
        print(f"[Indexer] Writing books/{book_id} lean metadata...")
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: self.db.collection("books").document(book_id).set(book_doc))

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
            await loop.run_in_executor(
                None,
                lambda: self.db.collection("books").document(book_id).collection("content").document("full").set(content_payload)
            )
        except Exception as e:
            print(f"[Indexer] Full joined document write failed (>1 MiB limit): {e}. Trying write with pagesList only...")
            try:
                await loop.run_in_executor(
                    None,
                    lambda: self.db.collection("books").document(book_id).collection("content").document("full").set({
                        "bookId": book_id,
                        "pagesList": formatted_pages,
                        "updatedAt": firestore.SERVER_TIMESTAMP
                    })
                )
            except Exception as e2:
                print(f"[Indexer] PagesList joined document write failed as well: {e2}. Writing pagesList: [] as fallback...")
                await loop.run_in_executor(
                    None,
                    lambda: self.db.collection("books").document(book_id).collection("content").document("full").set({
                        "bookId": book_id,
                        "pagesList": [],
                        "text": "",
                        "updatedAt": firestore.SERVER_TIMESTAMP
                    })
                )

        # content/full is durable in Firestore now. Drop the 45 MB joined string
        # and the dict that still references formatted_pages — embedding generation
        # below needs formatted_pages itself, but not these wrappers.
        consolidated_pages = None
        full_rich_text = None
        content_payload = None

        # 4. Generate embeddings in parallel.
        # Bumped 10→20 — Gemini latency dominates wall time; CPU is idle.
        print(f"[Indexer] Generating page embeddings in parallel for {len(formatted_pages)} pages...")
        embed_semaphore = asyncio.Semaphore(20)
        
        embed_completed = 0
        async def embed_single_page(p):
            nonlocal embed_completed
            p_num = p.get("pageNumber")
            p_text = p.get("text", "")
            emb = await self._embed_with_retry(p_text)
            embed_completed += 1
            if progress_callback and len(formatted_pages) > 0:
                current_prog = 80 + int((embed_completed / len(formatted_pages)) * 11)
                if embed_completed == len(formatted_pages) or embed_completed % max(1, len(formatted_pages) // 10) == 0:
                    await progress_callback(current_prog)
            return p_num, emb

        embed_tasks = [embed_single_page(p) for p in formatted_pages]
        embed_results = await asyncio.gather(*embed_tasks)
        embeddings_map = {p_num: emb for p_num, emb in embed_results}

        # 5. Write page documents in batches of 20
        print(f"[Indexer] Writing page subcollections in batches...")
        loop = asyncio.get_running_loop()
        batch_size = 20
        
        total_chunks = (len(formatted_pages) + batch_size - 1) // batch_size
        chunk_count = 0
        for i in range(0, len(formatted_pages), batch_size):
            chunk = formatted_pages[i:i + batch_size]
            batch = self.db.batch()
            for p in chunk:
                p_num = p.get("pageNumber")
                p_text = p.get("text", "")
                emb_vector = embeddings_map.get(p_num, [0.0] * EMBEDDING_DIM)
                
                import struct
                emb_bytes = struct.pack(f"{len(emb_vector)}f", *emb_vector)
                
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
                    "embedding": emb_bytes,
                    "arStage": localized.get("arStage", stage),
                    "enStage": localized.get("enStage", stage),
                    "arGrade": localized.get("arGrade", grade),
                    "enGrade": localized.get("enGrade", grade),
                    "arTerm": localized.get("arTerm", term),
                    "enTerm": localized.get("enTerm", term),
                    "arType": localized.get("arType", book_type),
                    "enType": localized.get("enType", book_type),
                    "arSubject": localized.get("arSubject", subject),
                    "enSubject": localized.get("enSubject", subject)
                })
            await loop.run_in_executor(None, batch.commit)
            chunk_count += 1
            if progress_callback and total_chunks > 0:
                current_prog = 91 + int((chunk_count / total_chunks) * 8)
                await progress_callback(current_prog)

        print(f"[Indexer] Finalizing status to indexed for book: {book_id}")
        await loop.run_in_executor(None, lambda: self.db.collection("books").document(book_id).update({
            "status": "indexed",
            "updatedAt": firestore.SERVER_TIMESTAMP
        }))

        print(f"[Indexer] Finished indexing book: {book_id}")
        return {
            "bookId": book_id,
            "status": "indexed",
            "totalPages": len(formatted_pages)
        }

