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
import json
import os
import time
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

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

APP_NAME = "fivesosybot"
ONBOARDING_APP_NAME = "fivesosybot-onboarding"
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
_onboarding_runner = Runner(
    agent=onboarding_agent,
    app_name=ONBOARDING_APP_NAME,
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
SYNC_JOB_NAME = os.getenv("SYNC_JOB_NAME", "fivesosybot-sync")
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
    before the Cloud Run Job container even starts. Preserves history
    (booksList, totalPagesProcessed) from previous runs."""
    status_ref = db.collection("ingestion").document("status")
    existing = status_ref.get().to_dict() or {}
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
            "booksList": existing.get("booksList", {}),
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            "executionName": "",
            "errorMessage": "",
        },
        merge=True,
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
            if latest is None or execution.create_time > latest.create_time:
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
        existing = status_ref.get().to_dict() or {}
        if existing.get("status") == "running":
            return {
                "ok": True,
                "status": "running",
                "message": "Sync is already running.",
                "executionName": existing.get("executionName", ""),
            }

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
        return {
            "ok": True,
            "status": "running",
            "executionName": execution_name,
            "message": "Sync resumed.",
        }

    elif req.command == "kill":
        existing = status_ref.get().to_dict() or {}
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
        existing = status_ref.get().to_dict() or {}
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

        # Clear books collection (batched, only catalog-sync books — admin SDK
        # has free reign; the client deletes its own custom books via
        # /api/books/delete on the web side).
        books_coll = db.collection("books")
        loop = asyncio.get_running_loop()
        deleted = 0
        while True:
            docs = await loop.run_in_executor(None, lambda: list(books_coll.limit(100).stream()))
            if not docs:
                break
            for d in docs:
                await loop.run_in_executor(None, d.reference.delete)
                deleted += 1
            if len(docs) < 100:
                break

        return {
            "ok": True,
            "status": "idle",
            "message": f"Sync reset. Cancelled execution and deleted {deleted} book documents.",
        }

    else:
        raise HTTPException(status_code=400, detail=f"Unknown sync command: {req.command}")


# In-memory cache for page embeddings
_pages_cache: list[dict] = []
_cache_loaded: bool = False
_cache_lock = asyncio.Lock()

async def load_pages_cache():
    global _pages_cache, _cache_loaded
    async with _cache_lock:
        print("Loading pages cache from Firestore collection group 'pages'...")
        try:
            pages_ref = db.collection_group("pages")
            docs = await asyncio.get_running_loop().run_in_executor(
                None, lambda: list(pages_ref.stream())
            )
            new_cache = []
            for doc in docs:
                data = doc.to_dict()
                if "embedding" in data and data["embedding"]:
                    new_cache.append({
                        "bookId": data.get("bookId"),
                        "bookTitle": data.get("bookTitle", "Unknown Book"),
                        "pageNumber": data.get("pageNumber"),
                        "text": data.get("text", ""),
                        "embedding": data["embedding"],
                        "grade": data.get("grade", ""),
                        "subject": data.get("subject", ""),
                        "language": data.get("language", "ar"),
                        "year": data.get("year", 2026)
                    })
            _pages_cache = new_cache
            _cache_loaded = True
            print(f"Pages cache loaded. Total pages: {len(_pages_cache)}")
        except Exception as e:
            print(f"Error loading pages cache: {e}")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(load_pages_cache())

class SearchRequest(BaseModel):
    query: str
    limit: int = 10

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
    global _pages_cache, _cache_loaded
    if not _cache_loaded:
        await load_pages_cache()
    if not req.query.strip():
        return {"results": []}
    try:
        client = genai.Client()
        response = await client.aio.models.embed_content(
            model="models/gemini-embedding-2",
            contents=req.query
        )
        query_emb = response.embeddings[0].values
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate query embedding: {e}")
    results = []
    for item in _pages_cache:
        score = cosine_similarity(query_emb, item["embedding"])
        if score > 0.15:
            results.append({
                "bookId": item["bookId"],
                "bookTitle": item["bookTitle"],
                "pageNumber": item["pageNumber"],
                "text": item["text"][:300] + "..." if len(item["text"]) > 300 else item["text"],
                "grade": item["grade"],
                "subject": item["subject"],
                "language": item["language"],
                "year": item["year"],
                "score": round(score, 4)
            })
    results.sort(key=lambda x: x["score"], reverse=True)
    results = results[:req.limit]
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
    doc_data = doc.to_dict() or {}
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8080")),
        reload=False,
    )
