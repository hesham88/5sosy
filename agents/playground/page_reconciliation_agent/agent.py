"""Page reconciliation pipeline (Batch 2).

Root cause of weak subject search: `book_pages` documents carry empty
`subject` / `grade` / `type` / `language` fields, so the search endpoint can't
pre-filter in-index and must resolve every hit through the `books` collection,
and grade/type filters can't be pushed into the Atlas vector index at all.

This worker reconciles each `book_pages` doc against its parent `books` doc:

  1. Denormalize `subject`, `grade`, `type`, `language` + a derived
     `bookType` ('core' | 'supporting') onto every page → enables fast in-index
     pre-filtering and correct subject grouping.
  2. Extract lightweight statistical `keywords[]` from page text (no LLM) so the
     mind-map worker and lexical search have keyphrases to anchor on.
  3. Report pages with empty `text` (an upstream OCR/migration gap) so the data
     quality problem is visible and actionable.

Idempotent: safe to re-run; only writes fields that changed.

Performance: processes books in batches, bulk-writes page updates, never loads a
whole collection into RAM. No model calls.
"""
from __future__ import annotations

import os
import re
import time
from collections import Counter
from datetime import datetime, timezone

from shared.hybrid_rank import is_core_material

# Minimal multilingual stopword set for keyword extraction (kept tiny on purpose;
# the goal is signal keyphrases, not perfect linguistics).
_STOP = {
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
    "في", "من", "على", "الى", "إلى", "عن", "هذا", "هذه", "التي", "الذي", "كان",
}
_WORD = re.compile(r"[A-Za-z؀-ۿ]{3,}")

KEYWORDS_PER_PAGE = int(os.getenv("RECONCILE_KEYWORDS_PER_PAGE", "8"))
BOOK_BATCH = int(os.getenv("RECONCILE_BOOK_BATCH", "50"))


def _extract_keywords(text: str, k: int = KEYWORDS_PER_PAGE) -> list[str]:
    """Cheap frequency-based keyphrase extraction (TF over content tokens).
    Replaceable with YAKE/RAKE later; deliberately dependency-free here."""
    if not text:
        return []
    counts: Counter[str] = Counter()
    for w in _WORD.findall(text.lower()):
        if w in _STOP:
            continue
        counts[w] += 1
    return [w for w, _ in counts.most_common(k)]


def _log(status_ref, text: str, level: str = "info") -> None:
    if status_ref is None:
        print(f"[reconcile] {text}")
        return
    try:
        from google.cloud import firestore
        doc = status_ref.get().to_dict() or {}
        logs = doc.get("logs", [])
        logs.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "text": text, "status": level, "agent": "Reconciler",
        })
        status_ref.update({
            "logs": logs[-50:],
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
        })
    except Exception as e:  # noqa: BLE001
        print(f"[reconcile] log failed ({e}): {text}")


def run_reconciliation_pipeline(status_ref=None) -> dict:
    """Reconcile book_pages metadata against books. Returns a summary dict.

    `status_ref` is an optional Firestore doc ref for heartbeat/progress (the job
    entrypoint passes `ingestion/reconcile_status`). Pass None for a local run.
    """
    from pymongo import UpdateOne
    from shared.mongodb_client import get_mongodb_client

    _, mdb = get_mongodb_client()
    books = mdb["books"]
    pages = mdb["book_pages"]

    total_books = books.count_documents({})
    _log(status_ref, f"Reconciliation starting over {total_books} books.")

    processed_books = 0
    updated_pages = 0
    empty_text_pages = 0
    skipped_no_subject = 0
    started = time.time()

    cursor = books.find({}, {"subject": 1, "grade": 1, "type": 1, "language": 1})
    for book in cursor:
        bid = book.get("_id")
        subject = book.get("subject") or ""
        if not subject:
            skipped_no_subject += 1
            continue
        grade = book.get("grade") or ""
        btype = book.get("type") or ""
        language = book.get("language") or ""
        book_type = "core" if is_core_material(btype) else "supporting"

        ops: list = []
        for pg in pages.find({"bookId": bid}, {"text": 1}):
            text = pg.get("text") or ""
            if not text:
                empty_text_pages += 1
            update = {
                "subject": subject,
                "grade": grade,
                "type": btype,
                "language": language,
                "bookType": book_type,
            }
            kws = _extract_keywords(text)
            if kws:
                update["keywords"] = kws
            ops.append(UpdateOne({"_id": pg["_id"]}, {"$set": update}))

        if ops:
            res = pages.bulk_write(ops, ordered=False)
            updated_pages += res.modified_count

        processed_books += 1
        if processed_books % BOOK_BATCH == 0:
            _log(status_ref, f"…{processed_books}/{total_books} books, {updated_pages} pages updated.")

    summary = {
        "ok": True,
        "books": processed_books,
        "pagesUpdated": updated_pages,
        "emptyTextPages": empty_text_pages,
        "booksSkippedNoSubject": skipped_no_subject,
        "elapsedSec": round(time.time() - started, 1),
    }
    _log(
        status_ref,
        f"Reconciliation done: {processed_books} books, {updated_pages} pages updated, "
        f"{empty_text_pages} empty-text pages flagged.",
        "ok" if empty_text_pages == 0 else "warn",
    )
    return summary
