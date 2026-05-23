"""Shared locale awareness for ADK agents.

Both `orchestrator_agent` and `executor_agent` currently hardcode
"Arabic when locale=ar, English when locale=en". To support the full
7-locale UI (ar/en/fr/de/es/it/zh) without editing those existing files,
this module exports:

  - SUPPORTED_LOCALES  — the canonical 7-code tuple
  - LOCALE_INSTRUCTION — a single sentence to append to any agent's
                         `instruction=` field that makes it locale-aware
  - reply_locale_clause(locale) — runtime helper for tools that produce
                         a final string and want to remind the model
                         which language to emit

The wiring (replacing the hardcoded ar/en clauses in orchestrator/executor
INSTRUCTION strings with `LOCALE_INSTRUCTION`) is a deliberate follow-up
so the existing prompts can be reviewed against the new one side-by-side.
"""
from __future__ import annotations

SUPPORTED_LOCALES: tuple[str, ...] = ("ar", "en", "fr", "de", "es", "it", "zh")

LOCALE_NAMES: dict[str, str] = {
    "ar": "Arabic (Egyptian colloquial where natural; MSA otherwise)",
    "en": "English",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "it": "Italian",
    "zh": "Simplified Chinese (中文 / 简体)",
}

LOCALE_INSTRUCTION = """\
LOCALE — Every turn carries a `locale` value. Reply in that language.
Supported locales and the language to emit:
  ar → Arabic (use Egyptian colloquial when natural, Modern Standard
       Arabic otherwise; numbers and equations stay in Latin script)
  en → English
  fr → French
  de → German
  es → Spanish
  it → Italian
  zh → Simplified Chinese
If `locale` is missing or unrecognized, default to Arabic (ar). Never
mix languages within a single reply unless the user explicitly asks for
a translation pair. Proper nouns, scientific formulas, and the brand
name "5sosy" stay in their original script.
"""


def reply_locale_clause(locale: str) -> str:
    """Return a single-line reminder a tool can prepend to its model prompt."""
    norm = (locale or "ar").lower()
    name = LOCALE_NAMES.get(norm, LOCALE_NAMES["ar"])
    return f"Reply in {name}."
