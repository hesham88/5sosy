"""Concept clustering pipeline (Batch 2, Part 4-A).

Perf-first: REUSE the page embeddings already in `book_pages` (never re-embed),
cluster them per subject into language-agnostic concepts, and write:

  concept_nodes        {_id, label, subject, embedding(centroid), keywords[],
                        subjects[], books[], grades[], size}
  concept_occurrences  {conceptId, bookId, subject, pageNumber, language, grade,
                        bookType}   ← one per member page; differentiates CONTENT
                                       by language/grade/core-vs-supporting

A concept is the abstract idea; occurrences are its concrete page treatments, so
the same idea taught in AR core + EN + a question bank collapses onto ONE node.

Clustering here is a dependency-light greedy centroid pass over L2-normalized
vectors (cosine = dot product). It is intentionally simple + swappable: for big
data, replace `_greedy_cluster` with mini-batch k-means / HDBSCAN or Atlas ANN
grouping without changing the persisted shape.

Prereq: run the page reconciliation job first so pages carry subject/grade/
language/bookType/keywords. This pipeline reads those.
"""
from __future__ import annotations

import os
import time

from mindmap_worker_agent.classifier import bucket

# Cosine threshold for merging a page into an existing concept centroid. Higher =
# tighter/more concepts; lower = broader/fewer. Tunable per corpus.
SIM_THRESHOLD = float(os.getenv("MINDMAP_SIM_THRESHOLD", "0.82"))
MIN_CONCEPT_SIZE = int(os.getenv("MINDMAP_MIN_CONCEPT_SIZE", "2"))


def _normalize(vectors):
    import numpy as np
    arr = np.asarray(vectors, dtype="float32")
    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return arr / norms


def _greedy_cluster(norm_vectors, threshold: float):
    """Greedy single-pass clustering on L2-normalized vectors (cosine = dot).
    Returns (labels, centroids). O(n·k) — fine for per-subject page counts;
    swap for mini-batch k-means / Atlas ANN at larger scale."""
    import numpy as np
    centroids: list = []
    sums: list = []
    counts: list[int] = []
    labels: list[int] = []
    for v in norm_vectors:
        if centroids:
            sims = np.dot(np.asarray(centroids), v)
            best = int(np.argmax(sims))
            if sims[best] >= threshold:
                labels.append(best)
                sums[best] += v
                counts[best] += 1
                c = sums[best] / counts[best]
                n = np.linalg.norm(c)
                centroids[best] = c / n if n else c
                continue
        labels.append(len(centroids))
        centroids.append(v.copy())
        sums.append(v.copy())
        counts.append(1)
    return labels, centroids


def run_mindmap_pipeline(status_ref=None, subjects: list[str] | None = None) -> dict:
    """Build concept_nodes + concept_occurrences from reconciled book_pages.

    `subjects`: optional allow-list to limit the run; None = all subjects present
    on pages. Returns a summary dict. No model calls (labels default to top
    keywords; see mindmap_worker_agent.agent for optional LLM labelling).
    """
    from shared.mongodb_client import get_mongodb_client

    _, mdb = get_mongodb_client()
    pages = mdb["book_pages"]
    nodes = mdb["concept_nodes"]
    occ = mdb["concept_occurrences"]

    if subjects is None:
        subjects = [s for s in pages.distinct("subject") if s]

    started = time.time()
    total_concepts = 0
    total_occurrences = 0

    for subject in subjects:
        proj = {"embedding": 1, "bookId": 1, "pageNumber": 1, "language": 1,
                "grade": 1, "bookType": 1, "type": 1, "keywords": 1}
        docs = [d for d in pages.find({"subject": subject, "embedding": {"$exists": True, "$ne": []}}, proj)]
        if len(docs) < MIN_CONCEPT_SIZE:
            continue

        norm = _normalize([d["embedding"] for d in docs])
        labels, centroids = _greedy_cluster(norm, SIM_THRESHOLD)

        # Refresh this subject's concepts so re-runs are idempotent.
        existing_ids = [n["_id"] for n in nodes.find({"subject": subject}, {"_id": 1})]
        if existing_ids:
            occ.delete_many({"conceptId": {"$in": existing_ids}})
            nodes.delete_many({"subject": subject})

        clusters: dict[int, list[int]] = {}
        for i, lab in enumerate(labels):
            clusters.setdefault(lab, []).append(i)

        for lab, members in clusters.items():
            if len(members) < MIN_CONCEPT_SIZE:
                continue
            kw_counts: dict[str, int] = {}
            books_set, grades_set, langs_set = set(), set(), set()
            for mi in members:
                d = docs[mi]
                for k in (d.get("keywords") or []):
                    kw_counts[k] = kw_counts.get(k, 0) + 1
                if d.get("bookId"):
                    books_set.add(d["bookId"])
                if d.get("grade"):
                    grades_set.add(d["grade"])
                if d.get("language"):
                    langs_set.add(d["language"])
            keywords = [k for k, _ in sorted(kw_counts.items(), key=lambda x: -x[1])[:12]]
            concept_id = f"{subject}::{lab}"
            label = keywords[0] if keywords else f"{subject} concept {lab}"

            nodes.insert_one({
                "_id": concept_id,
                "label": label,            # LLM labelling can overwrite later
                "subject": subject,
                "embedding": [float(x) for x in centroids[lab]],
                "keywords": keywords,
                "subjects": [subject],
                "books": sorted(books_set),
                "grades": sorted(grades_set),
                "languages": sorted(langs_set),
                "size": len(members),
            })
            total_concepts += 1

            occ_ops = []
            for mi in members:
                d = docs[mi]
                occ_ops.append({
                    "conceptId": concept_id,
                    "bookId": d.get("bookId"),
                    "subject": subject,
                    "pageNumber": d.get("pageNumber"),
                    "language": d.get("language", ""),
                    "grade": d.get("grade", ""),
                    "bookType": d.get("bookType") or bucket(d.get("type")),
                })
            if occ_ops:
                occ.insert_many(occ_ops)
                total_occurrences += len(occ_ops)

    return {
        "ok": True,
        "subjects": len(subjects),
        "concepts": total_concepts,
        "occurrences": total_occurrences,
        "elapsedSec": round(time.time() - started, 1),
    }
