"""Orchestrator & Dynamic Planner agent.

Parses a student's declarative intent and routes sub-tasks to specialist agents.
Skeleton — wire up google.adk.Agent + tools when ready.
"""

from __future__ import annotations

import structlog

from .schemas import AgentResponse, LogLine, OrchestratorRequest

log = structlog.get_logger("orchestrator")


async def handle(req: OrchestratorRequest) -> AgentResponse:
    log.info("orchestrator.received", intent=req.intent[:80])

    # TODO: replace with ADK Agent invocation
    # from google.adk.agents import Agent
    # agent = Agent(model=get_settings().gemini_pro, tools=[...])
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

    return AgentResponse(
        agent="orchestrator",
        result={"intent": req.intent, "parsed": parsed, "plan": plan},
        log=[
            LogLine(agent="Orchestrator", text="Received intent. tokenizing…", status="info"),
            LogLine(agent="Orchestrator", text=f"Parsed → {parsed}", status="ok"),
            LogLine(agent="PlannerAgent", text="Drafting 4-session plan.", status="ok"),
        ],
    )
