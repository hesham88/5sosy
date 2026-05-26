"""Optional concept-labelling agent (Batch 2, Part 4).

The clustering pipeline labels each concept with its top keyword by default (zero
model cost). For nicer human-readable concept names, this agent turns a cluster's
keywords + a couple of sample snippets into a short canonical concept label
(e.g. keywords ["photosynthesis","chloroplast","light"] → "Photosynthesis").

Used sparingly: at most ONE call per concept cluster, run as a batched offline
pass inside the mind-map Job — never on the search hot path. Keeping it as a
discrete agent honours the additive-changes convention (wire-in is a separate,
approved step).
"""
from __future__ import annotations

import os

from google.adk.agents.llm_agent import Agent

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")


def propose_concept_label(keywords: list[str], samples: list[str]) -> dict:
    """Heuristic fallback label (no model): the most salient keyword, title-cased.
    The agent may override with a cleaner phrase. Always returns status 'ok'."""
    label = (keywords[0] if keywords else "concept").strip()
    return {"status": "ok", "label": label.title() if label.isascii() else label}


INSTRUCTION = """\
You name educational concepts. Given a cluster's keywords and sample text snippets,
return a single short, canonical concept label (1–4 words) in the dominant language of
the samples — the abstract idea, not a sentence. Prefer the standard curriculum term.
Call propose_concept_label first; override only if you can produce a clearly better
label. Respond with just the label.
"""

root_agent = Agent(
    model=MODEL,
    name="concept_labeller",
    description="Names a concept cluster from its keywords and sample snippets.",
    instruction=INSTRUCTION,
    tools=[propose_concept_label],
)
