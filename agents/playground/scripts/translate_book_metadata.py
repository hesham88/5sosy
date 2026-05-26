"""Pre-translate book metadata (title + subtitle) into all 7 UI locales and
store it on each book doc as `titleI18n` / `subI18n`.

Why
---
Book metadata is stored only as ar/en pairs (arT/enT, arSub/enSub), so a
French/German/… UI shows English (or Arabic) titles. The web reads
`titleI18n[locale]` / `subI18n[locale]` when present (see web/src/lib/books.ts
bookTitle/bookSubtitle), falling back to ar/en otherwise. This batch fills those
fields once so the catalog reads in the user's language with no per-view cost.

This is a standalone maintenance script (NOT wired into ingestion). It batches
~50 books per Gemini call (gemini-3.1-flash-lite), so the whole ~1500-book
catalog is ~30 calls (≈$0.10). Run it deliberately.

Usage (from agents/playground, venv active)
-------------------------------------------
    python -m scripts.translate_book_metadata --dry-run --limit 5
    python -m scripts.translate_book_metadata --batch-size 50
    python -m scripts.translate_book_metadata --book <bookId> --force
    python -m scripts.translate_book_metadata            # whole catalog

Flags: --limit N, --batch-size N (default 50), --book ID, --force, --dry-run.
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
    """One Gemini call for up to N books.

    items: [{"id": str, "title": str, "subtitle": str, "base": "ar"|"en"}]
    Returns {id: {locale: {"title": str, "subtitle": str}}}.
    """
    if not items:
        return {}
    langs = ", ".join(f'"{l}" ({LOCALE_NAMES[l]})' for l in LOCALES)
    payload = [{"id": it["id"], "title": it["title"], "subtitle": it["subtitle"]} for it in items]
    prompt = (
        "You translate short Egyptian school-textbook metadata. For EACH book below, translate "
        f"its title and subtitle into ALL of these locales: {langs}. Keep proper nouns, grade/term "
        "codes, numbers, and the brand '5sosy' unchanged. If a field is empty, return an empty string. "
        'Reply with ONLY a JSON object mapping each book id to '
        '{"<locale>": {"title": "...", "subtitle": "..."}, ...} for every locale, and nothing else.\n\n'
        "BOOKS (JSON):\n" + json.dumps(payload, ensure_ascii=False)
    )
    resp = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0, response_mime_type="application/json"),
    )
    data = _loads(getattr(resp, "text", None) or "")
    return data if isinstance(data, dict) else {}


def _seed_existing(doc: dict, title_i18n: dict, sub_i18n: dict) -> None:
    """Carry the already-stored ar/en fields into the i18n maps untouched."""
    if doc.get("arT") and not title_i18n.get("ar"):
        title_i18n["ar"] = doc["arT"]
    if doc.get("enT") and not title_i18n.get("en"):
        title_i18n["en"] = doc["enT"]
    if doc.get("arSub") and not sub_i18n.get("ar"):
        sub_i18n["ar"] = doc["arSub"]
    if doc.get("enSub") and not sub_i18n.get("en"):
        sub_i18n["en"] = doc["enSub"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="max books to process (0 = all)")
    ap.add_argument("--batch-size", type=int, default=50, help="books per Gemini call")
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
    docs = list(cursor)

    client = genai.Client()
    processed = updated = skipped = errors = calls = 0

    # Build the work list: only books with at least one missing locale (unless --force).
    work: list[dict] = []
    state: dict[str, dict] = {}  # id -> {title_i18n, sub_i18n, targets}
    for doc in docs:
        processed += 1
        bid = str(doc.get("_id"))
        title, subtitle, base_loc = _base(doc)
        if not title:
            skipped += 1
            continue
        title_i18n = dict(doc.get("titleI18n") or {})
        sub_i18n = dict(doc.get("subI18n") or {})
        _seed_existing(doc, title_i18n, sub_i18n)
        targets = [l for l in LOCALES if args.force or l not in title_i18n or l not in sub_i18n]
        if not targets:
            skipped += 1
            continue
        state[bid] = {"title_i18n": title_i18n, "sub_i18n": sub_i18n, "targets": set(targets)}
        work.append({"id": bid, "title": title, "subtitle": subtitle, "base": base_loc})

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
            st = state[bid]
            per = out.get(bid) or {}
            for loc in st["targets"]:
                entry = per.get(loc) or {}
                t = (entry.get("title") or "").strip()
                s = (entry.get("subtitle") or "").strip()
                if t:
                    st["title_i18n"][loc] = _strip_surrogates(t)
                if s:
                    st["sub_i18n"][loc] = _strip_surrogates(s)
            if args.dry_run:
                print(f"  ~ {bid}: titleI18n={list(st['title_i18n'])}")
                updated += 1
            else:
                coll.update_one({"_id": bid},
                                {"$set": {"titleI18n": st["title_i18n"], "subI18n": st["sub_i18n"]}})
                updated += 1
        print(f"  … call {calls}: {min(i + bsize, len(work))}/{len(work)} books")

    print(f"done. processed={processed} updated={updated} skipped={skipped} errors={errors} "
          f"calls={calls}" + (" (dry-run)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
