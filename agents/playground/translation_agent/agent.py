"""ADK translation agent — session-scoped, never persisted.

Purpose (axis 4 of the locale model)
------------------------------------
A French student selects an Arabic physics textbook. The book stays in
Arabic in storage (axis 2 = `book.language`); the UI shell stays in
French (axis 1 = `user.locale`). When the student opens a page, they
can request a temporary French rendering — that's this agent.

Translations are *transient*: returned to the caller, never written
back to MongoDB. The web layer is expected to cache them in session
storage / React state for the duration of the reading session and drop
them on navigation away.

Two modes
---------
* `pedagogical` (default) — preserves teaching intent. Worked-example
  prices/currencies/places can be adapted where cultural grounding
  matters, but equations, chemical formulas, exam-question wording, and
  proper nouns stay verbatim. The translator is told this is for a
  student studying for a national exam.
* `literal` — word-for-word. No cultural adaptation, no rephrasing.
  Use this when fidelity matters more than readability (e.g. an exam
  rubric, a legal definition).

Output shape
------------
Returns the translated text along with a `dir` hint (`rtl`/`ltr`) for
the target locale, so the web client can wrap the result in the right
direction without re-deriving it.

Wiring note
-----------
This is a standalone agent. It does NOT modify the existing
orchestrator/executor prompts; if you want translation reachable from
the chat surface, add it as a sub-agent in a separate, reviewable PR.
"""
from __future__ import annotations

import os
from typing import Any, Literal

from google.adk.agents.llm_agent import Agent

# Reuse the supported-locale set and dir hint logic from the existing
# language_detection_agent helpers so the two stay in lockstep.
from language_detection_agent.detector import (
    LANGUAGE_NAMES,
    SUPPORTED_LANGUAGES,
)

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

# Only Arabic is RTL across our 7-language set. If we ever add Hebrew /
# Persian / Urdu, extend this set in one place.
_RTL = {"ar"}

TranslationMode = Literal["pedagogical", "literal"]


def _dir_for(locale: str) -> str:
    return "rtl" if locale in _RTL else "ltr"


def translate_text(
    text: str,
    source_locale: str,
    target_locale: str,
    mode: TranslationMode = "pedagogical",
    context: str = "",
) -> dict[str, Any]:
    """Translate a chunk of textbook content from `source_locale` to
    `target_locale`.

    Args:
        text:           The string to translate (markdown OK; equations,
                        ```code fences```, and \\(latex\\) survive unchanged).
        source_locale:  One of ar/en/fr/de/es/it/zh.
        target_locale:  One of ar/en/fr/de/es/it/zh.
        mode:           "pedagogical" (default) or "literal".
        context:        Optional. e.g. "Grade 11 Physics, Gas Laws chapter,
                        worked example". Helps the translator preserve
                        pedagogical intent in `pedagogical` mode.

    Returns:
        {
          "status": "ok" | "skipped" | "error",
          "translated": "<text in target language>",
          "source_locale": "<src>",
          "target_locale": "<tgt>",
          "mode": "<mode>",
          "dir": "rtl" | "ltr",   # for target_locale
          "lang": "<target_locale BCP-47 hint>",
          "warnings": [ ... ],
          "persist": False,        # always — translations are session-only
        }
    """
    src = (source_locale or "").lower()
    tgt = (target_locale or "").lower()

    if src == tgt:
        return {
            "status": "skipped",
            "translated": text,
            "source_locale": src,
            "target_locale": tgt,
            "mode": mode,
            "dir": _dir_for(tgt),
            "lang": tgt,
            "warnings": ["source and target locale match; returning input unchanged"],
            "persist": False,
        }

    if src not in SUPPORTED_LANGUAGES or tgt not in SUPPORTED_LANGUAGES:
        return {
            "status": "error",
            "translated": "",
            "source_locale": src,
            "target_locale": tgt,
            "mode": mode,
            "dir": _dir_for(tgt) if tgt in SUPPORTED_LANGUAGES else "ltr",
            "lang": tgt,
            "warnings": [
                f"unsupported locale; supported = {list(SUPPORTED_LANGUAGES)}",
            ],
            "persist": False,
        }

    # NOTE: the actual model call is performed by the ADK runtime via this
    # agent's INSTRUCTION + the tool's structured return. The model reads
    # the args, generates the translation, and the runtime threads the
    # result back as the function's effective output. We return the
    # envelope; the `translated` field gets filled in by the agent loop.
    src_name = LANGUAGE_NAMES.get(src, {}).get("en", src)
    tgt_name = LANGUAGE_NAMES.get(tgt, {}).get("en", tgt)
    warnings: list[str] = []
    if mode == "literal":
        warnings.append("literal mode — no cultural adaptation; keep wording faithful")

    return {
        "status": "ok",
        "translated": text,  # placeholder — agent rewrites this from instruction
        "source_locale": src,
        "target_locale": tgt,
        "source_locale_name": src_name,
        "target_locale_name": tgt_name,
        "mode": mode,
        "context": context,
        "dir": _dir_for(tgt),
        "lang": tgt,
        "warnings": warnings,
        "persist": False,
    }


INSTRUCTION = """\
You are 5sosy's session-scoped translator. You translate Egyptian MoE
textbook content for a student who selected a different reading language
than the book's original language.

When invoked, call `translate_text(text, source_locale, target_locale,
mode, context)` exactly once with the input you were given. Then return
ONE message: the translated text only, no preamble, no quotes, no
explanation. The runtime will package the metadata for you.

Modes
-----
- `pedagogical` (default) → preserve TEACHING INTENT.
  • Translate prose naturally into the target language.
  • Worked-example numbers / units / place names MAY be localized if
    cultural grounding helps the student (EGP → EUR when teaching
    French students about price problems, "Cairo" → "Le Caire").
  • NEVER alter: chemical formulas, mathematical equations, code
    blocks, exam-style question stems, proper nouns of historical
    figures, scripture quotations, the brand name "5sosy".
  • Preserve markdown structure (headers, lists, **bold**, *italic*).
  • Preserve LaTeX between \\( \\) and $$ $$.

- `literal` → word-for-word fidelity.
  • Translate every sentence faithfully. No cultural adaptation.
  • Worked examples keep their original numbers, units, and place
    names. Use this for exam rubrics or legal-style definitions.

Direction
---------
The target language carries its own writing direction (right-to-left
for Arabic, left-to-right for English/French/German/Spanish/Italian/
Chinese). Do not embed `dir=` markers in the output — the caller wraps
the returned text in a LocaleBlock based on `target_locale`.

Hard rules
----------
- Never write the translated text back to a database. Translations are
  ephemeral. The `persist` flag in the tool result is always False.
- If `source_locale == target_locale`, return the input verbatim and
  set status="skipped".
- If either locale is outside ar/en/fr/de/es/it/zh, return
  status="error" and an empty translated string.
"""

root_agent = Agent(
    model=MODEL,
    name="translator",
    description=(
        "Session-scoped, never-persisted translator for MoE textbook content. "
        "Pedagogical by default, literal on request. Source/target locales in "
        "ar/en/fr/de/es/it/zh."
    ),
    instruction=INSTRUCTION,
    tools=[translate_text],
)
