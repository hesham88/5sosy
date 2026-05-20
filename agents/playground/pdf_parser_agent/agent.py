"""PDF Parser Agent — extracts structured textbook content using gemini-3.1-flash-lite."""
from __future__ import annotations

import os

from google.adk.agents.llm_agent import Agent

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

INSTRUCTION = """\
You are a PDF Parser Agent. Your job is to parse a textbook PDF file and extract its metadata and contents.
You will receive the PDF file and must analyze it. Output a single JSON object containing:
- title: The official title of the book in its original language.
- chapters: An integer indicating the total number of chapters in the book.
- pages: An integer indicating the total number of pages in the book.
- author: The author of the book (if mentioned, otherwise null).
- distributor: The distributor or publisher of the book (if mentioned, otherwise null).
- content_rich_text: A well-organized rich-text/markdown summary of the chapters, main sections, and core text contents of the book.

Rules:
- Be very precise with page count and chapter count.
- The content_rich_text should be a comprehensive, well-structured outline and description of the contents of the book, structured by chapters, so that student bots can study this book.
- Reply with JSON ONLY. No prose before or after. No ```json fences. Pure parsable JSON.
"""

root_agent = Agent(
    model=MODEL,
    name="pdf_parser",
    description="Parses PDF textbooks and extracts metadata and rich text using gemini-3.1-flash-lite.",
    instruction=INSTRUCTION,
)
