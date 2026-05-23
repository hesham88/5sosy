from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Any, List

class MigrationPresenter:
    def __init__(self):
        pass

    def format_log(self, text: str, status: str = "info", agent: str = "MigrationPresenter") -> Dict[str, str]:
        """Format a single log entry for the UI console log."""
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "text": text,
            "status": status,
            "agent": agent
        }

    def update_progress(self, current_logs: List[Dict[str, str]], message: str, percent: float, results: Dict[str, Any] | None = None) -> Dict[str, Any]:
        """Construct the updated migration status dictionary."""
        payload: Dict[str, Any] = {
            "progressMessage": message,
            "lastHeartbeatAt": datetime.now(timezone.utc), # Firestore will write SERVER_TIMESTAMP
            "logs": current_logs
        }
        
        if percent >= 0.0:
            payload["percentage"] = min(100.0, max(0.0, percent))
            
        if results is not None:
            payload["results"] = results
            
        return payload
