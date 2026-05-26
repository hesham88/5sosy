"""Pre-translate book metadata into all 7 UI locales and store per-field i18n
maps on each book doc: titleI18n, typeI18n, gradeI18n, termI18n, stageI18n.

Why
---
Book metadata (title, type, grade, term, stage) is stored only in Arabic
(the en* fields are Arabic placeholders), so a French/German/… UI shows Arabic
labels. The web reads `<field>I18n[locale]` when present (web/src/lib/books.ts),
falling back to ar/en otherwise. This batch fills those maps once so the catalog
reads in the user's language with no per-view cost.

Standalone maintenance script (NOT wired into ingestion). Batches ~25 books per
Gemini call (gemini-3.1-flash-lite); ~60 calls for the ~1500-book catalog
(≈$0.20). Run deliberately.

Usage (from agents/playground, venv active)
-------------------------------------------
    python -m scripts.translate_book_metadata --dry-run --limit 5
    python -m scripts.translate_book_metadata --batch-size 25
    python -m scripts.translate_book_metadata --book <bookId> --force

Flags: --limit N, --batch-size N (default 25), --book ID, --force, --dry-run.
Idempotent: skips field-maps already complete unless --force.
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

# (logical field, stored i18n map field, ar source keys, en source keys, raw key,
#  en_is_real). en_is_real=True only for title — the other en* fields hold Arabic
#  placeholders, so we never seed `en` from them; the model produces real English.
FIELDS = [
    ("title", "titleI18n", ["arT", "arTitle"], ["enT", "enTitle"], "title", True),
    ("type", "typeI18n", ["arType"], ["enType"], "type", False),
    ("grade", "gradeI18n", ["arGrade"], ["enGrade"], "grade", False),
    ("term", "termI18n", ["arTerm"], ["enTerm"], "term", False),
    ("stage", "stageI18n", ["arStage"], ["enStage"], "stage", False),
]


def _first(doc: dict, keys: list[str]) -> str:
    for k in keys:
        v = (doc.get(k) or "").strip() if isinstance(doc.get(k), str) else ""
        if v:
            return v
    return ""


def _strip_surrogates(s: str) -> str:
    return "".join(c for c in s if not (0xD800 <= ord(c) <= 0xDFFF))


def _loads(raw: str) -> dict:
    raw = _strip_surrogates(raw.strip())
    try:
        return json.loads(raw)
    except Exception:
        raw = raw.strip().lstrip("`").rstrip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:]
        return json.loads(raw)


def translate_batch(client: genai.Client, items: list[dict]) -> dict:
    """One Gemini call for a batch. items: [{"id", "fields": {field: source_text}}].
    Returns {id: {field: {locale: value}}} with all 7 locales per provided field."""
    if not items:
        return {}
    langs = ", ".join(f'"{l}" ({LOCALE_NAMES[l]})' for l in LOCALES)
    payload = [{"id": it["id"], "fields": it["fields"]} for it in items]
    prompt = (
        "You translate short Egyptian school-textbook metadata labels (titles, book types, "
        "grade levels, terms, education stages). For EACH book and EACH provided field, translate "
        f"the value into ALL of these locales: {langs}. Keep proper nouns, numbers, model/week "
        "numbers, and the brand '5sosy' intact. Reply with ONLY a JSON object mapping each book id "
        'to {"<field>": {"<locale>": "<translation>", ...}, ...}, covering every locale for every '
        "provided field, and nothing else.\n\nBOOKS (JSON):\n" + json.dumps(payload, ensure_ascii=False)
    )
    resp = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0, response_mime_type="application/json"),
    )
    data = _loads(getattr(resp, "text", None) or "")
    return data if isinstance(data, dict) else {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--batch-size", type=int, default=25)
    ap.add_argument("--book", type=str, default=None)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    _, db = get_mongodb_client()
    coll = db["books"]
    query = {"_id": args.book} if args.book else {}
    proj = {f: 1 for f in (
        "arT", "enT", "arTitle", "enTitle", "title", "arType", "enType", "type",
        "arGrade", "enGrade", "grade", "arTerm", "enTerm", "term", "arStage", "enStage", "stage",
        "titleI18n", "typeI18n", "gradeI18n", "termI18n", "stageI18n",
    )}
    cursor = coll.find(query, proj)
    if args.limit:
        cursor = cursor.limit(args.limit)
    docs = list(cursor)

    client = genai.Client()
    processed = updated = skipped = errors = calls = 0

    work: list[dict] = []   # [{id, fields:{field:source}}]
    state: dict[str, dict] = {}   # id -> {map_field: {locale:val}} pre-seeded

    for doc in docs:
        processed += 1
        bid = str(doc.get("_id"))
        maps: dict[str, dict] = {}
        to_translate: dict[str, str] = {}
        for fkey, mfield, ar_keys, en_keys, raw_key, en_real in FIELDS:
            existing = dict(doc.get(mfield) or {})
            ar_val = _first(doc, ar_keys) or _first(doc, [raw_key])
            en_val = _first(doc, en_keys)
            # Seed exact-language values we trust.
            if ar_val and not existing.get("ar"):
                existing["ar"] = ar_val
            if en_real and en_val and not existing.get("en"):
                existing["en"] = en_val
            source = (en_val if en_real else "") or ar_val or _first(doc, [raw_key])
            maps[mfield] = existing
            missing = [l for l in LOCALES if args.force or l not in existing]
            if source and missing:
                to_translate[fkey] = source
        if not to_translate:
            skipped += 1
            continue
        state[bid] = {"maps": maps}
        work.append({"id": bid, "fields": to_translate})

    # field key -> map field name
    KEY2MAP = {fkey: mfield for fkey, mfield, *_ in FIELDS}

    bsize = max(1, args.batch_size)
    for i in range(0, len(work), bsize):
        batch = work[i:i + bsize]
        calls += 1
        try:
            out = translate_batch(client, batch)
        except Exception as e:
            errors += len(batch)
            print(f"  ! batch {calls} ({len(batch)} books) failed: {e}", file=sys.stderr)
            continue

        for it in batch:
            bid = it["id"]
            maps = state[bid]["maps"]
            per = out.get(bid) or {}
            for fkey in it["fields"]:
                mfield = KEY2MAP[fkey]
                trans = per.get(fkey) or {}
                for loc in LOCALES:
                    if args.force or loc not in maps[mfield]:
                        v = (trans.get(loc) or "").strip()
                        if v:
                            maps[mfield][loc] = _strip_surrogates(v)
            if args.dry_run:
                print(f"  ~ {bid}: " + " ".join(f"{m}={list(maps[m])}" for m in maps))
                updated += 1
            else:
                coll.update_one({"_id": bid}, {"$set": {m: maps[m] for m in maps}})
                updated += 1
        print(f"  ... call {calls}: {min(i + bsize, len(work))}/{len(work)} books")

    print(f"done. processed={processed} updated={updated} skipped={skipped} errors={errors} "
          f"calls={calls}" + (" (dry-run)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
