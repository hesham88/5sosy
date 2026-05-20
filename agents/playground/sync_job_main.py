"""Cloud Run Job entrypoint for the MOE textbook sync pipeline.

Long-running batch task (hours, ~272 books). Runs `run_sync_pipeline` once,
writes heartbeats + status to Firestore so the web UI can watch/monitor it,
exits cleanly on graceful pause (status='paused') or on completion.

Deployed as a Cloud Run Job using the same image as the `fivesosybot` service,
with the entrypoint overridden to `python sync_job_main.py`. See `deploy-job.ps1`.

Environment:
  GCS_BUCKET            — bucket for parsed PDFs (default: khsosy.firebasestorage.app)
  FIRESTORE_PROJECT     — Firestore project (default: khsosy)
  FIRESTORE_DATABASE    — Firestore database id (default: (default))
  GEMINI_MODEL          — Gemini model name (default: gemini-3.1-flash-lite)
  GOOGLE_API_KEY        — Gemini API key (also mirrored to GEMINI_API_KEY)
  CLOUD_RUN_EXECUTION   — set automatically by Cloud Run Jobs runtime
"""
from __future__ import annotations

import asyncio
import os
import sys
import traceback
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()
if "GEMINI_API_KEY" not in os.environ and "GOOGLE_API_KEY" in os.environ:
    os.environ["GEMINI_API_KEY"] = os.environ["GOOGLE_API_KEY"]

from google.cloud import firestore  # noqa: E402
from google.cloud import storage  # noqa: E402

from ingestion_agent.agent import run_sync_pipeline  # noqa: E402


FIRESTORE_PROJECT = os.getenv("FIRESTORE_PROJECT", "khsosy")
FIRESTORE_DATABASE = os.getenv("FIRESTORE_DATABASE", "(default)")
GCS_BUCKET = os.getenv("GCS_BUCKET", "khsosy.firebasestorage.app")


async def main_async() -> int:
    db = firestore.Client(project=FIRESTORE_PROJECT, database=FIRESTORE_DATABASE)
    storage_client = storage.Client(project=FIRESTORE_PROJECT)
    status_ref = db.collection("ingestion").document("status")

    execution_name = os.getenv("CLOUD_RUN_EXECUTION", "")
    print(f"Sync job starting. CLOUD_RUN_EXECUTION={execution_name!r}")

    # Stamp execution start so the UI heartbeat watcher has something fresh.
    status_ref.set(
        {
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            "executionName": execution_name,
        },
        merge=True,
    )

    try:
        await run_sync_pipeline(db, storage_client, GCS_BUCKET)
        return 0
    except Exception as exc:  # noqa: BLE001 — top-level handler logs everything
        tb = traceback.format_exc()
        print(f"Sync job crashed: {exc}\n{tb}", file=sys.stderr)
        try:
            doc = status_ref.get().to_dict() or {}
            logs = doc.get("logs", [])
            logs.append(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "text": f"Sync job crashed: {exc}",
                    "status": "error",
                    "agent": "SyncJob",
                }
            )
            if len(logs) > 100:
                logs = logs[-100:]
            status_ref.update(
                {
                    "status": "error",
                    "logs": logs,
                    "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
                    "errorMessage": str(exc)[:500],
                }
            )
        except Exception as inner:  # noqa: BLE001
            print(f"Failed to record crash to Firestore: {inner}", file=sys.stderr)
        return 1


def main() -> None:
    sys.exit(asyncio.run(main_async()))


if __name__ == "__main__":
    main()
