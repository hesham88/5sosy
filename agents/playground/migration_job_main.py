"""Cloud Run Job entrypoint for the database migration pipeline.

Runs the MigrationOrchestrator to copy all data from Firestore to MongoDB,
runs validation checks, and updates the migration status logs.
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
from shared.mongodb_client import get_mongodb_client  # noqa: E402
from migration_agent.orchestrator import MigrationOrchestrator  # noqa: E402

FIRESTORE_PROJECT = os.getenv("FIRESTORE_PROJECT", "khsosy")
FIRESTORE_DATABASE = os.getenv("FIRESTORE_DATABASE", "(default)")

async def main_async() -> int:
    # 1. Connect to Firestore
    db = firestore.Client(project=FIRESTORE_PROJECT, database=FIRESTORE_DATABASE)
    status_ref = db.collection("ingestion").document("migration_status")

    # 2. Connect to MongoDB
    try:
        _, mongo_db = get_mongodb_client()
    except Exception as mongo_err:
        print(f"Failed to connect to MongoDB: {mongo_err}", file=sys.stderr)
        try:
            status_ref.set({
                "status": "error",
                "progressMessage": "Failed to connect to MongoDB.",
                "errorMessage": str(mongo_err)[:500],
                "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            }, merge=True)
        except Exception:
            pass
        return 1

    exec_name = os.getenv("CLOUD_RUN_EXECUTION", "")
    print(f"Migration job starting. CLOUD_RUN_EXECUTION={exec_name!r}")

    # Check command parameter. We can pass it via environment variable.
    # Default is normal migration. If RESET_DB=TRUE, we wipe first.
    reset_db = os.getenv("RESET_DB", "FALSE").upper() == "TRUE"

    status_ref.set(
        {
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            "executionName": exec_name,
        },
        merge=True,
    )

    try:
        orchestrator = MigrationOrchestrator(db, mongo_db)
        await orchestrator.run_pipeline(reset=reset_db)
        return 0
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        print(f"Migration job crashed: {exc}\n{tb}", file=sys.stderr)
        try:
            doc = status_ref.get().to_dict() or {}
            logs = doc.get("logs", [])
            logs.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "text": f"Migration job crashed: {exc}",
                "status": "error",
                "agent": "MigrationOrchestrator",
            })
            if len(logs) > 50:
                logs = logs[-50:]
            status_ref.update({
                "status": "error",
                "logs": logs,
                "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
                "errorMessage": str(exc)[:500],
            })
        except Exception as inner:  # noqa: BLE001
            print(f"Failed to record crash: {inner}", file=sys.stderr)
        return 1

def main() -> None:
    sys.exit(asyncio.run(main_async()))

if __name__ == "__main__":
    main()
