"""FastAPI server for 5sosybot.

Exposes:
  GET  /healthz             — liveness probe.
  POST /v1/chat             — SSE stream. Each step emits `event: step`; the
                              terminal event is `event: final` carrying the full
                              wrapped response including the trace[].

Auth: requests must include X-API-Key matching AGENTS_API_KEY env. If the env
var is unset, auth is disabled (for local dev only — Cloud Run sets it).
"""
from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

from dotenv import load_dotenv

# Load .env BEFORE importing the agents (they read GEMINI_MODEL at import time).
load_dotenv()

from fastapi import FastAPI, Header, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from google.adk.runners import Runner  # noqa: E402
from google.adk.sessions import InMemorySessionService  # noqa: E402
from google.genai import types  # noqa: E402

from orchestrator_agent.agent import root_agent as orchestrator_agent  # noqa: E402

APP_NAME = "fivesosybot"
API_KEY = os.getenv("AGENTS_API_KEY")
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,https://khsosyapphosting--khsosy.us-east4.hosted.app",
    ).split(",")
    if o.strip()
]

app = FastAPI(title="5sosybot agents", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_session_service = InMemorySessionService()
_runner = Runner(
    agent=orchestrator_agent,
    app_name=APP_NAME,
    session_service=_session_service,
)


class ChatRequest(BaseModel):
    message: str
    username: str = "guest"
    locale: str = "en"
    session_id: str | None = None


def _require_api_key(x_api_key: str | None) -> None:
    if not API_KEY:
        return
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="invalid or missing api key")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sse(event: str, payload: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")


def _extract_step(event, index: int, prev_ms: int) -> dict | None:
    """Map one ADK runtime event to a trace step dict. Returns None to skip."""
    now_ms = int(time.time() * 1000)
    duration_ms = max(0, now_ms - prev_ms)
    agent = getattr(event, "author", None) or "unknown"

    actions = getattr(event, "actions", None)
    if actions is not None and getattr(actions, "transfer_to_agent", None):
        return {
            "index": index,
            "agent": agent,
            "step_type": "transfer",
            "to": actions.transfer_to_agent,
            "duration_ms": duration_ms,
        }

    if not event.content or not event.content.parts:
        return None

    for part in event.content.parts:
        fc = getattr(part, "function_call", None)
        if fc is not None:
            return {
                "index": index,
                "agent": agent,
                "step_type": "function_call",
                "tool": fc.name,
                "input": dict(fc.args) if fc.args else {},
                "duration_ms": duration_ms,
            }
        fr = getattr(part, "function_response", None)
        if fr is not None:
            output = dict(fr.response) if fr.response else {}
            grounding = output.pop("grounding", None) if isinstance(output, dict) else None
            step = {
                "index": index,
                "agent": agent,
                "step_type": "function_response",
                "tool": fr.name,
                "output": output,
                "duration_ms": duration_ms,
            }
            if grounding:
                step["grounding"] = grounding
            return step
        text = getattr(part, "text", None)
        if text:
            return {
                "index": index,
                "agent": agent,
                "step_type": "text",
                "output": text,
                "final": bool(event.is_final_response()),
                "duration_ms": duration_ms,
            }
    return None


def _infer_intent(trace: list[dict]) -> str:
    for step in trace:
        if step.get("step_type") == "function_call":
            tool = step.get("tool", "")
            if tool == "get_current_time":
                return "ask_time"
            if tool == "get_weather_celsius":
                return "ask_weather"
    for step in trace:
        if step.get("step_type") == "transfer" and step.get("to") == "executor":
            return "ask_time_or_weather"
    return "chit_chat"


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/v1/chat")
async def chat(
    req: ChatRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> StreamingResponse:
    _require_api_key(x_api_key)
    session_id = req.session_id or uuid.uuid4().hex

    async def stream() -> AsyncGenerator[bytes, None]:
        started_at = _now_iso()
        started_ms = int(time.time() * 1000)
        prev_ms = started_ms
        trace: list[dict] = []
        final_response = ""

        try:
            existing = await _session_service.get_session(
                app_name=APP_NAME, user_id=req.username, session_id=session_id
            )
            if existing is None:
                await _session_service.create_session(
                    app_name=APP_NAME, user_id=req.username, session_id=session_id
                )
            prelude = f"[metadata] username={req.username} locale={req.locale}\n\n"
            message = types.Content(role="user", parts=[types.Part(text=prelude + req.message)])

            yield _sse(
                "start",
                {"session_id": session_id, "started_at": started_at},
            )

            index = 0
            async for event in _runner.run_async(
                user_id=req.username, session_id=session_id, new_message=message
            ):
                step = _extract_step(event, index, prev_ms)
                if step is None:
                    continue
                prev_ms = int(time.time() * 1000)
                trace.append(step)
                yield _sse("step", step)
                index += 1
                if step["step_type"] == "text" and step.get("final"):
                    final_response = step.get("output", "") or ""
                # Cooperative yield so SSE flushes between steps.
                await asyncio.sleep(0)

            finished_at = _now_iso()
            duration_ms = int(time.time() * 1000) - started_ms
            yield _sse(
                "final",
                {
                    "session_id": session_id,
                    "username": req.username,
                    "locale": req.locale,
                    "intent": _infer_intent(trace),
                    "final_response": final_response,
                    "trace": trace,
                    "started_at": started_at,
                    "finished_at": finished_at,
                    "duration_ms": duration_ms,
                },
            )
        except Exception as exc:
            yield _sse(
                "error",
                {"message": f"{type(exc).__name__}: {exc}", "session_id": session_id},
            )

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8080")),
        reload=False,
    )
