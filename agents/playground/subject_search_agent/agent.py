"""Subject Search query-understanding agent (Batch 2, Part 3c).

Turns a natural-language search ("I need help with fourth grade math fractions
video") into a structured query plan:

    {
      "cleaned_query": "fractions",
      "filters": {"grade": "...", "subject": "...", "type": "...", "language": "..."},
      "intent": "foundational" | "exam_prep" | "neutral"
    }

so the search endpoint can pre-filter the vector space and rerank by intent.

IMPORTANT — latency: this agent is NOT on the keystroke hot path. The endpoint
runs the fast deterministic `parse_query_plan` tool by default (a single pass, no
model) and only escalates to this LLM agent for genuinely ambiguous / chatty
queries. The tool below is usable standalone (import and call it directly) so the
endpoint gets query understanding with zero model latency in the common case.
"""
from __future__ import annotations

import os
import re

from google.adk.agents.llm_agent import Agent

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

# Cheap, locale-aware cues. Deterministic so the hot path needs no model call.
_TYPE_CUES = {
    "video": ("video", "فيديو", "مقطع"),
    "exam_prep": ("exam", "question", "bank", "revision", "اسئلة", "أسئلة", "امتحان", "مراجعة", "بنك"),
}
_LANG_CUES = {
    "ar": ("arabic", "عربي", "بالعربي"),
    "en": ("english", "انجليزي", "إنجليزي", "بالانجليزي"),
    "fr": ("french", "francais", "français", "فرنسي"),
}
# Ordinal → Egyptian grade tokens (kept loose; the endpoint matches against the
# book's stored grade string). Extend as needed.
_GRADE_ORDINALS = {
    "first": "الأول", "1st": "الأول", "اولى": "الأول", "أولى": "الأول",
    "second": "الثاني", "2nd": "الثاني", "ثانية": "الثاني",
    "third": "الثالث", "3rd": "الثالث", "ثالثة": "الثالث",
    "fourth": "الرابع", "4th": "الرابع", "رابعة": "الرابع",
    "fifth": "الخامس", "5th": "الخامس",
    "sixth": "السادس", "6th": "السادس",
}

_NOISE = {
    "i", "need", "help", "with", "the", "a", "an", "please", "want", "find", "show",
    "me", "about", "for", "of", "on", "grade", "year", "class", "video", "lesson",
    "عايز", "محتاج", "مساعدة", "في", "عن", "درس", "شرح", "صف", "سنة",
}


def parse_query_plan(query: str) -> dict:
    """Deterministic query-understanding (no model). Strips noise tokens and lifts
    grade/type/language cues into explicit filter tags, leaving the residual
    topical string for the vector search.

    Returns a dict with keys: cleaned_query, filters{grade,type,language,subject},
    intent. `status` is always 'ok' so callers can treat it like an ADK tool.
    """
    q = (query or "").strip()
    low = q.lower()

    filters: dict[str, str] = {}
    intent = "neutral"

    for lang, cues in _LANG_CUES.items():
        if any(c in low for c in cues):
            filters["language"] = lang
            break

    if any(c in low for c in _TYPE_CUES["video"]):
        filters["type"] = "video"
    if any(c in low for c in _TYPE_CUES["exam_prep"]):
        intent = "exam_prep"

    for cue, grade_tok in _GRADE_ORDINALS.items():
        if re.search(rf"\b{re.escape(cue)}\b", low):
            filters["grade"] = grade_tok
            break

    # Residual topical query: drop noise + the cue words we consumed.
    consumed = set(_NOISE) | set(_GRADE_ORDINALS) | {c for cues in _LANG_CUES.values() for c in cues}
    tokens = [w for w in re.split(r"\s+", low) if w and w not in consumed]
    cleaned = " ".join(tokens).strip() or q

    return {"status": "ok", "cleaned_query": cleaned, "filters": filters, "intent": intent}


INSTRUCTION = """\
You are the Subject Search planner for 5sosybot. Convert the user's natural-language
search into a structured plan by calling `parse_query_plan(query)`. Only override the
tool's output when the query is genuinely ambiguous or conversational and you can infer
a clearer topical term, grade, material type (core textbook vs exam/question bank), or
language. Always respond with the final JSON plan and nothing else.
"""

root_agent = Agent(
    model=MODEL,
    name="subject_search",
    description=(
        "Parses a natural-language library search into {cleaned_query, filters, intent} "
        "for the subjects hybrid-search endpoint."
    ),
    instruction=INSTRUCTION,
    tools=[parse_query_plan],
)
