"""Cloud Run Job entrypoint for the harvester pipeline.

Downloads MOE textbook PDFs to GCS and writes skeleton `books/{id}` docs with
`status='downloaded'`. The analyzer job consumes those docs. Crawler + video
extractor also run inside this entrypoint so the existing one-click "kick off
everything" UX still works.
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

from google.cloud import firestore, storage  # noqa: E402

from harvester_agent.agent import run_harvester_pipeline  # noqa: E402


FIRESTORE_PROJECT = os.getenv("FIRESTORE_PROJECT", "khsosy")
FIRESTORE_DATABASE = os.getenv("FIRESTORE_DATABASE", "(default)")
GCS_BUCKET = os.getenv("GCS_BUCKET", "khsosy.firebasestorage.app")


async def main_async() -> int:
    db = firestore.Client(project=FIRESTORE_PROJECT, database=FIRESTORE_DATABASE)
    storage_client = storage.Client(project=FIRESTORE_PROJECT)
    status_ref = db.collection("ingestion").document("harvester_status")

    exec_name = os.getenv("CLOUD_RUN_EXECUTION", "")
    print(f"Harvester job starting. CLOUD_RUN_EXECUTION={exec_name!r}")

    status_ref.set(
        {
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            "executionName": exec_name,
        },
        merge=True,
    )

    try:
        await run_harvester_pipeline(db, storage_client, GCS_BUCKET)
        return 0
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        print(f"Harvester job crashed: {exc}\n{tb}", file=sys.stderr)
        try:
            doc = status_ref.get().to_dict() or {}
            logs = doc.get("logs", [])
            logs.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "text": f"Harvester job crashed: {exc}",
                "status": "error",
                "agent": "Harvester",
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
