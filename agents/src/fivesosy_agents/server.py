"""FastAPI HTTP wrapper for the 5sosy agent ensemble.

This is the Cloud Run entrypoint. The Next.js app proxies POST requests
from /api/agents/<name> to /agents/<name> here.
"""

from __future__ import annotations

import structlog
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from . import assessment, av, ingestion, orchestrator, pedagogy
from .schemas import (
    AgentResponse,
    AssessmentRequest,
    AVRequest,
    IngestionRequest,
    OrchestratorRequest,
    PedagogyRequest,
)
from .settings import get_settings

log = structlog.get_logger("server")

app = FastAPI(title="5sosy ADK agents", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


async def verify_token(authorization: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not settings.service_token:
        return  # token gating disabled
    if authorization != f"Bearer {settings.service_token}":
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/")
async def root() -> dict[str, object]:
    settings = get_settings()
    return {
        "service": "5sosy-agents",
        "version": "0.1.0",
        "project": settings.project,
        "location": settings.location,
        "agents": ["orchestrator", "ingestion", "pedagogy", "assessment", "av"],
    }


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/agents/orchestrator", response_model=AgentResponse, dependencies=[Depends(verify_token)])
async def orchestrator_endpoint(req: OrchestratorRequest) -> AgentResponse:
    return await orchestrator.handle(req)


@app.post("/agents/ingestion", response_model=AgentResponse, dependencies=[Depends(verify_token)])
async def ingestion_endpoint(req: IngestionRequest) -> AgentResponse:
    return await ingestion.handle(req)


@app.post("/agents/pedagogy", response_model=AgentResponse, dependencies=[Depends(verify_token)])
async def pedagogy_endpoint(req: PedagogyRequest) -> AgentResponse:
    return await pedagogy.handle(req)


@app.post("/agents/assessment", response_model=AgentResponse, dependencies=[Depends(verify_token)])
async def assessment_endpoint(req: AssessmentRequest) -> AgentResponse:
    return await assessment.handle(req)


@app.post("/agents/av", response_model=AgentResponse, dependencies=[Depends(verify_token)])
async def av_endpoint(req: AVRequest) -> AgentResponse:
    return await av.handle(req)


@app.exception_handler(Exception)
async def unhandled(_request: Request, exc: Exception) -> AgentResponse:
    log.exception("unhandled", error=str(exc))
    return AgentResponse(ok=False, agent="server", result={"error": str(exc)})
