"""Feedback / problem-report agent — recognizes when a user wants to report a
bug or problem and hands off to the web's structured report form.

Design (hybrid, see batch-1 plan)
---------------------------------
Capture + persistence live in the web app: the floating 5sosybot renders a
structured form and POSTs it to `/api/feedback`, which uploads any attachment
(<=2MB) to Firebase Storage and writes the record to the `feedback_reports`
collection (MongoDB in prod). This agent's only job on the chat surface is to
*recognize the report intent* and reply with one short, encouraging localized
line. The web client opens the form when the orchestrator's final `intent` is
`report_feedback`, so the conversation and the form stay in lockstep.

Wiring note
-----------
This is a standalone agent. To make it reachable from the chat surface, add a
`report_feedback` intent to the orchestrator and route to it (separate,
reviewable step). It deliberately has no tools — persistence is the web's job,
not the model's, so a report can never be silently dropped by a tool error.
"""
from __future__ import annotations

import os

from google.adk.agents.llm_agent import Agent

from shared.locale_prompts import LOCALE_INSTRUCTION

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

INSTRUCTION = """\
You are 5sosy's Feedback agent. You are reached when the user wants to report a
problem, a bug, a wrong answer, or give feedback about the app.

Reply with ONE short, warm sentence in the user's locale telling them you can
help and that a quick report form is opening for them to fill in (name, email,
subject, description, how to reproduce, and an optional screenshot up to 2 MB).
Do NOT ask the questions yourself one by one — the structured form collects them.
Do NOT invent a confirmation that the report was sent; the form does that after
they submit.
""" + "\n" + LOCALE_INSTRUCTION

root_agent = Agent(
    model=MODEL,
    name="feedback",
    description=(
        "Recognizes problem-report / feedback intent and hands off to the web's "
        "structured report form (the floating 5sosybot opens it when intent is "
        "report_feedback). Persistence is handled by the web /api/feedback route, "
        "not by this agent. Supports 7 UI locales (ar/en/fr/de/es/it/zh)."
    ),
    instruction=INSTRUCTION,
)
