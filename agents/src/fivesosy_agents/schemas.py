"""Pydantic request/response schemas shared across agents."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ─────────── shared ───────────
class LogLine(BaseModel):
    agent: str
    text: str
    status: Literal["ok", "warn", "info"] | None = None


class AgentResponse(BaseModel):
    ok: bool = True
    agent: str
    result: dict[str, Any] = Field(default_factory=dict)
    log: list[LogLine] = Field(default_factory=list)


# ─────────── orchestrator ───────────
class OrchestratorRequest(BaseModel):
    intent: str
    locale: Literal["ar", "en"] = "ar"
    uid: str | None = None


class ParsedIntent(BaseModel):
    subject: str
    topic: str | None = None
    urgency_hours: int | None = None
    intensity: Literal["low", "medium", "high"] = "medium"


# ─────────── ingestion ───────────
class IngestionRequest(BaseModel):
    sources: list[str] = Field(default_factory=list)
    subject: str | None = None
    uid: str | None = None


# ─────────── pedagogy ───────────
class PedagogyRequest(BaseModel):
    uid: str | None = None
    subject: str | None = None


# ─────────── assessment ───────────
class QuizAnswer(BaseModel):
    qid: int | str
    response: Any
    confidence: int = 50


class AssessmentRequest(BaseModel):
    uid: str | None = None
    subject: str | None = None
    answers: list[QuizAnswer] = Field(default_factory=list)


# ─────────── audio-visual ───────────
class AVRequest(BaseModel):
    text: str | None = None
    audio_b64: str | None = None
    voice: str = "eg-ar-female-warm"
    locale: Literal["ar", "en"] = "ar"
