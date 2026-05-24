"""FastAPI server for 5sosybot.

Exposes:
  GET  /health              — liveness probe (NOT /healthz — Knative reserves that).
  POST /v1/chat             — SSE stream for the orchestrator chatbot. Each step emits
                              `event: step`; terminal event is `event: final`.
  POST /v1/onboarding       — SSE stream for the onboarding interview. Terminal event is
                              `event: turn` carrying the parsed `next_step` JSON the
                              onboarding agent emitted (kind: 'question' | 'complete').

Auth: requests must include X-API-Key matching AGENTS_API_KEY env. If the env
var is unset, auth is disabled (for local dev only — Cloud Run sets it).
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import json
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from dotenv import load_dotenv

# Load .env BEFORE importing the agents (they read GEMINI_MODEL at import time).
load_dotenv()
if "GEMINI_API_KEY" not in os.environ and "GOOGLE_API_KEY" in os.environ:
    os.environ["GEMINI_API_KEY"] = os.environ["GOOGLE_API_KEY"]

from fastapi import FastAPI, Header, HTTPException, BackgroundTasks  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from google.cloud import firestore  # noqa: E402
from google.cloud import storage  # noqa: E402
from google.cloud import run_v2  # noqa: E402
from google import genai  # noqa: E402
import math  # noqa: E402
from ingestion_agent.agent import run_sync_pipeline  # noqa: E402
from ingestion_agent.parser import split_pdf_to_pages, ocr_pages_with_gemini, index_book_to_firestore  # noqa: E402
from google.adk.runners import Runner  # noqa: E402
from google.adk.sessions import InMemorySessionService  # noqa: E402
from google.genai import types  # noqa: E402

from onboarding_agent.agent import root_agent as onboarding_agent  # noqa: E402
from orchestrator_agent.agent import root_agent as orchestrator_agent  # noqa: E402
from translation_agent.agent import root_agent as translation_agent  # noqa: E402
from language_detection_agent.detector import (  # noqa: E402
    SUPPORTED_LANGUAGES as TRANSLATE_SUPPORTED,
)

APP_NAME = "khsosybot"
ONBOARDING_APP_NAME = "khsosybot-onboarding"
API_KEY = os.getenv("AGENTS_API_KEY")
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,https://khsosyapphosting--khsosy.us-east4.hosted.app",
    ).split(",")
    if o.strip()
]

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load pages cache asynchronously on startup
    asyncio.create_task(load_pages_cache())

    async def check_and_start_monitor():
        try:
            status_ref = db.collection("ingestion").document("status")
            status_doc = await asyncio.get_running_loop().run_in_executor(None, status_ref.get)
            status_data = status_doc.to_dict() or {}  # type: ignore
            if status_data.get("status") == "running":
                exec_name = status_data.get("executionName", "")
                print(f"Detected running ingestion sync on startup. Restarting monitor for execution: {exec_name}")
                asyncio.create_task(_monitor_sync_execution(exec_name))
        except Exception as e:
            print(f"Error starting execution monitor on startup: {e}")

    asyncio.create_task(check_and_start_monitor())
    yield

app = FastAPI(title="5sosybot agents", version="0.1.0", lifespan=lifespan)
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
_onboarding_runner = Runner(
    agent=onboarding_agent,
    app_name=ONBOARDING_APP_NAME,
    session_service=_session_service,
)
TRANSLATION_APP_NAME = "khsosybot-translation"
_translation_runner = Runner(
    agent=translation_agent,
    app_name=TRANSLATION_APP_NAME,
    session_service=_session_service,
)


class ChatRequest(BaseModel):
    message: str
    username: str = "guest"
    locale: str = "en"
    session_id: str | None = None


class OnboardingRequest(BaseModel):
    message: str = ""
    username: str = "guest"
    locale: str = "en"
    session_id: str | None = None
    collected_so_far: dict = {}


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


def _extract_final_json(text: str) -> dict | None:
    """Parse the agent's final text as JSON. Tolerates fences and leading prose."""
    if not text:
        return None
    candidate = text.strip()
    # Strip ```json ... ``` fences if the model added them despite instructions.
    if candidate.startswith("```"):
        candidate = candidate.strip("`")
        if candidate.lower().startswith("json"):
            candidate = candidate[4:]
        candidate = candidate.strip()
    try:
        return json.loads(candidate)
    except Exception:
        pass
    # Fallback: find the last balanced {...} block.
    last_open = candidate.rfind("{")
    last_close = candidate.rfind("}")
    if last_open != -1 and last_close > last_open:
        try:
            return json.loads(candidate[last_open : last_close + 1])
        except Exception:
            return None
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


# ─────────────────────────────────────────────────────────────────────────────
# /v1/translate — axis-4 session-scoped translation surface.
# Never persists. Frontend caches the result in React/session state for the
# duration of the reading session and drops it on navigation away.
# ─────────────────────────────────────────────────────────────────────────────

class TranslateRequest(BaseModel):
    text: str
    source_locale: str
    target_locale: str
    mode: str = "pedagogical"  # or "literal"
    context: str = ""
    username: str = "guest"
    session_id: str | None = None


@app.post("/v1/translate")
async def translate(
    req: TranslateRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict:
    _require_api_key(x_api_key)

    src = (req.source_locale or "").lower()
    tgt = (req.target_locale or "").lower()
    if src not in TRANSLATE_SUPPORTED or tgt not in TRANSLATE_SUPPORTED:
        raise HTTPException(
            status_code=400,
            detail=f"locale must be one of {list(TRANSLATE_SUPPORTED)}",
        )
    if req.mode not in ("pedagogical", "literal"):
        raise HTTPException(status_code=400, detail="mode must be pedagogical|literal")
    if src == tgt:
        # No work to do — return verbatim so the caller's cache stays coherent.
        return {
            "status": "skipped",
            "translated": req.text,
            "source_locale": src,
            "target_locale": tgt,
            "mode": req.mode,
            "dir": "rtl" if tgt == "ar" else "ltr",
            "lang": tgt,
            "persist": False,
        }

    session_id = req.session_id or uuid.uuid4().hex
    existing = await _session_service.get_session(
        app_name=TRANSLATION_APP_NAME, user_id=req.username, session_id=session_id
    )
    if existing is None:
        await _session_service.create_session(
            app_name=TRANSLATION_APP_NAME, user_id=req.username, session_id=session_id
        )

    # Tool args are passed inline so the model has zero degrees of freedom over
    # source/target/mode — it only owns the rewriting.
    prelude = (
        f"[metadata] username={req.username} source_locale={src} "
        f"target_locale={tgt} mode={req.mode}\n"
        f"[context] {req.context}\n\n"
        f"[text to translate]\n{req.text}"
    )
    message = types.Content(role="user", parts=[types.Part(text=prelude)])

    translated_text = ""
    async for event in _translation_runner.run_async(
        user_id=req.username, session_id=session_id, new_message=message
    ):
        if not event.content or not event.content.parts:
            continue
        for part in event.content.parts:
            text = getattr(part, "text", None)
            if text and event.is_final_response():
                translated_text = text.strip()

    return {
        "status": "ok" if translated_text else "error",
        "translated": translated_text,
        "source_locale": src,
        "target_locale": tgt,
        "mode": req.mode,
        "dir": "rtl" if tgt == "ar" else "ltr",
        "lang": tgt,
        "persist": False,
        "session_id": session_id,
    }


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


@app.post("/v1/onboarding")
async def onboarding(
    req: OnboardingRequest,
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
                app_name=ONBOARDING_APP_NAME, user_id=req.username, session_id=session_id
            )
            if existing is None:
                await _session_service.create_session(
                    app_name=ONBOARDING_APP_NAME, user_id=req.username, session_id=session_id
                )
            collected_blob = json.dumps(req.collected_so_far or {}, ensure_ascii=False)
            prelude = (
                f"[metadata] username={req.username} locale={req.locale}\n"
                f"[collected_so_far] {collected_blob}\n\n"
            )
            user_text = req.message or "(begin)"
            message = types.Content(role="user", parts=[types.Part(text=prelude + user_text)])

            yield _sse(
                "start",
                {"session_id": session_id, "started_at": started_at},
            )

            index = 0
            async for event in _onboarding_runner.run_async(
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
                await asyncio.sleep(0)

            next_step = _extract_final_json(final_response)
            finished_at = _now_iso()
            duration_ms = int(time.time() * 1000) - started_ms

            yield _sse(
                "turn",
                {
                    "session_id": session_id,
                    "username": req.username,
                    "locale": req.locale,
                    "next_step": next_step,
                    "raw_final": final_response,
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
# Initialize Firestore and Storage
FIRESTORE_PROJECT = os.getenv("FIRESTORE_PROJECT", "khsosy")
FIRESTORE_DATABASE = os.getenv("FIRESTORE_DATABASE", "(default)")
GCS_BUCKET = os.getenv("GCS_BUCKET", "khsosy.firebasestorage.app")
SYNC_JOB_NAME = os.getenv("SYNC_JOB_NAME", "khsosybot-sync")
SYNC_JOB_REGION = os.getenv("SYNC_JOB_REGION", "us-east4")
SYNC_JOB_PROJECT = os.getenv("SYNC_JOB_PROJECT", FIRESTORE_PROJECT)

db = firestore.Client(project=FIRESTORE_PROJECT, database=FIRESTORE_DATABASE)
storage_client = storage.Client(project=FIRESTORE_PROJECT)


def _sync_job_resource() -> str:
    return f"projects/{SYNC_JOB_PROJECT}/locations/{SYNC_JOB_REGION}/jobs/{SYNC_JOB_NAME}"


def _starting_log() -> list[dict]:
    return [
        {
            "timestamp": _now_iso(),
            "text": "Sync requested by user. Launching Cloud Run Job…",
            "status": "info",
            "agent": "Orchestrator",
        }
    ]


def _seed_status_running() -> None:
    """Eagerly seed `ingestion/status` so the UI has something to render
    before the Cloud Run Job container even starts. Wipes old booksList."""
    status_ref = db.collection("ingestion").document("status")
    existing = status_ref.get().to_dict() or {}  # type: ignore
    status_ref.set(
        {
            "status": "running",
            "pausedByRequest": False,
            "logs": _starting_log(),
            "totalBooks": existing.get("totalBooks", 0),
            "downloadedBooks": existing.get("downloadedBooks", 0),
            "parsedBooks": existing.get("parsedBooks", 0),
            "totalPagesProcessed": existing.get("totalPagesProcessed", 0),
            "progressMessage": "Starting sync…",
            "percentage": existing.get("percentage", 0.0),
            "activeBookId": "",
            "activeBookTitle": "",
            "booksList": {},
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            "executionName": "",
            "errorMessage": "",
        },
        merge=False,
    )


def _launch_sync_job() -> str:
    """Trigger a fresh Cloud Run Job execution. Returns the full execution
    resource name, or empty string if we can't recover it from the LRO
    metadata. The Job container writes its own CLOUD_RUN_EXECUTION env var
    into Firestore on startup, so an empty return is recoverable."""
    client = run_v2.JobsClient()
    operation = client.run_job(name=_sync_job_resource())

    # operation.metadata is an Execution proto from run_v2.types — try its
    # name directly. If it's not populated yet, list executions for the job
    # and pick the most recently created one.
    try:
        meta = operation.metadata
        if meta is not None:
            name = getattr(meta, "name", "") or ""
            if name:
                return name
    except Exception as exc:  # noqa: BLE001
        print(f"_launch_sync_job: could not read operation.metadata.name: {exc}")

    try:
        ec = run_v2.ExecutionsClient()
        latest = None
        for execution in ec.list_executions(parent=_sync_job_resource()):
            if latest is None or execution.create_time > latest.create_time:  # type: ignore
                latest = execution
        if latest is not None:
            return latest.name
    except Exception as exc:  # noqa: BLE001
        print(f"_launch_sync_job: could not list executions: {exc}")

    return ""


def _ensure_execution_path(execution_name: str) -> str:
    """Accept a full execution resource path OR a short id and return the
    full path. The Job container only knows its own short id (from the
    CLOUD_RUN_EXECUTION env var), but cancel_execution wants the full path."""
    if not execution_name:
        return ""
    if execution_name.startswith("projects/"):
        return execution_name
    return f"{_sync_job_resource()}/executions/{execution_name}"


def _cancel_sync_execution(execution_name: str) -> bool:
    full = _ensure_execution_path(execution_name)
    if not full:
        return False
    try:
        client = run_v2.ExecutionsClient()
        client.cancel_execution(name=full)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to cancel execution {full}: {exc}")
        return False


async def _monitor_sync_execution(execution_name: str = ""):
    """Poll Cloud Run Execution status in the background. If the execution
    completes with failure/abrupt exit (e.g. OOM/SIGKILL), we update the status
    document in Firestore to 'error'."""
    print(f"Starting background monitoring for Cloud Run execution (initial: '{execution_name}')")
    client = run_v2.ExecutionsClient()
    active_exec = execution_name

    while True:
        await asyncio.sleep(15)

        # Check current firestore status
        try:
            status_ref = db.collection("ingestion").document("status")
            status_doc = await asyncio.get_running_loop().run_in_executor(None, status_ref.get)
            status_data = status_doc.to_dict() or {}  # type: ignore

            if status_data.get("status") != "running":
                print(f"Monitoring stopped for execution '{active_exec}' because Firestore status is '{status_data.get('status')}'")
                break

            # If we started without an execution name, or if it changed, update our active target
            current_exec = status_data.get("executionName", "")
            if current_exec and current_exec != active_exec:
                print(f"Monitoring switched execution target from '{active_exec}' to '{current_exec}'")
                active_exec = current_exec
        except Exception as e:
            print(f"Error checking Firestore status in monitor: {e}")
            continue

        if not active_exec:
            print("No execution name available yet to poll. Waiting...")
            continue

        # Poll Cloud Run Execution
        try:
            full_name = _ensure_execution_path(active_exec)
            execution = await asyncio.get_running_loop().run_in_executor(
                None, lambda: client.get_execution(name=full_name)
            )

            status = getattr(execution, "status", None)
            if status is None:
                continue

            is_completed = False
            is_failed = False
            err_msg = "Unknown execution failure (abrupt exit or OOM)"

            if getattr(status, "completion_time", None):
                is_completed = True

            conditions = getattr(status, "conditions", [])
            completed_cond = next((c for c in conditions if getattr(c, "type", "") == "Completed"), None)
            if completed_cond:
                status_str = str(getattr(completed_cond, "status", "")).lower()
                if "false" in status_str:
                    is_failed = True
                    err_msg = getattr(completed_cond, "message", "Execution failed")
                elif "true" in status_str:
                    pass

            if getattr(status, "failed_count", 0) > 0:
                is_failed = True

            if is_completed:
                if is_failed:
                    print(f"Execution {active_exec} failed. Marking Firestore status as error: {err_msg}")
                    latest_doc = await asyncio.get_running_loop().run_in_executor(None, status_ref.get)
                    latest_data = latest_doc.to_dict() or {}  # type: ignore
                    if latest_data.get("status") == "running":
                        status_ref.update({
                            "status": "error",
                            "errorMessage": f"Sync job failed: {err_msg}",
                            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
                        })
                else:
                    print(f"Execution {active_exec} completed successfully.")
                    latest_doc = await asyncio.get_running_loop().run_in_executor(None, status_ref.get)
                    latest_data = latest_doc.to_dict() or {}  # type: ignore
                    if latest_data.get("status") == "running":
                        status_ref.update({
                            "status": "completed",
                            "progressMessage": "Sync completed successfully.",
                            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
                        })
                break
        except Exception as e:
            print(f"Error polling execution status for '{active_exec}': {e}")


class IngestionSyncRequest(BaseModel):
    command: str
    username: str = "guest"


@app.post("/v1/ingestion/sync")
async def ingestion_sync(
    req: IngestionSyncRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict:
    _require_api_key(x_api_key)

    status_ref = db.collection("ingestion").document("status")

    if req.command == "start":
        existing = status_ref.get().to_dict() or {}  # type: ignore
        # Stale heartbeat → previous execution died without writing a terminal
        # state. Treat it as restartable so the user isn't stuck with a phantom
        # "running" status forever.
        if existing.get("status") == "running":
            hb = existing.get("lastHeartbeatAt")
            hb_age_sec = float("inf")
            if hb is not None and hasattr(hb, "timestamp"):
                try:
                    hb_age_sec = time.time() - hb.timestamp()
                except Exception:
                    hb_age_sec = float("inf")
            if hb_age_sec < 180:  # less than 3 minutes since last heartbeat
                return {
                    "ok": True,
                    "status": "running",
                    "message": "Sync is already running.",
                    "executionName": existing.get("executionName", ""),
                }
            print(
                f"Status was 'running' but heartbeat is stale ({hb_age_sec:.0f}s old) — restarting."
            )

        # Seed the status doc *before* launching, so the UI renders immediately.
        _seed_status_running()

        try:
            execution_name = await asyncio.get_running_loop().run_in_executor(
                None, _launch_sync_job
            )
        except Exception as exc:  # noqa: BLE001
            # The Cloud Run Jobs API call itself failed (auth, quota, missing
            # job, etc). Roll the eager seed back so the UI doesn't show a
            # phantom "running" state.
            status_ref.update(
                {
                    "status": "error",
                    "errorMessage": f"Failed to launch sync job: {exc}",
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
                }
            )
            raise HTTPException(status_code=500, detail=f"Failed to launch sync job: {exc}")

        # An empty execution_name is fine — the Job container writes its own
        # CLOUD_RUN_EXECUTION env var into ingestion/status on startup. We
        # still update the heartbeat so the UI's staleness check resets.
        update_fields: dict = {"lastHeartbeatAt": firestore.SERVER_TIMESTAMP}
        if execution_name:
            update_fields["executionName"] = execution_name
        status_ref.update(update_fields)
        asyncio.create_task(_monitor_sync_execution(execution_name))
        return {
            "ok": True,
            "status": "running",
            "executionName": execution_name,
            "message": "Sync job execution launched.",
        }

    elif req.command == "pause":
        status_ref.update(
            {
                "pausedByRequest": True,
                "status": "paused",
                "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            }
        )
        return {"ok": True, "status": "paused", "message": "Pause request received."}

    elif req.command == "resume":
        # Clear pause flag and launch a fresh job execution. The pipeline is
        # idempotent — books already in `books` will be skipped.
        status_ref.update({"pausedByRequest": False})
        _seed_status_running()
        try:
            execution_name = await asyncio.get_running_loop().run_in_executor(
                None, _launch_sync_job
            )
        except Exception as exc:  # noqa: BLE001
            status_ref.update(
                {
                    "status": "error",
                    "errorMessage": f"Failed to launch sync job: {exc}",
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
                }
            )
            raise HTTPException(status_code=500, detail=f"Failed to launch sync job: {exc}")
        if execution_name:
            status_ref.update({"executionName": execution_name})
        asyncio.create_task(_monitor_sync_execution(execution_name))
        return {
            "ok": True,
            "status": "running",
            "executionName": execution_name,
            "message": "Sync resumed.",
        }

    elif req.command == "kill":
        existing = status_ref.get().to_dict() or {}  # type: ignore
        exec_name = existing.get("executionName", "")
        cancelled = await asyncio.get_running_loop().run_in_executor(
            None, _cancel_sync_execution, exec_name
        )
        # Also flip the pause flag so the loop exits if the cancel is slow.
        status_ref.update(
            {
                "pausedByRequest": True,
                "status": "idle" if cancelled else existing.get("status", "idle"),
                "progressMessage": "Sync killed by user." if cancelled else existing.get("progressMessage", ""),
                "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            }
        )
        return {
            "ok": True,
            "status": "idle" if cancelled else "unknown",
            "cancelled": cancelled,
            "message": (
                f"Execution cancelled: {exec_name}" if cancelled
                else "No active execution to cancel."
            ),
        }

    elif req.command == "reset":
        existing = status_ref.get().to_dict() or {}  # type: ignore
        exec_name = existing.get("executionName", "")
        await asyncio.get_running_loop().run_in_executor(
            None, _cancel_sync_execution, exec_name
        )

        # Reset status document
        status_ref.set(
            {
                "status": "idle",
                "pausedByRequest": False,
                "logs": [],
                "totalBooks": 0,
                "downloadedBooks": 0,
                "parsedBooks": 0,
                "totalPagesProcessed": 0,
                "percentage": 0.0,
                "activeBookId": "",
                "activeBookTitle": "",
                "progressMessage": "",
                "booksList": {},
                "executionName": "",
                "errorMessage": "",
                "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            }
        )

        # Wipe books/ and all nested subcollections (content/full, pages/{N}).
        # Plain doc.delete() does NOT cascade in Firestore — orphaned subcollection
        # docs would survive and surface as "empty placeholder" paths in the Console,
        # which the client SDK then can't clean up because firestore.rules denies
        # writes on /books/**. recursive_delete uses a server-side BulkWriter.
        books_coll = db.collection("books")
        loop = asyncio.get_running_loop()
        deleted = await loop.run_in_executor(
            None, lambda: db.recursive_delete(books_coll)
        )

        return {
            "ok": True,
            "status": "idle",
            "message": f"Sync reset. Cancelled execution and deleted {deleted} book documents.",
        }

    else:
        raise HTTPException(status_code=400, detail=f"Unknown sync command: {req.command}")


# ─────────────────────────────────────────────────────────────────────────────
# Split-job control plane: khsosybot-get-books (harvester) + khsosybot-analyze-books (analyzer)
# Each has its own status doc and its own Cloud Run Job. Both share this handler.
# ─────────────────────────────────────────────────────────────────────────────

HARVESTER_JOB_NAME = os.getenv("HARVESTER_JOB_NAME", "khsosybot-get-books")
ANALYZER_JOB_NAME = os.getenv("ANALYZER_JOB_NAME", "khsosybot-analyze-books")
MIGRATION_JOB_NAME = os.getenv("MIGRATION_JOB_NAME", "khsosybot-migration")


def _job_config(kind: str) -> tuple[str, str]:
    """(job_name, status_doc_id) for a given job kind."""
    if kind == "harvester":
        return HARVESTER_JOB_NAME, "harvester_status"
    if kind == "analyzer":
        return ANALYZER_JOB_NAME, "analyzer_status"
    if kind == "migration":
        return MIGRATION_JOB_NAME, "migration_status"
    raise HTTPException(status_code=400, detail=f"Unknown job kind: {kind}")



def _job_resource(job_name: str) -> str:
    return f"projects/{SYNC_JOB_PROJECT}/locations/{SYNC_JOB_REGION}/jobs/{job_name}"


def _launch_job(job_name: str, overrides: dict | None = None) -> str:
    """Trigger a fresh Cloud Run Job execution. Same pattern as _launch_sync_job."""
    client = run_v2.JobsClient()
    req = run_v2.RunJobRequest(
        name=_job_resource(job_name),
        overrides=overrides
    )
    operation = client.run_job(request=req)
    try:
        meta = operation.metadata
        if meta is not None:
            name = getattr(meta, "name", "") or ""
            if name:
                return name
    except Exception as exc:  # noqa: BLE001
        print(f"_launch_job({job_name}): metadata read failed: {exc}")
    try:
        ec = run_v2.ExecutionsClient()
        latest = None
        for execution in ec.list_executions(parent=_job_resource(job_name)):
            if latest is None or execution.create_time > latest.create_time:  # type: ignore
                latest = execution
        if latest is not None:
            return latest.name
    except Exception as exc:  # noqa: BLE001
        print(f"_launch_job({job_name}): list_executions failed: {exc}")
    return ""


def _cancel_execution(execution_name: str, job_name: str) -> bool:
    if not execution_name:
        return False
    full = execution_name if execution_name.startswith("projects/") else f"{_job_resource(job_name)}/executions/{execution_name}"
    try:
        client = run_v2.ExecutionsClient()
        client.cancel_execution(name=full)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to cancel {full}: {exc}")
        return False


def _seed_job_running(status_doc_id: str, log_text: str) -> None:
    ref = db.collection("ingestion").document(status_doc_id)
    existing = ref.get().to_dict() or {}  # type: ignore
    ref.set(
        {
            "status": "running",
            "pausedByRequest": False,
            "logs": [
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "text": log_text,
                    "status": "info",
                    "agent": "Orchestrator",
                }
            ],
            "totalBooks": existing.get("totalBooks", 0),
            "downloadedBooks": existing.get("downloadedBooks", 0),
            "indexedBooks": existing.get("indexedBooks", 0),
            "failedBooks": existing.get("failedBooks", 0),
            "totalPagesProcessed": existing.get("totalPagesProcessed", 0),
            "percentage": existing.get("percentage", 0.0),
            "activeBookTitle": "",
            "progressMessage": "Starting…",
            "startedAt": firestore.SERVER_TIMESTAMP,
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            "executionName": "",
            "errorMessage": "",
        },
        merge=False,
    )


def _reset_books_for_analyzer() -> int:
    """Revert all `books/{id}` from status='indexed' back to 'downloaded' and
    wipe pages + content subcollections. Keeps the downloaded PDFs intact so the
    user doesn't have to re-run the harvester. Returns count of books reset."""
    count = 0
    for d in db.collection("books").stream():
        data = d.to_dict() or {}
        if data.get("status") not in ("indexed", "indexing", "failed"):
            continue
        try:
            db.recursive_delete(d.reference.collection("pages"))
        except Exception as exc:  # noqa: BLE001
            print(f"reset analyzer: pages delete failed for {d.id}: {exc}")
        try:
            db.recursive_delete(d.reference.collection("content"))
        except Exception as exc:  # noqa: BLE001
            print(f"reset analyzer: content delete failed for {d.id}: {exc}")
        d.reference.set(
            {
                "status": "downloaded" if data.get("storagePath", "").startswith("gs://") else "pending",
                "pages": 0,
                "chapters": [],
                "errorMessage": "",
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        count += 1
    return count


async def _handle_job_command(kind: str, command: str) -> dict:
    job_name, status_doc_id = _job_config(kind)
    status_ref = db.collection("ingestion").document(status_doc_id)
    loop = asyncio.get_running_loop()

    if command == "start":
        existing = status_ref.get().to_dict() or {}  # type: ignore
        if existing.get("status") == "running":
            hb = existing.get("lastHeartbeatAt")
            hb_age = float("inf")
            if hb is not None and hasattr(hb, "timestamp"):
                try:
                    hb_age = time.time() - hb.timestamp()
                except Exception:
                    hb_age = float("inf")
            if hb_age < 180:
                return {
                    "ok": True,
                    "status": "running",
                    "kind": kind,
                    "message": f"{kind.capitalize()} is already running.",
                    "executionName": existing.get("executionName", ""),
                }
            print(f"[{kind}] heartbeat stale ({hb_age:.0f}s) — relaunching.")

        _seed_job_running(status_doc_id, f"Launching {kind} job…")
        try:
            execution_name = await loop.run_in_executor(None, lambda: _launch_job(job_name))
        except Exception as exc:  # noqa: BLE001
            status_ref.update(
                {
                    "status": "error",
                    "errorMessage": f"Failed to launch {kind}: {exc}",
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
                }
            )
            raise HTTPException(status_code=500, detail=f"Failed to launch {kind}: {exc}")

        update_fields: dict = {"lastHeartbeatAt": firestore.SERVER_TIMESTAMP}
        if execution_name:
            update_fields["executionName"] = execution_name
        status_ref.update(update_fields)
        return {
            "ok": True,
            "status": "running",
            "kind": kind,
            "executionName": execution_name,
            "message": f"{kind.capitalize()} job execution launched.",
        }

    if command == "pause":
        status_ref.update(
            {
                "pausedByRequest": True,
                "status": "paused",
                "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            }
        )
        return {"ok": True, "status": "paused", "kind": kind, "message": "Pause request received."}

    if command == "resume":
        status_ref.update({"pausedByRequest": False})
        _seed_job_running(status_doc_id, f"Resuming {kind} job…")
        try:
            execution_name = await loop.run_in_executor(None, lambda: _launch_job(job_name))
        except Exception as exc:  # noqa: BLE001
            status_ref.update(
                {
                    "status": "error",
                    "errorMessage": f"Failed to resume {kind}: {exc}",
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
                }
            )
            raise HTTPException(status_code=500, detail=f"Failed to resume {kind}: {exc}")
        if execution_name:
            status_ref.update({"executionName": execution_name})
        return {
            "ok": True,
            "status": "running",
            "kind": kind,
            "executionName": execution_name,
            "message": f"{kind.capitalize()} resumed.",
        }

    if command == "stop":
        existing = status_ref.get().to_dict() or {}  # type: ignore
        exec_name = existing.get("executionName", "")
        cancelled = await loop.run_in_executor(None, lambda: _cancel_execution(exec_name, job_name))
        status_ref.update(
            {
                "status": "idle",
                "pausedByRequest": False,
                "autoRestart": False,
                "progressMessage": f"{kind.capitalize()} stopped by user." if cancelled else existing.get("progressMessage", ""),
                "executionName": "",
                "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            }
        )
        return {
            "ok": True,
            "status": "idle",
            "kind": kind,
            "cancelled": cancelled,
            "message": (
                f"{kind.capitalize()} execution cancelled: {exec_name}"
                if cancelled else "No active execution to cancel."
            ),
        }

    if command == "reset":
        existing = status_ref.get().to_dict() or {}  # type: ignore
        exec_name = existing.get("executionName", "")
        await loop.run_in_executor(None, lambda: _cancel_execution(exec_name, job_name))

        status_ref.set(
            {
                "status": "idle",
                "pausedByRequest": False,
                "autoRestart": False,
                "logs": [],
                "totalBooks": 0,
                "downloadedBooks": 0,
                "indexedBooks": 0,
                "failedBooks": 0,
                "percentage": 0.0,
                "activeBookTitle": "",
                "progressMessage": "",
                "executionName": "",
                "errorMessage": "",
                "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            },
            merge=False,
        )

        if kind == "harvester":
            # Wipe everything — the harvester populates books from scratch.
            books_coll = db.collection("books")
            deleted = await loop.run_in_executor(None, lambda: db.recursive_delete(books_coll))
            return {
                "ok": True,
                "status": "idle",
                "kind": "harvester",
                "message": f"Harvester reset. Wiped {deleted} book documents (incl. subcollections).",
            }
        elif kind == "analyzer":
            reset_count = await loop.run_in_executor(None, _reset_books_for_analyzer)
            return {
                "ok": True,
                "status": "idle",
                "kind": "analyzer",
                "message": f"Analyzer reset. Reverted {reset_count} books to status='downloaded' (PDFs kept).",
            }
        elif kind == "migration":
            _seed_job_running(status_doc_id, "Launching migration job with DB reset...")
            try:
                overrides = {
                    "container_overrides": [
                        {
                            "env": [
                                {"name": "RESET_DB", "value": "TRUE"}
                            ]
                        }
                    ]
                }
                execution_name = await loop.run_in_executor(
                    None, lambda: _launch_job(job_name, overrides)
                )
            except Exception as exc:
                status_ref.update({
                    "status": "error",
                    "errorMessage": f"Failed to launch migration reset: {exc}",
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
                })
                raise HTTPException(status_code=500, detail=f"Failed to launch migration reset: {exc}")
            
            update_fields: dict = {"lastHeartbeatAt": firestore.SERVER_TIMESTAMP}
            if execution_name:
                update_fields["executionName"] = execution_name
            status_ref.update(update_fields)
            return {
                "ok": True,
                "status": "running",
                "kind": kind,
                "executionName": execution_name,
                "message": "Migration job execution launched with DB reset.",
            }

    raise HTTPException(status_code=400, detail=f"Unknown {kind} command: {command}")


class JobCommandRequest(BaseModel):
    command: str
    username: str = "guest"


@app.post("/v1/ingestion/harvester")
async def ingestion_harvester(
    req: JobCommandRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict:
    _require_api_key(x_api_key)
    return await _handle_job_command("harvester", req.command)


@app.post("/v1/ingestion/analyzer")
async def ingestion_analyzer(
    req: JobCommandRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict:
    _require_api_key(x_api_key)
    return await _handle_job_command("analyzer", req.command)


@app.post("/v1/ingestion/migration")
async def ingestion_migration(
    req: JobCommandRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict:
    _require_api_key(x_api_key)
    return await _handle_job_command("migration", req.command)



# In-memory cache for page embeddings
_pages_cache: list[dict] = []
_cache_loaded: bool = False
_last_cache_load_time: float = 0.0
_cache_lock = asyncio.Lock()

async def load_pages_cache():
    global _pages_cache, _cache_loaded, _last_cache_load_time
    async with _cache_lock:
        provider = os.getenv("DATABASE_PROVIDER", "firestore").lower()
        if provider == "mongodb":
            print("Loading pages cache from MongoDB collection 'book_pages' (excluding text)...")
            try:
                import array
                from shared.mongodb_client import get_mongodb_client
                _, mongo_db = get_mongodb_client()
                loop = asyncio.get_running_loop()
                # Project out the 'text' field to keep memory footprint minimal
                docs = await loop.run_in_executor(None, lambda: list(mongo_db["book_pages"].find({}, {"text": 0})))
                new_cache = []
                for data in docs:
                    emb_list = array.array('f', data["embedding"]) if ("embedding" in data and data["embedding"]) else None
                    new_cache.append({
                        "bookId": data.get("bookId"),
                        "bookTitle": data.get("bookTitle", "Unknown Book"),
                        "pageNumber": data.get("pageNumber"),
                        "text": "", # Kept empty in cache, fetched on-demand
                        "embedding": emb_list,
                        "grade": data.get("grade", ""),
                        "subject": data.get("subject", ""),
                        "language": data.get("language", "ar"),
                        "year": data.get("year", 2026)
                    })
                _pages_cache = new_cache
                _cache_loaded = True
                _last_cache_load_time = time.time()
                print(f"Pages cache loaded from MongoDB (projected with array). Total pages: {len(_pages_cache)}")
            except Exception as e:
                print(f"Error loading pages cache from MongoDB: {e}")
            return

        print("Loading pages cache from Firestore collection group 'pages' (excluding text)...")
        try:
            import array
            pages_ref = db.collection_group("pages")
            # Select only needed fields to exclude 'text' and keep memory minimal
            docs = await asyncio.get_running_loop().run_in_executor(
                None, lambda: list(pages_ref.select(["bookId", "bookTitle", "pageNumber", "embedding", "grade", "subject", "language", "year"]).stream())
            )
            new_cache = []
            for doc in docs:
                data = doc.to_dict() or {}
                emb_list = None
                if "embedding" in data and data["embedding"]:
                    emb_val = data["embedding"]
                    if isinstance(emb_val, bytes):
                        import struct
                        num_floats = len(emb_val) // 4
                        emb_list = array.array('f', struct.unpack(f"{num_floats}f", emb_val))
                    else:
                        emb_list = array.array('f', emb_val)
                new_cache.append({
                    "bookId": data.get("bookId"),
                    "bookTitle": data.get("bookTitle", "Unknown Book"),
                    "pageNumber": data.get("pageNumber"),
                    "text": "", # Kept empty in cache, fetched on-demand
                    "embedding": emb_list,
                    "grade": data.get("grade", ""),
                    "subject": data.get("subject", ""),
                    "language": data.get("language", "ar"),
                    "year": data.get("year", 2026)
                })
            _pages_cache = new_cache
            _cache_loaded = True

            _last_cache_load_time = time.time()
            print(f"Pages cache loaded from Firestore (projected). Total pages: {len(_pages_cache)}")
        except Exception as e:
            print(f"Error loading pages cache: {e}")

# Lifespan was moved to the top and registered with FastAPI instantiation

class SearchRequest(BaseModel):
    query: str
    limit: int = 10
    mode: str = "semantic"
    bookId: str | None = None

def dot_product(v1, v2):
    return sum(x * y for x, y in zip(v1, v2))

def magnitude(v):
    return math.sqrt(sum(x * x for x in v))

def cosine_similarity(v1, v2):
    mag1 = magnitude(v1)
    mag2 = magnitude(v2)
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return dot_product(v1, v2) / (mag1 * mag2)

@app.post("/v1/books/search")
async def books_search(req: SearchRequest, x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> dict:
    _require_api_key(x_api_key)
    global _pages_cache, _cache_loaded, _last_cache_load_time
    if not req.query.strip():
        return {"results": []}

    provider = os.getenv("DATABASE_PROVIDER", "firestore").lower()
    results = []

    if req.mode == "exact":
        # Direct DB queries for exact search to prevent OOM
        if provider == "mongodb":
            try:
                from shared.mongodb_client import get_mongodb_client
                _, mongo_db = get_mongodb_client()
                loop = asyncio.get_running_loop()
                # Run case-insensitive regex search directly in MongoDB, with optional bookId filter
                query_filter = {"text": {"$regex": req.query, "$options": "i"}}
                if req.bookId:
                    query_filter["bookId"] = req.bookId

                docs = await loop.run_in_executor(
                    None,
                    lambda: list(mongo_db["book_pages"].find(
                        query_filter,
                        {"text": 1, "bookId": 1, "bookTitle": 1, "pageNumber": 1, "grade": 1, "subject": 1, "language": 1, "year": 1}
                    ).limit(req.limit))
                )
                for data in docs:
                    text = data.get("text", "")
                    results.append({
                        "bookId": data.get("bookId"),
                        "bookTitle": data.get("bookTitle", "Unknown Book"),
                        "pageNumber": data.get("pageNumber"),
                        "text": text[:300] + "..." if len(text) > 300 else text,
                        "grade": data.get("grade", ""),
                        "subject": data.get("subject", ""),
                        "language": data.get("language", "ar"),
                        "year": data.get("year", 2026),
                        "score": 1.0
                    })
            except Exception as e:
                print(f"MongoDB exact search failed: {e}")
        else:
            # Firestore group stream fallback for exact search
            try:
                pages_ref = db.collection_group("pages")
                docs = await asyncio.get_running_loop().run_in_executor(
                    None, lambda: list(pages_ref.stream())
                )
                count = 0
                for doc in docs:
                    data = doc.to_dict() or {}
                    if req.bookId and data.get("bookId") != req.bookId:
                        continue
                    text = data.get("text", "")
                    if req.query.lower() in text.lower():
                        results.append({
                            "bookId": data.get("bookId"),
                            "bookTitle": data.get("bookTitle", "Unknown Book"),
                            "pageNumber": data.get("pageNumber"),
                            "text": text[:300] + "..." if len(text) > 300 else text,
                            "grade": data.get("grade", ""),
                            "subject": data.get("subject", ""),
                            "language": data.get("language", "ar"),
                            "year": data.get("year", 2026),
                            "score": 1.0
                        })
                        count += 1
                        if count >= req.limit:
                            break
            except Exception as e:
                print(f"Firestore exact search failed: {e}")
    else:
        # Semantic search — embed the query, then prefer Atlas $vectorSearch
        # (indexed, fast). Only fall back to the in-memory cosine cache if the
        # vector index is missing/erroring, since that path scans every page
        # and is what made search hang.
        try:
            client = genai.Client()
            response = await client.aio.models.embed_content(
                model="models/gemini-embedding-2",
                contents=req.query
            )
            embs = response.embeddings
            if not embs or not embs[0].values:
                raise HTTPException(status_code=500, detail="Failed to get embedding")
            query_emb = list(embs[0].values)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate query embedding: {e}")

        top_matches = []
        used_vector_search = False

        if provider == "mongodb":
            try:
                from shared.mongodb_client import get_mongodb_client
                _, mongo_db = get_mongodb_client()
                vs: dict = {
                    "index": os.getenv("MONGO_VECTOR_INDEX", "vector_index"),
                    "path": "embedding",
                    "queryVector": query_emb,
                    "numCandidates": max(150, req.limit * 20),
                    "limit": req.limit,
                }
                if req.bookId:
                    vs["filter"] = {"bookId": req.bookId}
                pipeline = [
                    {"$vectorSearch": vs},
                    {"$project": {
                        "_id": 0, "text": 1, "bookId": 1, "bookTitle": 1, "pageNumber": 1,
                        "grade": 1, "subject": 1, "language": 1, "year": 1,
                        "score": {"$meta": "vectorSearchScore"},
                    }},
                ]
                docs = await asyncio.get_running_loop().run_in_executor(
                    None, lambda: list(mongo_db["book_pages"].aggregate(pipeline))
                )
                for data in docs:
                    text = data.get("text", "")
                    top_matches.append({
                        "bookId": data.get("bookId"),
                        "bookTitle": data.get("bookTitle", "Unknown Book"),
                        "pageNumber": data.get("pageNumber"),
                        "text": text[:300] + "..." if len(text) > 300 else text,
                        "grade": data.get("grade", ""),
                        "subject": data.get("subject", ""),
                        "language": data.get("language", "ar"),
                        "year": data.get("year", 2026),
                        "score": round(float(data.get("score", 0)), 4),
                    })
                used_vector_search = True
            except Exception as e:
                print(f"$vectorSearch unavailable, falling back to in-memory cosine: {e}")

        if used_vector_search:
            return {"results": top_matches, "engine": "vectorSearch"}

        # ---- Fallback: in-memory cosine over the page cache ----
        if not _cache_loaded or not _pages_cache or (time.time() - _last_cache_load_time > 3600):
            await load_pages_cache()

        candidate_results = []
        for item in _pages_cache:
            if req.bookId and item["bookId"] != req.bookId:
                continue
            if not item["embedding"]:
                continue
            score = cosine_similarity(query_emb, item["embedding"])
            if score > 0.15:
                candidate_results.append({
                    "bookId": item["bookId"],
                    "bookTitle": item["bookTitle"],
                    "pageNumber": item["pageNumber"],
                    "grade": item["grade"],
                    "subject": item["subject"],
                    "language": item["language"],
                    "year": item["year"],
                    "score": round(score, 4)
                })

        candidate_results.sort(key=lambda x: x["score"], reverse=True)
        top_matches = candidate_results[:req.limit]

        # Fetch the full text for ONLY the top matches on-demand to save memory
        for match in top_matches:
            match["text"] = ""
            if provider == "mongodb":
                try:
                    from shared.mongodb_client import get_mongodb_client
                    _, mongo_db = get_mongodb_client()
                    doc = await asyncio.get_running_loop().run_in_executor(
                        None,
                        lambda: mongo_db["book_pages"].find_one(
                            {"bookId": match["bookId"], "pageNumber": match["pageNumber"]},
                            {"text": 1}
                        )
                    )
                    if doc:
                        text = doc.get("text", "")
                        match["text"] = text[:300] + "..." if len(text) > 300 else text
                except Exception as e:
                    print(f"Failed to fetch page text from MongoDB: {e}")
            else:
                # Firestore on-demand text fetch
                try:
                    page_doc = db.collection("books").document(match["bookId"]).collection("pages").document(str(match["pageNumber"]))
                    doc = await asyncio.get_running_loop().run_in_executor(None, page_doc.get)
                    if doc.exists:
                        text = (doc.to_dict() or {}).get("text", "")
                        match["text"] = text[:300] + "..." if len(text) > 300 else text
                except Exception as e:
                    print(f"Failed to fetch page text from Firestore: {e}")

        results = top_matches

    return {"results": results}

class ParseBookRequest(BaseModel):
    bookId: str
    title: str
    gcsUri: str
    stage: str = "Other"
    grade: str = "Other"
    term: str = "Other"
    subject: str = "Other"
    type: str = "Added Book"
    language: str = "ar"
    year: int = 2026

@app.post("/v1/ingestion/parse-book")
async def parse_book_endpoint(
    req: ParseBookRequest,
    background_tasks: BackgroundTasks,
    x_api_key: str | None = Header(default=None, alias="X-API-Key")
) -> dict:
    _require_api_key(x_api_key)
    book_ref = db.collection("books").document(req.bookId)
    doc = book_ref.get()
    doc_data = doc.to_dict() or {}  # type: ignore
    # Only short-circuit if the book is actually fully indexed. The frontend
    # creates the doc with status='processing' before calling us, so checking
    # doc.exists alone would skip every parse.
    if doc_data.get("status") == "indexed" and doc_data.get("pages", 0) > 0:
        return {"ok": True, "message": "Book already indexed."}

    async def run_parse():
        try:
            print(f"Background parsing started for added book: {req.title} (ID: {req.bookId})")
            pages_json = await split_pdf_to_pages(req.gcsUri, req.bookId)
            ocr_results_json = await ocr_pages_with_gemini(pages_json)
            book_metadata = {
                "id": req.bookId,
                "title": req.title,
                "stage": req.stage,
                "grade": req.grade,
                "term": req.term,
                "subject": req.subject,
                "type": req.type,
                "language": req.language,
                "year": req.year,
                "govUrl": "",
                "gcsUri": req.gcsUri,
                "chapters": 8
            }
            await index_book_to_firestore(req.bookId, ocr_results_json, json.dumps(book_metadata))
            book_ref.update({"status": "indexed"})
            print(f"Background parsing completed for added book: {req.title}")
            await load_pages_cache()
        except Exception as e:
            print(f"Error background parsing added book {req.title}: {e}")
            try:
                book_ref.update({"status": "error", "errorMessage": str(e)[:500]})
            except Exception as inner:
                print(f"Failed to mark book as error: {inner}")

    background_tasks.add_task(run_parse)
    return {"ok": True, "message": "Parsing started in the background."}
# --- Legacy 5-agent surface endpoints mapped to playground ---
class LegacyLogLine(BaseModel):
    agent: str
    text: str
    status: str | None = None

class LegacyAgentResponse(BaseModel):
    ok: bool = True
    agent: str
    result: dict = {}
    log: list[LegacyLogLine] = []

class LegacyOrchestratorRequest(BaseModel):
    intent: str
    locale: str = "ar"
    uid: str | None = None

@app.post("/agents/orchestrator", response_model=LegacyAgentResponse)
async def legacy_orchestrator(req: LegacyOrchestratorRequest, x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> LegacyAgentResponse:
    if API_KEY:
        _require_api_key(x_api_key)
    parsed = {
        "subject": "physics" if "physics" in req.intent.lower() or "فيزياء" in req.intent else "general",
        "topic": "gas_laws",
        "urgency_hours": 48 if "48" in req.intent else None,
        "intensity": "high" if any(k in req.intent.lower() for k in ["exam", "اختبار", "soon", "كده"]) else "medium",
    }
    plan = [
        "review:boyle:25m",
        "quiz:gas_laws:15m",
        "lesson:thermo:20m",
        "oral:thermo:20m",
    ]
    return LegacyAgentResponse(
        agent="orchestrator",
        result={"intent": req.intent, "parsed": parsed, "plan": plan},
        log=[
            LegacyLogLine(agent="Orchestrator", text="Received intent. tokenizing…", status="info"),
            LegacyLogLine(agent="Orchestrator", text=f"Parsed → {parsed}", status="ok"),
            LegacyLogLine(agent="PlannerAgent", text="Drafting 4-session plan.", status="ok"),
        ]
    )

class LegacyIngestionRequest(BaseModel):
    sources: list[str] = []
    subject: str | None = None
    uid: str | None = None

@app.post("/agents/ingestion", response_model=LegacyAgentResponse)
async def legacy_ingestion(req: LegacyIngestionRequest, x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> LegacyAgentResponse:
    if API_KEY:
        _require_api_key(x_api_key)
    return LegacyAgentResponse(
        agent="ingestion",
        result={"sources": req.sources or ["MOE/physics-g12-2025.pdf"], "chapters": 18, "theorems": 42, "examples": 318, "embeddings": 4206},
        log=[
            LegacyLogLine(agent="Ingestion", text="Checking sources…", status="info"),
            LegacyLogLine(agent="Ingestion", text="Metadata generated successfully.", status="ok")
        ]
    )

class LegacyPedagogyRequest(BaseModel):
    uid: str | None = None
    subject: str | None = None

@app.post("/agents/pedagogy", response_model=LegacyAgentResponse)
async def legacy_pedagogy(req: LegacyPedagogyRequest, x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> LegacyAgentResponse:
    if API_KEY:
        _require_api_key(x_api_key)
    return LegacyAgentResponse(
        agent="pedagogy",
        result={
            "weakConcepts": [
                {"id": "pv-nrt", "confidence": 0.28, "prereqs": ["boyle", "kelvin"]},
                {"id": "titration", "confidence": 0.45, "prereqs": ["acid-base"]}
            ],
            "misconceptions": [{"pattern": "divide-before-rearrange", "subject": "physics"}]
        },
        log=[
            LegacyLogLine(agent="Pedagogy", text="Analyzing student history…", status="info"),
            LegacyLogLine(agent="Pedagogy", text="Identified weak concepts.", status="ok")
        ]
    )

class LegacyQuizAnswer(BaseModel):
    qid: int | str
    response: Any
    confidence: int = 50

class LegacyAssessmentRequest(BaseModel):
    uid: str | None = None
    subject: str | None = None
    answers: list[LegacyQuizAnswer] = []

@app.post("/agents/assessment", response_model=LegacyAgentResponse)
async def legacy_assessment(req: LegacyAssessmentRequest, x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> LegacyAgentResponse:
    if API_KEY:
        _require_api_key(x_api_key)
    ans_dict = {str(a.qid): a.response for a in req.answers}
    return LegacyAgentResponse(
        agent="assessment",
        result={
            "score": 0.67,
            "time": 222,
            "breakdown": [
                {"qid": 1, "correct": True, "confidence": 0.8},
                {"qid": 2, "correct": True, "confidence": 0.65},
                {"qid": 3, "correct": False, "confidence": 0.4, "note": "steps 2 and 3 swapped"}
            ],
            "answers": ans_dict
        },
        log=[
            LegacyLogLine(agent="Assessment", text="Evaluating responses…", status="info"),
            LegacyLogLine(agent="Assessment", text="Graded quiz results.", status="ok")
        ]
    )

class LegacyAVRequest(BaseModel):
    text: str | None = None
    audio_b64: str | None = None
    voice: str = "eg-ar-female-warm"
    locale: str = "ar"

@app.post("/agents/av", response_model=LegacyAgentResponse)
async def legacy_av(req: LegacyAVRequest, x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> LegacyAgentResponse:
    if API_KEY:
        _require_api_key(x_api_key)
    return LegacyAgentResponse(
        agent="av",
        result={
            "artifact": "audio/ch4-boyle.mp3",
            "voice": req.voice,
            "durationSec": 138,
            "transcript": "تخيّل عربية ملياااانة ركاب..."
        },
        log=[
            LegacyLogLine(agent="AV", text="Generating audio stream…", status="info"),
            LegacyLogLine(agent="AV", text="Audio generated.", status="ok")
        ]
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8080")),
        reload=False,
    )
