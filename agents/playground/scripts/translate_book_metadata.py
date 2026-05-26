"""Pre-translate book metadata (title + subtitle) into all 7 UI locales and
store it on each book doc as `titleI18n` / `subI18n`.

Why
---
Book metadata is stored only as ar/en pairs (arT/enT, arSub/enSub), so a
French/German/… UI shows English (or Arabic) titles. The web reads
`titleI18n[locale]` / `subI18n[locale]` when present (see web/src/lib/books.ts
bookTitle/bookSubtitle), falling back to ar/en otherwise. This batch fills those
fields once so the catalog reads in the user's language with no per-view cost.

This is a standalone maintenance script (NOT wired into ingestion). Running it
makes real Gemini calls over the whole catalog — run it deliberately.

Usage (from agents/playground, venv active)
-------------------------------------------
    python -m scripts.translate_book_metadata --dry-run --limit 5
    python -m scripts.translate_book_metadata --limit 50
    python -m scripts.translate_book_metadata --book <bookId> --force
    python -m scripts.translate_book_metadata            # whole catalog

Flags: --limit N, --book ID, --force (retranslate present locales), --dry-run.
Idempotent: skips locales already populated unless --force.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from google import genai
from google.genai import types

from shared.mongodb_client import get_mongodb_client

LOCALES = ["ar", "en", "fr", "de", "es", "it", "zh"]
LOCALE_NAMES = {
    "ar": "Egyptian Arabic", "en": "English", "fr": "French", "de": "German",
    "es": "Spanish", "it": "Italian", "zh": "Simplified Chinese",
}
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")


def _base(doc: dict) -> tuple[str, str, str]:
    """Pick the base title/subtitle and the locale they're written in."""
    en_t = (doc.get("enT") or doc.get("enTitle") or "").strip()
    ar_t = (doc.get("arT") or doc.get("arTitle") or "").strip()
    title = en_t or ar_t or (doc.get("title") or "").strip()
    base_loc = "en" if en_t else "ar"
    sub = (doc.get("enSub") if base_loc == "en" else doc.get("arSub")) or doc.get("arSub") or doc.get("enSub") or ""
    return title, str(sub).strip(), base_loc


def _strip_surrogates(s: str) -> str:
    return "".join(c for c in s if not (0xD800 <= ord(c) <= 0xDFFF))


def translate_metadata(client: genai.Client, title: str, subtitle: str, base_loc: str, targets: list[str]) -> dict:
    """One Gemini call → {locale: {title, subtitle}} for every target locale."""
    if not targets:
        return {}
    names = ", ".join(f'"{l}" ({LOCALE_NAMES[l]})' for l in targets)
    prompt = (
        "You translate short Egyptian school-textbook metadata. Translate the TITLE and "
        f"SUBTITLE below (written in {LOCALE_NAMES.get(base_loc, base_loc)}) into each of these "
        f"locales: {names}. Keep proper nouns, grade/term codes, numbers, and the brand '5sosy' "
        "unchanged. Reply with ONLY a JSON object mapping each locale code to "
        '{"title": "...", "subtitle": "..."} and nothing else.\n\n'
        f"TITLE: {title}\nSUBTITLE: {subtitle}"
    )
    resp = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0, response_mime_type="application/json"),
    )
    raw = _strip_surrogates((getattr(resp, "text", None) or "").strip())
    try:
        data = json.loads(raw)
    except Exception:
        # tolerate a fenced block
        raw = raw.strip().lstrip("`").rstrip("`")
        if raw.startswith("json"):
            raw = raw[4:]
        data = json.loads(raw)
    return data if isinstance(data, dict) else {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="max books to process (0 = all)")
    ap.add_argument("--book", type=str, default=None, help="only this book _id")
    ap.add_argument("--force", action="store_true", help="retranslate even if locale present")
    ap.add_argument("--dry-run", action="store_true", help="don't write to MongoDB")
    args = ap.parse_args()

    _, db = get_mongodb_client()
    coll = db["books"]
    query = {"_id": args.book} if args.book else {}
    proj = {"arT": 1, "enT": 1, "arTitle": 1, "enTitle": 1, "title": 1, "arSub": 1,
            "enSub": 1, "language": 1, "titleI18n": 1, "subI18n": 1}
    cursor = coll.find(query, proj)
    if args.limit:
        cursor = cursor.limit(args.limit)

    client = genai.Client()
    processed = updated = skipped = errors = 0

    for doc in cursor:
        processed += 1
        bid = doc.get("_id")
        title, subtitle, base_loc = _base(doc)
        if not title:
            skipped += 1
            continue
        title_i18n = dict(doc.get("titleI18n") or {})
        sub_i18n = dict(doc.get("subI18n") or {})
        # Seed the base ar/en entries from existing fields.
        if doc.get("arT") and not title_i18n.get("ar"):
            title_i18n["ar"] = doc["arT"]
        if doc.get("enT") and not title_i18n.get("en"):
            title_i18n["en"] = doc["enT"]
        if doc.get("arSub") and not sub_i18n.get("ar"):
            sub_i18n["ar"] = doc["arSub"]
        if doc.get("enSub") and not sub_i18n.get("en"):
            sub_i18n["en"] = doc["enSub"]

        targets = [l for l in LOCALES if args.force or l not in title_i18n or l not in sub_i18n]
        if not targets:
            skipped += 1
            continue
        try:
            out = translate_metadata(client, title, subtitle, base_loc, targets)
        except Exception as e:
            errors += 1
            print(f"  ! {bid}: translation failed: {e}", file=sys.stderr)
            continue

        for loc in targets:
            entry = out.get(loc) or {}
            t = (entry.get("title") or "").strip()
            s = (entry.get("subtitle") or "").strip()
            if t:
                title_i18n[loc] = _strip_surrogates(t)
            if s:
                sub_i18n[loc] = _strip_surrogates(s)

        if args.dry_run:
            print(f"  ~ {bid}: would set titleI18n={list(title_i18n)} subI18n={list(sub_i18n)}")
            updated += 1
            continue
        coll.update_one({"_id": bid}, {"$set": {"titleI18n": title_i18n, "subI18n": sub_i18n}})
        updated += 1
        if updated % 25 == 0:
            print(f"  … {updated} updated")

    print(f"done. processed={processed} updated={updated} skipped={skipped} errors={errors}"
          + (" (dry-run)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
