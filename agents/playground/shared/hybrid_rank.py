"""Hybrid-search ranking helpers (Batch 2).

Pure, dependency-light scoring utilities shared by the books and subjects search
paths. Keeping them here (rather than inline in server.py) lets both surfaces use
one consistent normalize → blend → axis-weight pipeline.

Design goals: fast, deterministic, no model calls. All functions are O(n) over
the candidate set and safe on empty input.
"""
from __future__ import annotations

from typing import Iterable


def minmax_normalize(scores: list[float]) -> list[float]:
    """Scale scores to 0..1. Flat input → all 1.0 (no signal to spread)."""
    if not scores:
        return []
    lo, hi = min(scores), max(scores)
    if hi <= lo:
        return [1.0 for _ in scores]
    span = hi - lo
    return [(s - lo) / span for s in scores]


def blend(lexical: float, semantic: float, *, w_lexical: float = 0.4, w_semantic: float = 0.6) -> float:
    """Weighted blend of a lexical (BM25) and a semantic (cosine) score.

    Both inputs are expected pre-normalized to 0..1. Default leans semantic since
    Egyptian curriculum queries are often conceptual ("photosynthesis") rather
    than exact-string; the lexical half guards precise terminology + typos.
    """
    return (w_lexical * lexical) + (w_semantic * semantic)


def grade_proximity(candidate_grade_rank: int, target_grade_rank: int | None) -> float:
    """1.0 when grades match, decaying with academic distance. When the user gave
    no target grade, contributes neutrally (1.0). Ranks come from a shared
    gradeRank() (higher = older student)."""
    if target_grade_rank is None:
        return 1.0
    dist = abs(candidate_grade_rank - target_grade_rank)
    return 1.0 / (1.0 + dist)


def material_type_weight(book_type: str, intent: str) -> float:
    """Intent-driven nudge between Core and Supporting material.

    intent: 'foundational' favours core (student books); 'exam_prep' favours
    supporting (question banks / guides). 'neutral' is flat.
    """
    core = is_core_material(book_type)
    if intent == "foundational":
        return 1.0 if core else 0.7
    if intent == "exam_prep":
        return 0.7 if core else 1.0
    return 1.0


def is_core_material(book_type: str | None) -> bool:
    """Classify a book's `type` as Core (official syllabus / student book) vs
    Supporting (question bank, guide, external, workbook). Heuristic over the
    AR/EN type strings the catalogue uses."""
    t = (book_type or "").strip().lower()
    if not t:
        return True  # unknown → treat as core so it isn't down-ranked
    supporting_markers = (
        "question", "bank", "exam", "guide", "workbook", "external", "supplement",
        "اسئلة", "أسئلة", "بنك", "امتحان", "مراجعة", "كراسة", "خارجي", "ملخص",
    )
    return not any(m in t for m in supporting_markers)


def axis_score(
    base: float,
    *,
    candidate_grade_rank: int = 0,
    target_grade_rank: int | None = None,
    book_type: str | None = None,
    intent: str = "neutral",
) -> float:
    """Combine a normalized retrieval score with the two intent axes the product
    spec calls out (grade proximity, material-type intent). Returns the reranked
    score; caller sorts descending."""
    return base * grade_proximity(candidate_grade_rank, target_grade_rank) * material_type_weight(book_type or "", intent)


def dedupe_keep_best(items: Iterable[dict], key: str = "slug", score: str = "score") -> list[dict]:
    """Collapse items sharing `key`, keeping the highest `score`. Stable order by
    descending score."""
    best: dict[str, dict] = {}
    for it in items:
        k = it.get(key)
        if k is None:
            continue
        cur = best.get(k)
        if cur is None or it.get(score, 0) > cur.get(score, 0):
            best[k] = it
    return sorted(best.values(), key=lambda r: r.get(score, 0), reverse=True)
