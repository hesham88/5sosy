"""Smoke tests: import each agent + hit each endpoint with the FastAPI test client."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from fivesosy_agents.server import app

client = TestClient(app)


def test_root() -> None:
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body["service"] == "5sosy-agents"
    assert set(body["agents"]) == {"orchestrator", "ingestion", "pedagogy", "assessment", "av"}


def test_healthz() -> None:
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_orchestrator() -> None:
    r = client.post("/agents/orchestrator", json={"intent": "Physics exam in 48 hours", "locale": "en"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["agent"] == "orchestrator"
    assert "plan" in body["result"]
