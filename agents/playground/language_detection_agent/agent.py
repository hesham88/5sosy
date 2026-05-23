"""ADK agent wrapper around the deterministic language detector.

The detector itself lives in `detector.py` as a pure helper; this module
exposes it as an ADK Agent so it can be invoked from other agents (e.g. a
future ingestion orchestrator) or from `adk web` for manual inspection.

The tool returns a structured dict — same calling convention as the rest of
the playground (executor, harvester) per the ADK best-practice noted in
project memory.
"""
from __future__ import annotations

import os
from typing import Any

from google.adk.agents.llm_agent import Agent

from .detector import (
    LANGUAGE_NAMES,
    SUPPORTED_LANGUAGES,
    detect_language_verbose,
)

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")


def classify_book_language(subject: str = "", filename: str = "") -> dict[str, Any]:
    """Classify a textbook's instruction language.

    Args:
        subject:  Human-readable subject string (typically Arabic, e.g.
                  "اللغة الفرنسية لغة ثانية").
        filename: Blob filename or URL fragment (e.g. "Deutsch_language_Sec3.pdf"
                  or a full https:// URL).

    Returns:
        {
          "status": "ok",
          "language": "<2-letter code>",
          "name_en": "<English name>",
          "name_native": "<native-script name>",
          "matched_on": "<substring that triggered, or 'default'>",
          "supported": [...],
        }
    """
    code, token = detect_language_verbose(subject=subject, filename=filename)
    info = LANGUAGE_NAMES[code]
    return {
        "status": "ok",
        "language": code,
        "name_en": info["en"],
        "name_native": info["native"],
        "matched_on": token,
        "supported": list(SUPPORTED_LANGUAGES),
    }


INSTRUCTION = """\
You classify Egyptian MoE textbook records by instruction language.

When the user gives you a book — a subject string, a filename, a URL, or
any combination — call `classify_book_language(subject=..., filename=...)`
exactly once and reply with one short sentence stating the detected language.

Supported codes: ar (Arabic), en (English), fr (French), de (German),
es (Spanish), it (Italian), zh (Chinese). Default is ar when nothing
matches. Do not guess outside this set.
"""

root_agent = Agent(
    model=MODEL,
    name="language_detector",
    description=(
        "Deterministic language classifier for MoE textbook records. "
        "Maps a (subject, filename) pair to one of ar/en/fr/de/es/it/zh."
    ),
    instruction=INSTRUCTION,
    tools=[classify_book_language],
)
