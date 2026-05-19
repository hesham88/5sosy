"""Runtime configuration loaded from environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


@dataclass(frozen=True)
class Settings:
    project: str
    location: str
    use_vertex_ai: bool

    gemini_pro: str
    gemini_flash: str
    gemini_flash_lite: str
    gemini_multimodal: str

    vertex_index_id: str
    vertex_index_endpoint_id: str
    embedding_model: str

    firestore_database: str
    firestore_project: str
    gcs_bucket: str

    service_token: str
    port: int


@lru_cache
def get_settings() -> Settings:
    return Settings(
        project=os.getenv("GOOGLE_CLOUD_PROJECT", "khsosy"),
        location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"),
        use_vertex_ai=os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "true").lower() == "true",
        gemini_pro=os.getenv("GEMINI_PRO_MODEL", "gemini-2.5-pro"),
        gemini_flash=os.getenv("GEMINI_FLASH_MODEL", "gemini-2.5-flash"),
        gemini_flash_lite=os.getenv("GEMINI_FLASH_LITE_MODEL", "gemini-2.5-flash-lite"),
        gemini_multimodal=os.getenv("GEMINI_MULTIMODAL_MODEL", "gemini-1.5-pro"),
        vertex_index_id=os.getenv("VERTEX_INDEX_ID", ""),
        vertex_index_endpoint_id=os.getenv("VERTEX_INDEX_ENDPOINT_ID", ""),
        embedding_model=os.getenv("EMBEDDING_MODEL", "text-embedding-005"),
        firestore_database=os.getenv("FIRESTORE_DATABASE", "(default)"),
        firestore_project=os.getenv("FIRESTORE_PROJECT", "khsosy"),
        gcs_bucket=os.getenv("GCS_BUCKET", "khsosy.firebasestorage.app"),
        service_token=os.getenv("AGENTS_SERVICE_TOKEN", ""),
        port=int(os.getenv("PORT", "8080")),
    )
