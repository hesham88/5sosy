"""Cloud Run Job entrypoint for the analyzer pipeline.

Reads `books/{id}` docs with `status='downloaded'`, parses each PDF directly
from the GCS volume mount (no full-file load into RAM), and writes per-page
text + embeddings to `books/{id}/pages/{N}` plus a consolidated
`books/{id}/content/full` doc.

Requires the deploy script to mount the GCS bucket at `/mnt/khsosy_files`
(or whatever `GCS_MOUNT_PATH` env var points to).
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

from analyzer_agent.agent import run_analyzer_pipeline  # noqa: E402


FIRESTORE_PROJECT = os.getenv("FIRESTORE_PROJECT", "khsosy")
FIRESTORE_DATABASE = os.getenv("FIRESTORE_DATABASE", "(default)")


async def main_async() -> int:
    db = firestore.Client(project=FIRESTORE_PROJECT, database=FIRESTORE_DATABASE)
    status_ref = db.collection("ingestion").document("analyzer_status")

    exec_name = os.getenv("CLOUD_RUN_EXECUTION", "")
    print(f"Analyzer job starting. CLOUD_RUN_EXECUTION={exec_name!r}")
    print(f"GCS mount path: {os.getenv('GCS_MOUNT_PATH', '/mnt/khsosy_files')}")

    status_ref.set(
        {
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            "executionName": exec_name,
        },
        merge=True,
    )

    try:
        await run_analyzer_pipeline(db)
        return 0
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        print(f"Analyzer job crashed: {exc}\n{tb}", file=sys.stderr)
        try:
            doc = status_ref.get().to_dict() or {}
            logs = doc.get("logs", [])
            logs.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "text": f"Analyzer job crashed: {exc}",
                "status": "error",
                "agent": "Analyzer",
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
