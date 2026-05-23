"""Pure-Python language detector for MoE textbook records.

Replaces the 3-way (ar/en/fr) heuristic embedded in
`harvester_agent/agent.py` with a 7-way classifier that recognizes every
instruction language that actually appears in the Egyptian MoE catalog:

    ar  Arabic    (default)
    en  English
    fr  French
    de  German
    es  Spanish
    it  Italian
    zh  Chinese (Mandarin)

The detector inspects both the Arabic `subject` field (e.g.
"اللغة الألمانية لغة تانية") and the Latin `filename` / URL fragment
(e.g. "Deutsch_language_Sec3.pdf"), so it works whether the caller has the
human-readable subject, the upstream blob path, or both.

This module is intentionally side-effect-free and dependency-free so it can
be imported from anywhere — the harvester, a backfill script, the analyzer,
unit tests, or the ADK agent wrapper in `agent.py`.
"""
from __future__ import annotations

from typing import Tuple

SUPPORTED_LANGUAGES: tuple[str, ...] = ("ar", "en", "fr", "de", "es", "it", "zh")

LANGUAGE_NAMES: dict[str, dict[str, str]] = {
    "ar": {"en": "Arabic",   "native": "العربية"},
    "en": {"en": "English",  "native": "English"},
    "fr": {"en": "French",   "native": "Français"},
    "de": {"en": "German",   "native": "Deutsch"},
    "es": {"en": "Spanish",  "native": "Español"},
    "it": {"en": "Italian",  "native": "Italiano"},
    "zh": {"en": "Chinese",  "native": "中文"},
}

# Order matters: more specific tokens first so e.g. "اللغة الإنجليزية"
# matches `en` before the Arabic-script `ar` token could ever fire.
# Within each rule:
#   - Arabic-script tokens cover MoE subject names ("اللغة الفرنسية")
#   - Latin tokens cover the blob filenames ("French_Language_Sec3.pdf")
#   - Underscore-bounded codes cover abbreviated forms ("_FR_Sec2_TR2",
#     "Chemistry_FR_2_Secondary_TR2.pdf")
#
# Everything is lowercased before matching so token casing here is irrelevant
# except for readability.
_LANG_RULES: Tuple[Tuple[str, Tuple[str, ...]], ...] = (
    ("zh", (
        "الصينية", "صينية",
        "chinese", "chinois", "chino", "cinese", "mandarin",
        "_zh_", "_zh.",
    )),
    ("de", (
        "الألمانية", "الالمانية", "ألمانية",
        "german", "deutsch", "allemand", "alem", "tedesco",
        "_de_", "_de.",
    )),
    ("es", (
        "الإسبانية", "الاسبانية", "إسبانية",
        "spanish", "español", "espanol", "espa%c3%b1ol", "espanhol",
        "_es_", "_es.",
    )),
    ("it", (
        "الإيطالية", "الايطالية", "إيطالية",
        "italian", "italiano", "italien",
        "_it_", "_it.",
    )),
    ("fr", (
        "الفرنسية", "فرنسية",
        "french", "français", "francais", "francese",
        "_fr_", "_fr.",
    )),
    ("en", (
        "الإنجليزية", "الانجليزية", "إنجليزية", "انجليزية",
        "english", "anglais", "ingles", "inglés", "inglese",
        "_en_", "_en.",
    )),
)

DEFAULT_LANGUAGE = "ar"


def detect_language(subject: str = "", filename: str = "") -> str:
    """Return one of: ar, en, fr, de, es, it, zh. Default `ar`.

    Pass whatever you have. `filename` may be a bare filename, a full URL,
    or a GCS path — only the lowercased substring is inspected.
    """
    code, _ = detect_language_verbose(subject=subject, filename=filename)
    return code


def detect_language_verbose(subject: str = "", filename: str = "") -> Tuple[str, str]:
    """Return (code, matched_token). `matched_token` is the substring that
    triggered the match, or "default" when nothing matched.

    Useful for the backfill script's audit trail.
    """
    sub_lower = (subject or "").lower()
    f_lower = (filename or "").lower()
    for code, tokens in _LANG_RULES:
        for tok in tokens:
            if tok in sub_lower:
                return code, tok
            if tok in f_lower:
                return code, tok
    return DEFAULT_LANGUAGE, "default"
