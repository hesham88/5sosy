"""Cloud Run Job entrypoint for the page reconciliation pipeline (Batch 2).

Denormalizes subject/grade/type/language + keywords from `books` onto
`book_pages` so subject search can pre-filter in-index and group correctly.
Mirrors analyzer_job_main: heartbeat + crash recording on `ingestion/reconcile_status`.

Run once after ingestion changes (and before rebuilding the vector index with
the new filter paths). Idempotent.
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

from page_reconciliation_agent.agent import run_reconciliation_pipeline  # noqa: E402

FIRESTORE_PROJECT = os.getenv("FIRESTORE_PROJECT", "khsosy")
FIRESTORE_DATABASE = os.getenv("FIRESTORE_DATABASE", "(default)")


async def main_async() -> int:
    db = firestore.Client(project=FIRESTORE_PROJECT, database=FIRESTORE_DATABASE)
    status_ref = db.collection("ingestion").document("reconcile_status")
    exec_name = os.getenv("CLOUD_RUN_EXECUTION", "")
    print(f"Reconcile job starting. CLOUD_RUN_EXECUTION={exec_name!r}")

    status_ref.set(
        {
            "status": "running",
            "logs": [],
            "executionName": exec_name,
            "startedAt": firestore.SERVER_TIMESTAMP,
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            "errorMessage": "",
        },
        merge=True,
    )

    try:
        # run_reconciliation_pipeline is sync (pymongo); offload so heartbeats flow.
        summary = await asyncio.get_running_loop().run_in_executor(
            None, lambda: run_reconciliation_pipeline(status_ref)
        )
        status_ref.update({
            "status": "completed",
            "summary": summary,
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
        })
        print(f"Reconcile done: {summary}")
        return 0
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        print(f"Reconcile job crashed: {exc}\n{tb}", file=sys.stderr)
        try:
            status_ref.update({
                "status": "error",
                "errorMessage": str(exc)[:500],
                "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            })
        except Exception as inner:  # noqa: BLE001
            print(f"Failed to record crash: {inner}", file=sys.stderr)
        return 1


def main() -> None:
    sys.exit(asyncio.run(main_async()))


if __name__ == "__main__":
    main()
