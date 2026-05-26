"""Cloud Run Job entrypoint for the Mind-Map worker (Batch 2, Part 4).

Two phases, both reading the existing reconciled `book_pages` embeddings:
  1. run_mindmap_pipeline → concept_nodes + concept_occurrences (clustering)
  2. run_lineage          → concept_edges (cross-grade lineage)

No model calls by default (concept labels = top keyword; optional LLM labelling
lives in mindmap_worker_agent.agent). Mirrors analyzer_job_main: heartbeat +
crash recording on `ingestion/mindmap_status`. Idempotent per subject.

Prereq: run reconcile_pages_job first so pages carry subject/grade/embedding/
keywords.
"""
from __future__ import annotations

import asyncio
import os
import sys
import traceback

from dotenv import load_dotenv

load_dotenv()
if "GEMINI_API_KEY" not in os.environ and "GOOGLE_API_KEY" in os.environ:
    os.environ["GEMINI_API_KEY"] = os.environ["GOOGLE_API_KEY"]

from google.cloud import firestore  # noqa: E402

from mindmap_worker_agent.pipeline import run_mindmap_pipeline  # noqa: E402
from mindmap_worker_agent.lineage import run_lineage  # noqa: E402

FIRESTORE_PROJECT = os.getenv("FIRESTORE_PROJECT", "khsosy")
FIRESTORE_DATABASE = os.getenv("FIRESTORE_DATABASE", "(default)")


async def main_async() -> int:
    db = firestore.Client(project=FIRESTORE_PROJECT, database=FIRESTORE_DATABASE)
    status_ref = db.collection("ingestion").document("mindmap_status")
    exec_name = os.getenv("CLOUD_RUN_EXECUTION", "")
    print(f"Mind-map job starting. CLOUD_RUN_EXECUTION={exec_name!r}")

    status_ref.set(
        {
            "status": "running",
            "executionName": exec_name,
            "startedAt": firestore.SERVER_TIMESTAMP,
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            "errorMessage": "",
        },
        merge=True,
    )

    loop = asyncio.get_running_loop()
    try:
        clusters = await loop.run_in_executor(None, lambda: run_mindmap_pipeline(status_ref))
        status_ref.update({"clusterSummary": clusters, "lastHeartbeatAt": firestore.SERVER_TIMESTAMP})
        print(f"Clustering done: {clusters}")

        lineage = await loop.run_in_executor(None, lambda: run_lineage(status_ref))
        status_ref.update({
            "status": "completed",
            "lineageSummary": lineage,
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
        })
        print(f"Lineage done: {lineage}")
        return 0
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        print(f"Mind-map job crashed: {exc}\n{tb}", file=sys.stderr)
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
