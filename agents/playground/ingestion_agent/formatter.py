"""Book Formatter & Stylizer Agent — parses PDF page-by-page to output Markdown/HTML, LaTeX math, and diagram descriptions."""
from __future__ import annotations

import os
import sys
import json
import asyncio
import tempfile
from typing import List, Dict, Any
from google import genai
from google.genai import types
from google.cloud import storage

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

class BookFormatterAgent:
    def __init__(self, model_name: str = MODEL):
        self.model_name = model_name
        self.client = genai.Client()

    async def format_single_page(
        self,
        page_num: int,
        page_pdf_bytes: bytes,
        semaphore: asyncio.Semaphore,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """Send a single page PDF to Gemini to perform layout-aware OCR, formatting math in LaTeX and describing diagrams.

        Args:
            page_num: The 1-based page number.
            page_pdf_bytes: The PDF bytes of the single page.
            semaphore: Semaphore to limit concurrency.
            max_retries: Number of retry attempts.

        Returns:
            Dict containing 'pageNumber' and 'text' (styled markdown/HTML).
        """
        # Create temp file for upload
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
            tmp_file.write(page_pdf_bytes)
            tmp_path = tmp_file.name

        try:
            async with semaphore:
                print(f"[Formatter] Starting formatting page {page_num}...")
                
                # Upload to Gemini File API
                uploaded = await self.client.aio.files.upload(file=tmp_path)

                prompt = (
                    "You are a textbook layout and formatting expert. Perform OCR on this page of the textbook.\n"
                    "Your goal is to output a beautifully styled, layout-aware Markdown/HTML document representing this page.\n\n"
                    "Follow these instructions:\n"
                    "1. Preserving Layout: Use appropriate Markdown tags for headings (#, ##, ###), lists, blockquotes, and tables.\n"
                    "2. Math Formulas: Identify any mathematical formulas, equations, or scientific notation, and format them using LaTeX (e.g. $E=mc^2$ or $$f(x)=\\int x dx$$).\n"
                    "3. Diagrams & Visuals: If there are diagrams, graphs, charts, maps, illustrations, or photos, describe them in detail and represent them as an image tag with a rich alternative description: `![Visual description: [Detailed description of the visual structure, layout, labels, and educational purpose]](placeholder_diagram.png)`. This description should let an AI or blind student 'see' the visual context.\n"
                    "4. Output: Return ONLY the formatted Markdown/HTML representing the page content. Do not add introductory or concluding remarks (such as 'Here is the OCR output:')."
                )

                delay = 2.0
                for attempt in range(max_retries):
                    try:
                        response = await self.client.aio.models.generate_content(
                            model=self.model_name,
                            contents=[uploaded, prompt]
                        )
                        formatted_text = response.text or ""
                        if len(formatted_text) > 150000:
                            formatted_text = formatted_text[:150000] + "\n\n...[Content Truncated due to Firestore Size Limits]..."
                        
                        # Cleanup Gemini file
                        try:
                            await self.client.aio.files.delete(name=uploaded.name)
                        except Exception:
                            pass
                            
                        print(f"[Formatter] Page {page_num} completed successfully.")
                        return {
                            "pageNumber": page_num,
                            "text": formatted_text.strip()
                        }
                    except Exception as exc:
                        print(f"[Formatter] Page {page_num} attempt {attempt+1} failed: {exc}")
                        if attempt == max_retries - 1:
                            raise exc
                        await asyncio.sleep(delay)
                        delay *= 2
                        
        except Exception as e:
            print(f"[Formatter] Page {page_num} failed completely: {e}")
            return {
                "pageNumber": page_num,
                "text": f"<!-- Error formatting page {page_num}: {e} -->\n[Page {page_num} Content Unavailable]"
            }
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
                
        return {"pageNumber": page_num, "text": ""}
