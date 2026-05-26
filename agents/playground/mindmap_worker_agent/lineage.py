"""Cross-Grade Lineage Mapping (Batch 2, Part 4-B).

Builds `concept_edges` between concept_nodes purely from centroid cosine — no
LLM. When two concepts (in the same subject) are semantically close but sit at
different grade levels, the earlier-grade concept points forward to the later one
as `prerequisite_for` (and the reverse `child_of`); same-grade near-duplicates
get a `related` edge.

  concept_edges  {_id, from, to, relation, score, subject}
                 relation ∈ prerequisite_for | child_of | related
"""
from __future__ import annotations

import os
import time

LINEAGE_THRESHOLD = float(os.getenv("MINDMAP_LINEAGE_THRESHOLD", "0.6"))


def _grade_rank(grade: str) -> int:
    """Coarse academic ordering (higher = older student). Mirrors the web
    gradeRank heuristic over the Arabic stage/ordinal tokens."""
    s = grade or ""
    stage = 0
    if "ثانوي" in s:
        stage = 3
    elif "عداد" in s:
        stage = 2
    elif "ابتدائ" in s or "بتدائ" in s:
        stage = 1
    ordinals = {"الأول": 1, "الاول": 1, "الثاني": 2, "الثالث": 3, "الرابع": 4, "الخامس": 5, "السادس": 6}
    n = next((v for k, v in ordinals.items() if k in s), 0)
    return stage * 10 + n


def _min_grade_rank(grades: list[str]) -> int:
    ranks = [_grade_rank(g) for g in (grades or []) if g]
    return min(ranks) if ranks else 0


def run_lineage(status_ref=None, subjects: list[str] | None = None) -> dict:
    """Compute cross-grade lineage edges over existing concept_nodes. Idempotent
    per subject. Returns a summary dict."""
    import numpy as np
    from shared.mongodb_client import get_mongodb_client

    _, mdb = get_mongodb_client()
    nodes = mdb["concept_nodes"]
    edges = mdb["concept_edges"]

    if subjects is None:
        subjects = [s for s in nodes.distinct("subject") if s]

    started = time.time()
    total_edges = 0

    for subject in subjects:
        items = list(nodes.find(
            {"subject": subject, "embedding": {"$exists": True, "$ne": []}},
            {"embedding": 1, "grades": 1},
        ))
        if len(items) < 2:
            continue

        edges.delete_many({"subject": subject})

        vecs = np.asarray([it["embedding"] for it in items], dtype="float32")
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        vecs = vecs / norms
        sims = vecs @ vecs.T
        ranks = [_min_grade_rank(it.get("grades", [])) for it in items]
        ids = [it["_id"] for it in items]

        ops = []
        n = len(items)
        for i in range(n):
            for j in range(i + 1, n):
                score = float(sims[i, j])
                if score < LINEAGE_THRESHOLD:
                    continue
                ri, rj = ranks[i], ranks[j]
                if ri == rj:
                    ops.append({"from": ids[i], "to": ids[j], "relation": "related",
                                "score": round(score, 4), "subject": subject})
                else:
                    lo, hi = (i, j) if ri < rj else (j, i)
                    ops.append({"from": ids[lo], "to": ids[hi], "relation": "prerequisite_for",
                                "score": round(score, 4), "subject": subject})
                    ops.append({"from": ids[hi], "to": ids[lo], "relation": "child_of",
                                "score": round(score, 4), "subject": subject})
        if ops:
            edges.insert_many(ops)
            total_edges += len(ops)

    return {"ok": True, "subjects": len(subjects), "edges": total_edges,
            "elapsedSec": round(time.time() - started, 1)}
