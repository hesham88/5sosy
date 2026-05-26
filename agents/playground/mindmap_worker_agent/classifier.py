"""Supporting Material Matrix (Batch 2, Part 4-C).

Buckets a book/asset as Core (official syllabus, student books) vs Supporting
(question banks, guides, external material, videos) straight from the existing
`type` metadata — no classifier model needed. Thin wrapper over the shared
heuristic so the mind-map worker and search agree on the same definition.
"""
from __future__ import annotations

from shared.hybrid_rank import is_core_material


def bucket(book_type: str | None) -> str:
    """Return 'core' or 'supporting' for a book `type` string."""
    return "core" if is_core_material(book_type) else "supporting"
