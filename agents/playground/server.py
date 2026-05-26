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

async def _ensure_vector_index():
    """Idempotently ensure the Atlas vectorSearch index on book_pages.embedding.
    Runs on startup so semantic search / RAG retrieval are fast cross-language —
    no manual Atlas setup needed. No-op if it already exists or embeddings absent."""
    if os.getenv("DATABASE_PROVIDER", "firestore").lower() != "mongodb":
        return
    try:
        from pymongo.operations import SearchIndexModel
        from shared.mongodb_client import get_mongodb_client
        loop = asyncio.get_running_loop()
        _, mdb = get_mongodb_client()
        coll = mdb["book_pages"]

        # Regular compound index for fast bookId-scoped page queries (book-open,
        # page navigation, bookId-filtered search). Idempotent. This is what fixes
        # the 20-30s book open (was a full collection scan of 34k pages).
        try:
            await loop.run_in_executor(None, lambda: coll.create_index([("bookId", 1), ("pageNumber", 1)], name="bookId_pageNumber"))
            print("ensure_vector_index: ensured book_pages {bookId,pageNumber} index")
        except Exception as e:
            print(f"ensure_vector_index: page index create failed (non-fatal): {e}")

        # One-time cleanup of the smoke-test junk doc.
        try:
            await loop.run_in_executor(None, lambda: mdb["books"].delete_one({"_id": "__smoketest__"}))
            await loop.run_in_executor(None, lambda: coll.delete_many({"bookId": "__smoketest__"}))
        except Exception as e:
            print(f"ensure_vector_index: smoketest cleanup failed (non-fatal): {e}")

        existing = await loop.run_in_executor(None, lambda: [ix.get("name") for ix in coll.list_search_indexes()])

        # 1) Atlas full-text index for fast fuzzy keyword search ($search) — replaces
        #    the unindexed $regex full scan (the 20-50s killer) with a sub-second
        #    Lucene query that also tolerates typos.
        text_index = os.getenv("MONGO_TEXT_INDEX", "text_index")
        if text_index not in existing:
            text_def = {"mappings": {"dynamic": False, "fields": {
                "text": {"type": "string"},
                "bookId": {"type": "token"},
            }}}
            try:
                await loop.run_in_executor(
                    None, lambda: coll.create_search_index(
                        model=SearchIndexModel(definition=text_def, name=text_index, type="search")))
                print(f"ensure_vector_index: created text '{text_index}'; builds in background")
            except Exception as e:
                print(f"ensure_vector_index: text index create failed (non-fatal): {e}")

        # 2) Atlas vectorSearch index for semantic / cross-language.
        index_name = os.getenv("MONGO_VECTOR_INDEX", "vector_index")
        if index_name in existing:
            print(f"ensure_vector_index: '{index_name}' already present")
            return
        sample = await loop.run_in_executor(
            None, lambda: coll.find_one({"embedding": {"$exists": True, "$ne": []}}, {"embedding": 1}))
        if not sample or not sample.get("embedding"):
            print("ensure_vector_index: no embeddings yet; skipping vector index")
            return
        dims = len(sample["embedding"])
        # Filter paths enable in-index pre-filtering for subject search. NOTE: these
        # are only useful once book_pages carry these fields — run the page
        # reconciliation job first. Adding a path to an EXISTING index needs a
        # rebuild (drop + recreate, or updateSearchIndex); this create-if-absent
        # path only applies them to a fresh index.
        definition = {"fields": [
            {"type": "vector", "path": "embedding", "numDimensions": dims, "similarity": "cosine"},
            {"type": "filter", "path": "bookId"},
            {"type": "filter", "path": "subject"},
            {"type": "filter", "path": "grade"},
            {"type": "filter", "path": "type"},
            {"type": "filter", "path": "language"},
            {"type": "filter", "path": "bookType"},
        ]}
        model = SearchIndexModel(definition=definition, name=index_name, type="vectorSearch")
        await loop.run_in_executor(None, lambda: coll.create_search_index(model=model))
        print(f"ensure_vector_index: created '{index_name}' (dims={dims}); builds in background")
    except Exception as e:
        print(f"ensure_vector_index failed (non-fatal): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load pages cache asynchronously on startup
    asyncio.create_task(load_pages_cache())
    # Ensure the Atlas vector index exists (idempotent) so semantic search is fast.
    asyncio.create_task(_ensure_vector_index())

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
        if step.get("step_type") == "transfer":
            to = step.get("to")
            if to == "executor":
                return "ask_time_or_weather"
            if to == "feedback":
                return "report_feedback"
            if to == "translator":
                return "request_translation"
            if to == "ask_me":
                return "ask_library"
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

    # Direct, deterministic translation (the agent/tool round-trip hallucinated
    # unrelated output). The model translates the EXACT provided text only.
    src_name = _ASK_LOCALE_NAMES.get(src, src)
    tgt_name = _ASK_LOCALE_NAMES.get(tgt, tgt)
    mode_clause = (
        "Translate naturally, preserving teaching intent; you may localize worked-example "
        "numbers/units/place names where culturally helpful."
        if req.mode == "pedagogical"
        else "Translate literally, word-for-word, with no cultural adaptation."
    )
    prompt = (
        f"You are a precise translation engine. Translate the text inside the SOURCE block "
        f"from {src_name} to {tgt_name}. {mode_clause} "
        f"CRITICAL: Do NOT answer, explain, summarize, or continue the source text — your entire "
        f"reply must be the {tgt_name} translation of it and nothing else. Keep equations, chemical "
        f"formulas, code blocks, LaTeX, numerals, proper nouns, and the brand '5sosy' unchanged; "
        f"preserve markdown structure."
        + (f"\nCONTEXT: {req.context}" if req.context else "")
        + f"\n\nSOURCE ({src_name}):\n<<<SOURCE\n{req.text}\nSOURCE>>>\n\n{tgt_name} translation:"
    )
    translated_text = ""
    try:
        client = genai.Client()
        resp = await client.aio.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0),
        )
        translated_text = (getattr(resp, "text", None) or "").strip()
        # Drop lone surrogates Gemini occasionally emits — they break JSON encoding.
        translated_text = "".join(c for c in translated_text if not (0xD800 <= ord(c) <= 0xDFFF))
    except Exception as e:
        print(f"translate: generation failed: {e}")
        raise HTTPException(status_code=502, detail=f"translation failed: {e}")

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
RECONCILE_JOB_NAME = os.getenv("RECONCILE_JOB_NAME", "khsosybot-reconcile")
MINDMAP_JOB_NAME = os.getenv("MINDMAP_JOB_NAME", "khsosybot-mindmap")


def _job_config(kind: str) -> tuple[str, str]:
    """(job_name, status_doc_id) for a given job kind."""
    if kind == "harvester":
        return HARVESTER_JOB_NAME, "harvester_status"
    if kind == "analyzer":
        return ANALYZER_JOB_NAME, "analyzer_status"
    if kind == "migration":
        return MIGRATION_JOB_NAME, "migration_status"
    if kind == "reconcile":
        return RECONCILE_JOB_NAME, "reconcile_status"
    if kind == "mindmap":
        return MINDMAP_JOB_NAME, "mindmap_status"
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
        elif kind == "reconcile":
            # Reconcile only writes metadata onto pages; nothing to wipe. Status cleared above.
            return {
                "ok": True, "status": "idle", "kind": "reconcile",
                "message": "Reconcile status reset.",
            }
        elif kind == "mindmap":
            # Drop the concept graph so a fresh run rebuilds it from scratch.
            from shared.mongodb_client import get_mongodb_client
            _, mdb = get_mongodb_client()
            def _wipe_concepts() -> int:
                n = mdb["concept_nodes"].count_documents({})
                mdb["concept_nodes"].delete_many({})
                mdb["concept_occurrences"].delete_many({})
                mdb["concept_edges"].delete_many({})
                return n
            dropped = await loop.run_in_executor(None, _wipe_concepts)
            return {
                "ok": True, "status": "idle", "kind": "mindmap",
                "message": f"Mind-map reset. Dropped {dropped} concept nodes + occurrences + edges.",
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


@app.post("/v1/ingestion/reconcile")
async def ingestion_reconcile(
    req: JobCommandRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict:
    _require_api_key(x_api_key)
    return await _handle_job_command("reconcile", req.command)


@app.post("/v1/ingestion/mindmap")
async def ingestion_mindmap(
    req: JobCommandRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict:
    _require_api_key(x_api_key)
    return await _handle_job_command("mindmap", req.command)


class CrawlPlaylistsRequest(BaseModel):
    dry_run: bool = False
    limit: int | None = None


@app.post("/v1/videos/crawl-playlists")
async def crawl_playlists_endpoint(
    req: CrawlPlaylistsRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict:
    """Expand each videos.{youtubeUrl} playlist into an items[] array on the doc.
    Runs here (not locally) because Cloud Run is the Atlas-whitelisted host."""
    _require_api_key(x_api_key)
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="YOUTUBE_API_KEY not configured on the service")
    if os.getenv("DATABASE_PROVIDER", "firestore").lower() != "mongodb":
        raise HTTPException(status_code=400, detail="playlist crawl requires DATABASE_PROVIDER=mongodb")
    from shared.mongodb_client import get_mongodb_client
    from playlist_crawler import crawl_playlists
    _, mongo_db = get_mongodb_client()
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, lambda: crawl_playlists(api_key, mongo_db, dry_run=req.dry_run, limit=req.limit)
    )


# ─────────────────────────────────────────────────────────────────────────────
# Subject de-duplication (Batch 2). One-off, idempotent data fix: repoint books
# from each duplicate subject slug onto its canonical slug, delete the orphaned
# subject docs, and rename French Advanced → "Advanced French". Runs here because
# Atlas only accepts the Cloud Run service IP. Re-running is a no-op.
# ─────────────────────────────────────────────────────────────────────────────

# duplicate slug → canonical slug
DUPLICATE_SUBJECT_MERGES: dict[str, str] = {
    "computer_science_ict_v2": "computer_science_ict",
    "islamic_studies_2": "islamic_studies",
    "programming_and_ai_2": "programming_and_ai",
    "french_first_language": "first_language",
    "french_first_language_story": "first_language",
    "french_language_first_language": "first_language",
}


def _merge_duplicate_subjects(dry_run: bool = False) -> dict:
    from shared.mongodb_client import get_mongodb_client
    _, mdb = get_mongodb_client()
    books = mdb["books"]
    subjects = mdb["subject"]

    # Safety check: every canonical target must already exist as a subject doc,
    # otherwise repointed books would orphan and vanish from the listing.
    canonicals = sorted(set(DUPLICATE_SUBJECT_MERGES.values()))
    missing_canonicals = [
        c for c in canonicals if subjects.count_documents({"slug": c}, limit=1) == 0
    ]

    repointed: dict[str, int] = {}
    deleted_subjects: list[str] = []

    if dry_run:
        for dup in DUPLICATE_SUBJECT_MERGES:
            repointed[dup] = books.count_documents({"subject": dup})
            if subjects.count_documents({"slug": dup}, limit=1):
                deleted_subjects.append(dup)
        return {
            "ok": True,
            "dryRun": True,
            "missingCanonicals": missing_canonicals,
            "wouldRepoint": repointed,
            "wouldDeleteSubjects": deleted_subjects,
        }

    if missing_canonicals:
        # Refuse to mutate if a target subject is absent — would orphan books.
        return {
            "ok": False,
            "error": "missing canonical subject docs; aborting to avoid orphaning books",
            "missingCanonicals": missing_canonicals,
        }

    for dup, canonical in DUPLICATE_SUBJECT_MERGES.items():
        res = books.update_many({"subject": dup}, {"$set": {"subject": canonical}})
        repointed[dup] = res.modified_count
        del_res = subjects.delete_one({"slug": dup})
        if del_res.deleted_count:
            deleted_subjects.append(dup)

    # Rename French Advanced → "Advanced French" (Arabic per user spec).
    renamed: list[str] = []
    ren = subjects.update_one(
        {"slug": "french_language_advanced"},
        {"$set": {"nameI18n.en": "Advanced French", "nameI18n.ar": "لغة فرنسية مستوي رفيع"}},
    )
    if ren.matched_count:
        renamed.append("french_language_advanced")

    return {
        "ok": True,
        "repointed": repointed,
        "deletedSubjects": deleted_subjects,
        "renamed": renamed,
    }


class MergeSubjectsRequest(BaseModel):
    dry_run: bool = False


@app.post("/v1/subjects/merge-duplicates")
async def merge_duplicate_subjects(
    req: MergeSubjectsRequest = MergeSubjectsRequest(),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict:
    _require_api_key(x_api_key)
    if os.getenv("DATABASE_PROVIDER", "firestore").lower() != "mongodb":
        raise HTTPException(status_code=400, detail="subject merge requires DATABASE_PROVIDER=mongodb")
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: _merge_duplicate_subjects(req.dry_run))


# ─────────────────────────────────────────────────────────────────────────────
# Subject semantic search (Batch 2, Part 3b). Hybrid retrieval over book_pages
# grouped up to subject level, so a content query ("photosynthesis") surfaces the
# subjects/books whose pages teach it even when the title doesn't match. Low
# latency by design: a single embed + one Atlas $vectorSearch, deterministic
# query cleaning (NO LLM in the hot path), grade pre-filter via the index and a
# cheap language post-filter. The browser's instant client-side filter (Part 3a)
# stays the primary path; this augments it with content-level recall.
# ─────────────────────────────────────────────────────────────────────────────

class SubjectSearchRequest(BaseModel):
    query: str
    limit: int = 12
    grade: str | None = None
    language: str | None = None


@app.post("/v1/subjects/search")
async def subjects_search(
    req: SubjectSearchRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict:
    _require_api_key(x_api_key)
    if os.getenv("DATABASE_PROVIDER", "firestore").lower() != "mongodb":
        raise HTTPException(status_code=400, detail="subject search requires DATABASE_PROVIDER=mongodb")

    _, _, cleaned = _query_terms(req.query)
    if not cleaned:
        return {"results": [], "engine": "empty"}

    # 1) Embed the cleaned query (reuse the page-embedding model so vectors align).
    try:
        client = genai.Client()
        response = await client.aio.models.embed_content(
            model="models/gemini-embedding-2", contents=cleaned
        )
        embs = response.embeddings
        if not embs or not embs[0].values:
            raise HTTPException(status_code=500, detail="failed to embed query")
        query_emb = list(embs[0].values)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to embed query: {e}")

    # 2) One Atlas $vectorSearch over book_pages. NOTE: book_pages docs do NOT carry
    # subject/grade (those live on the `books` collection), so we can't pre-filter
    # in-index — retrieve top candidates, then resolve + filter via `books`.
    from shared.mongodb_client import get_mongodb_client
    _, mongo_db = get_mongodb_client()
    loop = asyncio.get_running_loop()
    pipeline = [
        {"$vectorSearch": {
            "index": os.getenv("MONGO_VECTOR_INDEX", "vector_index"),
            "path": "embedding",
            "queryVector": query_emb,
            "numCandidates": 400,
            "limit": 150,
        }},
        {"$project": {"_id": 0, "bookId": 1, "pageNumber": 1, "score": {"$meta": "vectorSearchScore"}}},
    ]
    try:
        docs = await loop.run_in_executor(
            None, lambda: list(mongo_db["book_pages"].aggregate(pipeline))
        )
    except Exception as e:
        print(f"subjects_search: vectorSearch failed: {e}")
        raise HTTPException(status_code=503, detail="search index unavailable")

    # 3) Resolve bookId → {subject, grade, type, language} from `books` in one batch.
    ids = list({d.get("bookId") for d in docs if d.get("bookId")})
    if not ids:
        return {"results": [], "engine": "vectorSearch", "cleanedQuery": cleaned}
    books = await loop.run_in_executor(
        None,
        lambda: list(mongo_db["books"].find(
            {"_id": {"$in": ids}},
            {"subject": 1, "grade": 1, "type": 1, "language": 1},
        )),
    )
    bmeta = {b.get("_id"): b for b in books}

    # 4) Apply grade/language post-filters (from the resolved book) and group to subject.
    grade = req.grade
    lang = (req.language or "").lower()
    agg: dict[str, dict] = {}
    for d in docs:
        b = bmeta.get(d.get("bookId"))
        if not b:
            continue
        slug = b.get("subject")
        if not slug:
            continue
        if grade and b.get("grade") != grade:
            continue
        if lang and (b.get("language") or "").lower() != lang:
            continue
        score = float(d.get("score", 0))
        a = agg.setdefault(slug, {"slug": slug, "score": 0.0, "hits": 0, "bookIds": set(), "grades": set()})
        a["score"] += score
        a["hits"] += 1
        a["bookIds"].add(d["bookId"])
        if b.get("grade"):
            a["grades"].add(b["grade"])

    if not agg:
        return {"results": [], "engine": "vectorSearch", "cleanedQuery": cleaned}

    # 4) Normalize subject scores to 0..1 and rank.
    smax = max(a["score"] for a in agg.values()) or 1.0
    results = sorted(
        (
            {
                "slug": a["slug"],
                "score": round(a["score"] / smax, 4),
                "hits": a["hits"],
                "bookIds": sorted(a["bookIds"]),
                "grades": sorted(a["grades"]),
            }
            for a in agg.values()
        ),
        key=lambda r: r["score"],
        reverse=True,
    )[: req.limit]

    return {"results": results, "engine": "vectorSearch", "cleanedQuery": cleaned}


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
    # "smart" (default): exact-first, fall back to semantic if no hits. Also
    # accepts "exact" / "semantic" for callers that still pin a mode.
    mode: str = "smart"
    bookId: str | None = None


def _suggest_from_docs(query_words: list[str], docs: list[dict]) -> str | None:
    """Derive a "Did you mean?" correction from the pages a FUZZY pass matched.
    The exact pass found nothing but fuzzy did, so the user likely mistyped a
    real content word — find the closest actual token in the matched pages for
    each query word and rebuild the query. Returns None if nothing changed."""
    import difflib
    import re as _re
    vocab: dict[str, str] = {}  # lowercased token -> original-cased token
    for d in docs[:3]:
        for tok in _re.findall(r"[A-Za-z؀-ۿ]{3,}", d.get("text", "")):
            vocab.setdefault(tok.lower(), tok)
    if not vocab:
        return None
    keys = list(vocab.keys())
    corrected: list[str] = []
    changed = False
    for w in query_words:
        wl = w.lower()
        if len(w) < 3 or wl in vocab:
            corrected.append(w)
            continue
        m = difflib.get_close_matches(wl, keys, n=1, cutoff=0.8)
        if m and m[0] != wl:
            corrected.append(vocab[m[0]])
            changed = True
        else:
            corrected.append(w)
    return " ".join(corrected) if changed else None


async def _resolve_book_titles(results: list[dict]) -> list[dict]:
    """Page docs often lack a usable bookTitle ("Unknown Book"). Resolve real
    titles (ar + en) from the `books` collection in one batch lookup."""
    if not results:
        return results
    if os.getenv("DATABASE_PROVIDER", "firestore").lower() != "mongodb":
        return results
    try:
        from shared.mongodb_client import get_mongodb_client
        _, mongo_db = get_mongodb_client()
        ids = list({r.get("bookId") for r in results if r.get("bookId")})
        if not ids:
            return results
        books = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: list(mongo_db["books"].find(
                {"_id": {"$in": ids}},
                {"title": 1, "arT": 1, "enT": 1, "arTitle": 1, "enTitle": 1, "name": 1},
            )),
        )
        bmap = {b.get("_id"): b for b in books}
        for r in results:
            b = bmap.get(r.get("bookId"))
            if not b:
                continue
            ar = b.get("arT") or b.get("arTitle") or b.get("title") or b.get("name")
            en = b.get("enT") or b.get("enTitle") or b.get("title") or b.get("name")
            best = ar or en
            if best:
                r["bookTitle"] = best
                r["bookTitleAr"] = ar or best
                r["bookTitleEn"] = en or best
    except Exception as e:
        print(f"title resolve failed: {e}")
    return results

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


# Question scaffolding / filler that carries no topic meaning. Stripping it
# stops verbose queries ("can you tell me what you know about fleming right hand
# rule") from matching unrelated pages on words like you/what/about/explain.
_STOPWORDS = frozenset({
    # English
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "of", "on", "in",
    "to", "for", "about", "what", "whats", "which", "who", "whom", "how", "why", "when",
    "where", "do", "does", "did", "you", "your", "yours", "me", "my", "mine", "i", "we",
    "us", "our", "can", "could", "would", "should", "shall", "will", "please", "tell",
    "explain", "describe", "define", "definition", "give", "show", "list", "know", "this",
    "that", "these", "those", "it", "its", "and", "or", "with", "as", "at", "by", "from",
    "into", "more", "some", "any", "all", "want", "need", "help", "tellme", "pls",
    # Arabic (incl. Egyptian)
    "ما", "ماهو", "ماهي", "هو", "هي", "عن", "ايه", "إيه", "ممكن", "اشرح", "اشرحلي",
    "وضح", "عرف", "عرّف", "قولي", "قوللي", "ايش", "إيش", "في", "من", "على", "الى",
    "إلى", "و", "يعني", "ازاي", "إزاي", "كيف", "ليه", "ليش", "انا", "أنا", "عايز",
    "عاوز", "محتاج", "هل", "ده", "دي", "اللي",
    # French
    "le", "la", "les", "un", "une", "des", "de", "du", "qu", "quest", "quel", "quelle",
    "que", "quoi", "est", "ce", "cest", "peux", "tu", "sur", "dis", "moi", "donne",
    "explique", "expliquer", "definis", "définis", "comment", "pourquoi", "je", "nous",
    "et", "ou", "avec", "dans", "plus", "parle", "parler", "sais",
})


def _query_terms(query: str) -> tuple[list[str], int, str]:
    """Clean + tokenize a query for search.

    Returns (expanded_tokens, content_count, cleaned_query):
      - expanded_tokens — content tokens for the Atlas full-text `should` pass,
        de-possessived ("Planck's"->"Planck") and hyphen/slash-split.
      - content_count — number of distinct content words (drives minimumShouldMatch).
      - cleaned_query — content words joined, for the semantic embedding (a tight
        topical query embeds far better than a chatty sentence).
    Falls back to the raw query when cleaning would empty it."""
    import re as _re
    raw = [w for w in _re.split(r"\s+", query.strip().lower()) if w]
    content: list[str] = []
    seen: set[str] = set()
    for w in raw:
        w = _re.sub(r"^[^\w'’؀-ۿ]+|[^\w'’؀-ۿ]+$", "", w)
        if not w or w in _STOPWORDS:
            continue
        if w not in seen:
            seen.add(w)
            content.append(w)
    if not content:  # query was all stopwords/punctuation — keep the raw words
        content = [w for w in raw if w]

    expanded: list[str] = []
    eseen: set[str] = set()

    def add(tok: str) -> None:
        tok = tok.strip()
        if len(tok) >= 2 and tok not in eseen:
            eseen.add(tok)
            expanded.append(tok)

    for t in content:
        add(t)
        base = _re.sub(r"['’]s$", "", t)
        if base != t:
            add(base)
        for part in _re.split(r"[-/]", t):
            add(part)
    cleaned = " ".join(content).strip() or query.strip()
    return (expanded or [query.strip()]), len(content), cleaned


_SEM_ONLY_MIN_NORM = float(os.getenv("SEARCH_SEM_ONLY_MIN_NORM", "0.5"))
_SEM_ABS_FLOOR = float(os.getenv("SEARCH_SEM_ABS_FLOOR", "0"))  # 0 = off; raw vectorSearchScore
_RESULT_REL_FLOOR = float(os.getenv("SEARCH_RESULT_REL_FLOOR", "0.4"))
_RESULT_ABS_FLOOR = float(os.getenv("SEARCH_RESULT_ABS_FLOOR", "0.2"))


def _merge_hybrid(exact: list[dict], semantic: list[dict], limit: int) -> list[dict]:
    """Blend exact (BM25) and semantic (cosine) hits into one ranking. The two
    score scales differ, so min-max normalize each list to [0,1], then combine
    (exact weighted higher to keep precise full-text matches on top) and boost
    pages found by BOTH passes. To suppress the irrelevant tail that pure
    semantic produces for short/ambiguous queries, drop semantic-only hits below
    a normalized bar (and an optional absolute floor), then apply a relevance
    floor relative to the top score. Dedupe by (bookId, pageNumber)."""
    def norm(items: list[dict]) -> dict:
        if not items:
            return {}
        scores = [float(i.get("score") or 0) for i in items]
        lo, hi = min(scores), max(scores)

        def nv(s: float) -> float:
            return 1.0 if hi == lo else (s - lo) / (hi - lo)

        return {
            (i.get("bookId"), i.get("pageNumber")): (i, nv(float(i.get("score") or 0)), float(i.get("score") or 0))
            for i in items
        }

    ex, se = norm(exact), norm(semantic)
    keys = list(ex.keys()) + [k for k in se.keys() if k not in ex]
    merged: list[dict] = []
    for k in keys:
        et = ex.get(k)
        st = se.get(k)
        ei, en = (et[0], et[1]) if et else (None, 0.0)
        si, sn, sraw = (st[0], st[1], st[2]) if st else (None, 0.0, 0.0)
        # Suppress weak semantic-only noise (no exact support).
        if ei is None:
            if sn < _SEM_ONLY_MIN_NORM:
                continue
            if _SEM_ABS_FLOOR > 0 and sraw < _SEM_ABS_FLOOR:
                continue
        item = dict(ei or si or {})
        if not item.get("text") and si and si.get("text"):
            item["text"] = si["text"]
        # Drop results with no readable preview text — these are blank/figure-only
        # pages that semantic search sometimes surfaces as weak noise; they're
        # useless to show and read as irrelevant.
        if not (item.get("text") or "").strip():
            continue
        combined = 0.6 * en + 0.4 * sn
        if ei and si:
            combined += 0.15  # found by both passes → strong signal
        item["score"] = round(min(1.0, combined), 4)
        merged.append(item)
    merged.sort(key=lambda x: x["score"], reverse=True)
    if merged:
        floor = max(_RESULT_ABS_FLOOR, _RESULT_REL_FLOOR * merged[0]["score"])
        merged = [m for m in merged if m["score"] >= floor]
    return merged[:limit]


@app.post("/v1/books/search")
async def books_search(req: SearchRequest, x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> dict:
    _require_api_key(x_api_key)
    global _pages_cache, _cache_loaded, _last_cache_load_time
    if not req.query.strip():
        return {"results": []}

    provider = os.getenv("DATABASE_PROVIDER", "firestore").lower()
    results = []
    did_you_mean = None

    # Clean the query once: drop filler/question words, expand content tokens for
    # the full-text pass, and build a tight query for the embedding.
    search_words, content_count, cleaned_query = _query_terms(req.query)
    # Require multiple content words to co-occur once the query is specific
    # enough; keep OR=1 for 1–2 word queries so recall stays high.
    min_should = 2 if content_count >= 3 else 1

    if req.mode in ("exact", "smart"):
        # Direct DB queries for exact search to prevent OOM
        if provider == "mongodb":
            from shared.mongodb_client import get_mongodb_client
            import re as _re
            _, mongo_db = get_mongodb_client()
            loop = asyncio.get_running_loop()

            def _shape(docs):
                out = []
                for data in docs:
                    text = data.get("text", "")
                    out.append({
                        "bookId": data.get("bookId"),
                        "bookTitle": data.get("bookTitle", "Unknown Book"),
                        "pageNumber": data.get("pageNumber"),
                        "text": text[:300] + "..." if len(text) > 300 else text,
                        "grade": data.get("grade", ""),
                        "subject": data.get("subject", ""),
                        "language": data.get("language", "ar"),
                        "year": data.get("year", 2026),
                        "score": round(float(data.get("score", 1.0)), 4),
                    })
                return out

            atlas_ok = False
            # Atlas Search full-text index ($search). Use compound.should with
            # minimumShouldMatch=1 (OR) so a page matching ANY query token still
            # surfaces — BM25 then ranks pages that hit more tokens higher. This
            # is the recall half; in smart mode it's blended with semantic below,
            # so partial/variant matches no longer get dropped. Fuzzy is a rescue
            # when the precise pass finds nothing (typos + "did you mean").
            cand = max(req.limit * 3, 30)
            try:
                words = search_words

                def _run(fuzzy: bool):
                    should = [
                        {"text": {"query": w, "path": "text",
                                  **({"fuzzy": {"maxEdits": 1, "prefixLength": 3}} if fuzzy else {})}}
                        for w in words
                    ]
                    comp: dict = {"should": should, "minimumShouldMatch": min(min_should, len(should))}
                    if req.bookId:
                        comp["filter"] = [{"equals": {"path": "bookId", "value": req.bookId}}]
                    pipeline = [
                        {"$search": {"index": os.getenv("MONGO_TEXT_INDEX", "text_index"), "compound": comp}},
                        {"$limit": cand},
                        {"$project": {"_id": 0, "text": 1, "bookId": 1, "bookTitle": 1, "pageNumber": 1,
                                      "grade": 1, "subject": 1, "language": 1, "year": 1,
                                      "score": {"$meta": "searchScore"}}},
                    ]
                    return list(mongo_db["book_pages"].aggregate(pipeline))

                docs = await loop.run_in_executor(None, lambda: _run(False))
                if not docs:
                    fuzzy_docs = await loop.run_in_executor(None, lambda: _run(True))
                    if fuzzy_docs:
                        did_you_mean = _suggest_from_docs(words, fuzzy_docs)
                    docs = fuzzy_docs
                results.extend(_shape(docs))
                atlas_ok = True
            except Exception as e:
                print(f"$search unavailable, falling back to regex scan: {e}")

            # Fallback: token-AND regex (unindexed; slow) while the text index builds.
            if not atlas_ok:
                try:
                    tokens = [t for t in _re.split(r"\s+", req.query.strip()) if len(t) >= 2]
                    if tokens:
                        query_filter: dict = {"$and": [{"text": {"$regex": _re.escape(t), "$options": "i"}} for t in tokens]}
                    else:
                        query_filter = {"text": {"$regex": _re.escape(req.query), "$options": "i"}}
                    if req.bookId:
                        query_filter["bookId"] = req.bookId
                    docs = await loop.run_in_executor(
                        None,
                        lambda: list(mongo_db["book_pages"].find(
                            query_filter,
                            {"text": 1, "bookId": 1, "bookTitle": 1, "pageNumber": 1, "grade": 1, "subject": 1, "language": 1, "year": 1}
                        ).limit(req.limit)))
                    results.extend(_shape(docs))
                except Exception as e:
                    print(f"MongoDB exact regex search failed: {e}")
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

    # Exact hits captured above; keep them so smart mode can blend with semantic.
    exact_results = list(results)

    if req.mode in ("semantic", "smart"):
        # Semantic search — embed the query, then prefer Atlas $vectorSearch
        # (indexed, fast). Only fall back to the in-memory cosine cache if the
        # vector index is missing/erroring, since that path scans every page
        # and is what made search hang.
        try:
            client = genai.Client()
            response = await client.aio.models.embed_content(
                model="models/gemini-embedding-2",
                contents=cleaned_query
            )
            embs = response.embeddings
            if not embs or not embs[0].values:
                raise HTTPException(status_code=500, detail="Failed to get embedding")
            query_emb = list(embs[0].values)
        except Exception as e:
            # In smart mode the embedding is one half of a hybrid — if it fails
            # but the exact pass already found pages, return those rather than
            # 500-ing the whole search. Only a pure semantic request hard-fails.
            if req.mode == "smart" and exact_results:
                return {"results": await _resolve_book_titles(exact_results[:req.limit]), "engine": "exact-only", "didYouMean": did_you_mean}
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
                    "limit": max(req.limit * 3, 30),
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
            if req.mode == "smart":
                merged = _merge_hybrid(exact_results, top_matches, req.limit)
                return {"results": await _resolve_book_titles(merged), "engine": "hybrid", "didYouMean": did_you_mean}
            return {"results": await _resolve_book_titles(top_matches[:req.limit]), "engine": "vectorSearch", "didYouMean": did_you_mean}

        # On MongoDB, never run the full-collection in-memory cosine — it OOMs the
        # container (503). $vectorSearch is the semantic path; while the Atlas index
        # is still building (or briefly unavailable) return whatever exact found
        # (smart mode) or empty, rather than crashing.
        if provider == "mongodb":
            return {"results": await _resolve_book_titles(results), "engine": "vectorSearch-pending", "didYouMean": did_you_mean}

        # ---- Fallback (Firestore only): in-memory cosine over the page cache ----
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

    return {"results": await _resolve_book_titles(results), "didYouMean": did_you_mean}


# ----------------------- Document RAG (in-book tutor) -----------------------
_ASK_LOCALE_NAMES = {
    "ar": "Egyptian Arabic", "en": "English", "fr": "French", "de": "German",
    "es": "Spanish", "it": "Italian", "zh": "Simplified Chinese",
}


async def _retrieve_book_pages(book_id: str, query: str, k: int = 6) -> list[dict]:
    """Retrieve the most relevant pages of ONE book for a question. Prefers
    $vectorSearch (bookId-filtered), then exact regex, then the first k pages."""
    if os.getenv("DATABASE_PROVIDER", "firestore").lower() != "mongodb":
        return []
    from shared.mongodb_client import get_mongodb_client
    _, mongo_db = get_mongodb_client()
    loop = asyncio.get_running_loop()

    def _shape(docs):
        return [{"pageNumber": d.get("pageNumber"), "text": (d.get("text") or "")[:1500]} for d in docs]

    try:
        client = genai.Client()
        emb = await client.aio.models.embed_content(model="models/gemini-embedding-2", contents=query)
        qv = list(emb.embeddings[0].values)
        pipeline = [
            {"$vectorSearch": {
                "index": os.getenv("MONGO_VECTOR_INDEX", "vector_index"),
                "path": "embedding", "queryVector": qv,
                "numCandidates": max(100, k * 20), "limit": k,
                "filter": {"bookId": book_id},
            }},
            {"$project": {"_id": 0, "pageNumber": 1, "text": 1, "score": {"$meta": "vectorSearchScore"}}},
        ]
        docs = await loop.run_in_executor(None, lambda: list(mongo_db["book_pages"].aggregate(pipeline)))
        if docs:
            return _shape(docs)
    except Exception as e:
        print(f"ask: vectorSearch retrieve failed: {e}")

    try:
        docs = await loop.run_in_executor(None, lambda: list(mongo_db["book_pages"].find(
            {"bookId": book_id, "text": {"$regex": query, "$options": "i"}},
            {"pageNumber": 1, "text": 1}).limit(k)))
        if docs:
            return _shape(docs)
    except Exception as e:
        print(f"ask: regex retrieve failed: {e}")

    try:
        docs = await loop.run_in_executor(None, lambda: list(mongo_db["book_pages"].find(
            {"bookId": book_id}, {"pageNumber": 1, "text": 1}).sort("pageNumber", 1).limit(k)))
        return _shape(docs)
    except Exception as e:
        print(f"ask: fallback retrieve failed: {e}")
    return []


class AskRequest(BaseModel):
    bookId: str
    question: str
    locale: str = "ar"
    history: list[dict] = []          # [{role:"user"|"assistant", content:str}]
    sessionId: str | None = None


@app.post("/v1/books/ask")
async def books_ask(req: AskRequest, x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> dict:
    _require_api_key(x_api_key)
    import uuid
    q = req.question.strip()
    session_id = req.sessionId or uuid.uuid4().hex
    if not q:
        return {"answer": "", "citations": [], "sessionId": session_id}

    pages = await _retrieve_book_pages(req.bookId, q, k=6)
    context = "\n\n".join(f"[Page {p['pageNumber']}]\n{p['text']}" for p in pages if p.get("text"))
    locale_name = _ASK_LOCALE_NAMES.get(req.locale, "the student's language")

    convo = ""
    for m in (req.history or [])[-6:]:
        who = "Student" if m.get("role") == "user" else "Tutor"
        convo += f"{who}: {m.get('content', '')}\n"

    system = (
        "You are 5sosy, a warm, curious, expert private tutor for ONE specific textbook. "
        f"Always reply in {locale_name}. Ground every answer ONLY in the BOOK PAGES provided; "
        "if the answer is not in them, say so honestly and suggest what to search instead — "
        "never invent facts, pages, or sources. Cite the pages you used inline like [Page N]. "
        "Be accurate and detailed yet easy to remember; open with a brief direct answer, then a "
        "short explanation, and end with one inviting follow-up question. Refuse unsafe or "
        "off-topic requests politely and steer back to the book."
    )
    prompt = (
        f"{system}\n\nBOOK PAGES:\n{context or '(no relevant pages found)'}\n\n"
        f"CONVERSATION SO FAR:\n{convo}\nStudent: {q}\nTutor:"
    )

    try:
        client = genai.Client()
        model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
        resp = await client.aio.models.generate_content(model=model, contents=prompt)
        answer = (getattr(resp, "text", None) or "").strip()
    except Exception as e:
        print(f"ask: generation failed: {e}")
        raise HTTPException(status_code=502, detail=f"tutor generation failed: {e}")

    citations = [{"pageNumber": p["pageNumber"], "snippet": (p.get("text") or "")[:160]} for p in pages]

    # Save chat (best-effort) for memory/history.
    if os.getenv("DATABASE_PROVIDER", "firestore").lower() == "mongodb":
        try:
            from datetime import datetime, timezone
            from shared.mongodb_client import get_mongodb_client
            _, mongo_db = get_mongodb_client()
            now = datetime.now(timezone.utc).isoformat()
            await asyncio.get_running_loop().run_in_executor(
                None,
                lambda: mongo_db["book_chats"].update_one(
                    {"_id": session_id},
                    {"$setOnInsert": {"bookId": req.bookId, "locale": req.locale, "createdAt": now},
                     "$set": {"updatedAt": now},
                     "$push": {"messages": {"$each": [
                         {"role": "user", "content": q, "at": now},
                         {"role": "assistant", "content": answer, "citations": citations, "at": now},
                     ]}}},
                    upsert=True,
                ),
            )
        except Exception as e:
            print(f"ask: save chat failed: {e}")

    return {"answer": answer, "citations": citations, "sessionId": session_id}


async def _sample_book_pages(book_id: str, max_pages: int = 40) -> list[dict]:
    """Evenly sample pages across ONE book so a whole-book overview (mind map)
    sees the full arc without blowing the prompt budget on huge textbooks."""
    if os.getenv("DATABASE_PROVIDER", "firestore").lower() != "mongodb":
        return []
    from shared.mongodb_client import get_mongodb_client
    _, mdb = get_mongodb_client()
    loop = asyncio.get_running_loop()
    docs = await loop.run_in_executor(None, lambda: list(mdb["book_pages"].find(
        {"bookId": book_id}, {"_id": 0, "pageNumber": 1, "text": 1}).sort("pageNumber", 1)))
    if not docs:
        return []
    if len(docs) <= max_pages:
        sampled = docs
    else:
        step = len(docs) / max_pages
        sampled = [docs[int(i * step)] for i in range(max_pages)]
    return [{"pageNumber": d.get("pageNumber"), "text": (d.get("text") or "")[:700]} for d in sampled]


class MindMapRequest(BaseModel):
    bookId: str
    locale: str = "ar"
    title: str = ""


@app.post("/v1/books/mindmap")
async def books_mindmap(req: MindMapRequest, x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> dict:
    """Generate a hierarchical study mind map (JSON tree) for ONE book, in the
    student's locale, with page hints so nodes can deep-link into the reader."""
    _require_api_key(x_api_key)
    pages = await _sample_book_pages(req.bookId, 40)
    if not pages:
        return {"status": "empty", "mindmap": None}

    context = "\n\n".join(f"[Page {p['pageNumber']}]\n{p['text']}" for p in pages if p.get("text"))
    locale_name = _ASK_LOCALE_NAMES.get(req.locale, "the student's language")
    prompt = (
        "You are an expert curriculum designer. Build a STUDY MIND MAP of the textbook below, "
        f"written entirely in {locale_name}. "
        "Output STRICT JSON only — no markdown, no prose, no code fence. Schema:\n"
        '{"title": string, "summary": string, "children": [ {"title": string, "page": number|null, '
        '"children": [ {"title": string, "page": number|null, "children": []} ] } ] }\n'
        "Rules: root title = the book's overall subject; 4-8 top-level branches = major themes/chapters; "
        "each with 2-6 child nodes = key concepts; at most 3 levels deep. Set \"page\" to the most relevant "
        "page number from the [Page N] markers when a node maps to one, else null. Keep titles short "
        f"(2-6 words) and in {locale_name}. Keep equations, formulas, and proper nouns intact.\n\n"
        f"BOOK TITLE: {req.title or '(unknown)'}\n\nBOOK CONTENT (sampled pages):\n{context}\n\nJSON:"
    )
    try:
        client = genai.Client()
        resp = await client.aio.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.2, response_mime_type="application/json"),
        )
        raw = (getattr(resp, "text", None) or "").strip()
        raw = "".join(c for c in raw if not (0xD800 <= ord(c) <= 0xDFFF))
    except Exception as e:
        print(f"mindmap: generation failed: {e}")
        raise HTTPException(status_code=502, detail=f"mindmap generation failed: {e}")

    mindmap = None
    try:
        mindmap = json.loads(raw)
    except Exception:
        s, e2 = raw.find("{"), raw.rfind("}")
        if s != -1 and e2 != -1:
            try:
                mindmap = json.loads(raw[s:e2 + 1])
            except Exception:
                mindmap = None
    if not isinstance(mindmap, dict) or not mindmap.get("title"):
        return {"status": "error", "mindmap": None, "raw": raw[:500]}

    return {
        "status": "ok",
        "mindmap": mindmap,
        "locale": req.locale,
        "dir": "rtl" if req.locale == "ar" else "ltr",
    }


async def index_book_to_mongo(book_id: str, ocr_results_json: str, book_metadata_json: str) -> int:
    """Index an uploaded book's OCR'd pages into MongoDB (book_pages w/ embeddings) and
    upsert the books doc — the mongodb counterpart of index_book_to_firestore so user
    uploads actually become searchable / RAG-able / visible in the mongodb-backed UI."""
    from shared.mongodb_client import get_mongodb_client
    _, mdb = get_mongodb_client()
    loop = asyncio.get_running_loop()
    pages = json.loads(ocr_results_json) or []
    if isinstance(pages, dict):
        pages = pages.get("pages", [])
    meta = json.loads(book_metadata_json) or {}
    client = genai.Client()

    async def _embed(text: str):
        try:
            r = await client.aio.models.embed_content(model="models/gemini-embedding-2", contents=text[:8000])
            if r.embeddings and r.embeddings[0].values:
                return list(r.embeddings[0].values)
        except Exception as e:
            print(f"index_book_to_mongo: embed failed: {e}")
        return None

    count = 0
    for p in pages:
        pn = p.get("pageNumber")
        text = (p.get("text") or "").strip()
        if pn is None or not text:
            continue
        emb = await _embed(text)
        doc = {
            "bookId": book_id, "pageNumber": pn, "text": text,
            "bookTitle": meta.get("title", ""), "subject": meta.get("subject", ""),
            "grade": meta.get("grade", ""), "language": meta.get("language", "ar"),
            "year": meta.get("year", 2026),
        }
        if emb:
            doc["embedding"] = emb
        await loop.run_in_executor(
            None,
            lambda d=doc, n=pn: mdb["book_pages"].replace_one(
                {"bookId": book_id, "pageNumber": n}, d, upsert=True),
        )
        count += 1

    book_doc = {k: v for k, v in meta.items() if k != "id"}
    book_doc.update({"pages": count, "status": "indexed"})
    await loop.run_in_executor(
        None, lambda: mdb["books"].update_one({"_id": book_id}, {"$set": book_doc}, upsert=True))
    print(f"index_book_to_mongo: indexed {count} pages for {book_id}")
    return count


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
    provider = os.getenv("DATABASE_PROVIDER", "firestore").lower()

    # Short-circuit only if already fully indexed (frontend creates a 'processing'
    # doc first, so existence alone must not skip the parse).
    if provider == "mongodb":
        from shared.mongodb_client import get_mongodb_client
        _, mdb = get_mongodb_client()
        existing = mdb["books"].find_one({"_id": req.bookId}, {"status": 1, "pages": 1})
        if existing and existing.get("status") == "indexed" and existing.get("pages", 0) > 0:
            return {"ok": True, "message": "Book already indexed."}
    else:
        book_ref = db.collection("books").document(req.bookId)
        doc_data = (book_ref.get().to_dict() or {})  # type: ignore
        if doc_data.get("status") == "indexed" and doc_data.get("pages", 0) > 0:
            return {"ok": True, "message": "Book already indexed."}

    async def run_parse():
        try:
            print(f"Background parsing started for added book: {req.title} (ID: {req.bookId})")
            pages_json = await split_pdf_to_pages(req.gcsUri, req.bookId)
            ocr_results_json = await ocr_pages_with_gemini(pages_json)
            book_metadata = {
                "id": req.bookId, "title": req.title, "stage": req.stage, "grade": req.grade,
                "term": req.term, "subject": req.subject, "type": req.type, "language": req.language,
                "year": req.year, "govUrl": "", "gcsUri": req.gcsUri, "chapters": 8,
            }
            if provider == "mongodb":
                await index_book_to_mongo(req.bookId, ocr_results_json, json.dumps(book_metadata))
            else:
                await index_book_to_firestore(req.bookId, ocr_results_json, json.dumps(book_metadata))
                db.collection("books").document(req.bookId).update({"status": "indexed"})
            print(f"Background parsing completed for added book: {req.title}")
            await load_pages_cache()
        except Exception as e:
            print(f"Error background parsing added book {req.title}: {e}")
            try:
                if provider == "mongodb":
                    from shared.mongodb_client import get_mongodb_client
                    _, mdb = get_mongodb_client()
                    mdb["books"].update_one({"_id": req.bookId},
                                            {"$set": {"status": "error", "errorMessage": str(e)[:500]}}, upsert=False)
                else:
                    db.collection("books").document(req.bookId).update({"status": "error", "errorMessage": str(e)[:500]})
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
