"""Scaffold: enrich concept_nodes with friendly names + short descriptions in the 7 UI locales.

STATUS: scaffold / not wired into any job yet. It documents the shape the single-subject
page's concepts panel already consumes — `concept_nodes.nameI18n` and `concept_nodes.descriptionI18n`
(both `{ar,en,fr,de,es,it,zh}`). Until a job populates them, the UI falls back to the cleaned
keyword `label`.

The per-subject endpoints (`/v1/subjects/concepts`) pass these fields through verbatim, so once
this runs the UI lights up with no frontend change.

Run model (future): a Cloud Run Job like the mind-map worker, after a mind-map build. For each
concept_node it would feed the concept's top keywords + a few representative page snippets to
Gemini and ask for a 2-4 word friendly name and a one-sentence description per locale.

This file intentionally does NOT execute network calls — fill in the two TODOs to make it live.
"""

from __future__ import annotations

import os
from typing import Any

LOCALES = ["ar", "en", "fr", "de", "es", "it", "zh"]
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")


def _build_prompt(label: str, keywords: list[str], snippets: list[str]) -> str:
    kw = ", ".join(keywords[:8])
    ctx = "\n".join(f"- {s[:200]}" for s in snippets[:4])
    locales = ", ".join(LOCALES)
    return (
        "You name and describe a study concept for Egyptian Thanaweya students.\n"
        f"Raw label: {label}\nKeywords: {kw}\nSample text:\n{ctx}\n\n"
        f"Return JSON with two objects keyed by locale ({locales}):\n"
        '{"nameI18n": {<locale>: "2-4 word friendly name"}, '
        '"descriptionI18n": {<locale>: "one short sentence"}}\n'
        "Keep names concise; never transliterate the brand and keep math terms standard."
    )


def enrich_concept(node: dict[str, Any]) -> dict[str, Any]:
    """Return {nameI18n, descriptionI18n} for one concept_nodes doc."""
    _prompt = _build_prompt(
        node.get("label", ""),
        node.get("keywords", []),
        node.get("_sampleSnippets", []),  # caller would fetch from concept_occurrences/book_pages
    )
    # TODO(enrichment): call Gemini with `_prompt`, parse the JSON, validate all 7 locales present.
    raise NotImplementedError("Wire Gemini here; see _build_prompt for the contract.")


def run(subject: str | None = None) -> None:
    """Iterate concept_nodes (optionally one subject) and write nameI18n/descriptionI18n."""
    # TODO(enrichment): from shared.mongodb_client import get_mongodb_client; iterate
    #   concept_nodes (filter by subject if given), call enrich_concept, then
    #   mdb["concept_nodes"].update_one({"_id": node["_id"]}, {"$set": result}).
    raise NotImplementedError("Scaffold only — see module docstring.")


if __name__ == "__main__":
    import sys
    run(sys.argv[1] if len(sys.argv) > 1 else None)
