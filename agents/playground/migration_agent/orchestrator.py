from __future__ import annotations

import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from google.cloud import firestore
from pymongo.database import Database

from migration_agent.executor import MigrationExecutor
from migration_agent.evaluator import MigrationEvaluator
from migration_agent.presenter import MigrationPresenter

class MigrationOrchestrator:
    def __init__(self, db: firestore.Client, mongo_db: Database):
        self.db = db
        self.mongo_db = mongo_db
        self.presenter = MigrationPresenter()
        self.status_ref = self.db.collection("ingestion").document("migration_status")
        self.logs: List[Dict[str, str]] = []

    def _add_log(self, text: str, status: str = "info", agent: str = "MigrationOrchestrator"):
        log_entry = self.presenter.format_log(text, status, agent)
        self.logs.append(log_entry)
        if len(self.logs) > 100:
            self.logs.pop(0)
            
    def _write_status(self, updates: Dict[str, Any]):
        updates["logs"] = self.logs
        updates["lastHeartbeatAt"] = firestore.SERVER_TIMESTAMP
        self.status_ref.update(updates)

    async def run_pipeline(self, reset: bool = False) -> None:
        """Run the end-to-end migration pipeline."""
        self.logs = []
        self._add_log("Starting Firestore to MongoDB Migration Pipeline...", "info")
        
        # Reset the status document first
        self.status_ref.set({
            "status": "running",
            "pausedByRequest": False,
            "logs": self.logs,
            "percentage": 0.0,
            "progressMessage": "Initializing migration...",
            "lastHeartbeatAt": firestore.SERVER_TIMESTAMP,
            "errorMessage": "",
            "results": {},
            "evaluation": {}
        })

        try:
            # Step 1: Execute Copying
            def progress_cb(msg: str, pct: float):
                self._add_log(msg, "info", "MigrationExecutor")
                updates = {"progressMessage": msg}
                if pct >= 0.0:
                    updates["percentage"] = pct
                self._write_status(updates)

            executor = MigrationExecutor(self.db, self.mongo_db, progress_cb)
            
            # Run executor in thread pool as it performs blocking I/O calls
            loop = asyncio.get_running_loop()
            self._add_log("Beginning data extraction and transformation phase...", "info")
            migration_results = await loop.run_in_executor(None, lambda: executor.run_migration(reset))
            
            # Step 2: Evaluate and Smoke Test
            self._add_log("Beginning evaluation and smoke testing phase...", "info")
            self._write_status({
                "progressMessage": "Running data validation and checks...",
                "percentage": 90.0,
                "results": migration_results
            })
            
            evaluator = MigrationEvaluator(self.db, self.mongo_db)
            evaluation_results = await loop.run_in_executor(None, evaluator.evaluate_migration)
            
            # Step 3: Present results
            for detail in evaluation_results.get("details", []):
                lvl = "ok" if "verified" in detail or "passed" in detail else "warn"
                if "failed" in detail or "mismatch" in detail:
                    lvl = "error"
                self._add_log(detail, lvl, "MigrationEvaluator")
                
            if evaluation_results.get("passed"):
                self._add_log("Migration verified successfully! All counts match and sample smoke test query completed.", "ok")
                self._write_status({
                    "status": "completed",
                    "progressMessage": "Migration completed successfully.",
                    "percentage": 100.0,
                    "evaluation": evaluation_results
                })
            else:
                self._add_log("Migration evaluation failed! Some checks did not pass. Please inspect logs.", "error")
                self._write_status({
                    "status": "error",
                    "progressMessage": "Migration evaluation failed.",
                    "percentage": 100.0,
                    "evaluation": evaluation_results,
                    "errorMessage": "Data validation count mismatch or smoke query failed."
                })

        except Exception as e:
            err_msg = f"Migration pipeline crashed: {e}"
            self._add_log(err_msg, "error")
            self._write_status({
                "status": "error",
                "progressMessage": "Migration pipeline crashed.",
                "errorMessage": str(e)[:500]
            })
            raise
