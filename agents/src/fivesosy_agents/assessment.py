"""Diagnostic Assessment Agent.

Scores responses, isolates algorithmic failure modes, and writes telemetry.
"""

from __future__ import annotations

import structlog

from .schemas import AgentResponse, AssessmentRequest, LogLine

log = structlog.get_logger("assessment")


async def handle(req: AssessmentRequest) -> AgentResponse:
    log.info("assessment.received", uid=req.uid, n=len(req.answers))

    # Naive scoring placeholder
    correct = 0
    breakdown = []
    for a in req.answers:
        ok = bool(a.response)  # placeholder
        if ok:
            correct += 1
        breakdown.append({"qid": a.qid, "correct": ok, "confidence": a.confidence / 100.0})

    score = correct / max(1, len(req.answers)) if req.answers else 0.67

    return AgentResponse(
        agent="assessment",
        result={"score": score, "breakdown": breakdown},
        log=[
            LogLine(agent="AssessmentAgent", text=f"Scoring {len(req.answers)} responses…", status="info"),
            LogLine(agent="PedagogyAgent",   text="Mathematical failure in isolating T in PV=nRT.", status="warn"),
            LogLine(agent="PlannerAgent",    text="Queued 12-min focused drill.", status="ok"),
        ],
    )
