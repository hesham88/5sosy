"""Page & Chapter Count Agent — counts pages and extracts TOC chapters using Gemini Vision."""
from __future__ import annotations

import os
import io
import json
import tempfile
import asyncio
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from pypdf import PdfReader, PdfWriter
from google import genai
from google.genai import types

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

class ChapterInfo(BaseModel):
    title: str = Field(description="The title of the chapter or section")
    startPage: int = Field(description="The page number where the chapter starts (1-indexed)")
    endPage: int = Field(description="The page number where the chapter ends (1-indexed)")

class ChapterList(BaseModel):
    chapters: list[ChapterInfo]

class PageCounterAgent:
    def __init__(self, model_name: str = MODEL):
        self.model_name = model_name

    async def get_page_count_and_chapters(self, pdf_bytes: bytes) -> Dict[str, Any]:
        """Load PDF from bytes, extract page count, and use Gemini to parse TOC from the first 10 pages.

        Args:
            pdf_bytes: The PDF file content.

        Returns:
            Dict containing 'pageCount' and 'chapters' (list of dicts).
        """
        # 1. Get physical page count
        reader = PdfReader(io.BytesIO(pdf_bytes))
        total_pages = len(reader.pages)
        print(f"[PageCounter] Physical page count: {total_pages}")

        if total_pages == 0:
            return {"pageCount": 0, "chapters": []}

        # 2. Extract first 10 pages for TOC analysis
        writer = PdfWriter()
        toc_pages_limit = min(12, total_pages) # Usually TOC is in the first 10-12 pages
        for page_idx in range(toc_pages_limit):
            writer.add_page(reader.pages[page_idx])

        toc_pdf_io = io.BytesIO()
        writer.write(toc_pdf_io)
        toc_pdf_bytes = toc_pdf_io.getvalue()

        # 3. Upload to Gemini and ask for TOC
        client = genai.Client()
        chapters = []

        # Create temporary file to upload
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
            tmp_file.write(toc_pdf_bytes)
            tmp_path = tmp_file.name

        try:
            print(f"[PageCounter] Uploading TOC pages (1-{toc_pages_limit}) to Gemini...")
            uploaded = await client.aio.files.upload(file=tmp_path)
            
            prompt = (
                "You are an expert curriculum assistant. Analyze the table of contents (index) "
                "in this PDF snippet. Identify all major chapters/units/sections with their "
                "starting and ending page numbers (1-indexed). "
                "If the table of contents is in Arabic, extract the titles in Arabic. "
                "If it is in English, extract them in English. "
                "Make sure page numbers are relative to the overall book (they are usually printed on the pages)."
            )

            print(f"[PageCounter] Querying Gemini ({self.model_name}) for TOC...")
            response = await client.aio.models.generate_content(
                model=self.model_name,
                contents=[uploaded, prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ChapterList
                )
            )

            # Delete file from Gemini storage
            try:
                await client.aio.files.delete(name=uploaded.name)
            except Exception as del_err:
                print(f"[PageCounter] Failed to delete file from Gemini storage: {del_err}")

            if response.text:
                result = json.loads(response.text)
                chapters = result.get("chapters", [])
                print(f"[PageCounter] Successfully extracted {len(chapters)} chapters")
            else:
                print("[PageCounter] Gemini returned empty response for TOC")
        except Exception as e:
            print(f"[PageCounter] Error extracting chapters using Gemini: {e}")
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

        return {
            "pageCount": total_pages,
            "chapters": chapters
        }
