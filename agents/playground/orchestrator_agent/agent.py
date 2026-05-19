"""Orchestrator agent — classifies intent and delegates to the executor."""
from __future__ import annotations

import os

from google.adk.agents.llm_agent import Agent

from executor_agent.agent import root_agent as executor_agent

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

INSTRUCTION = """\
You are 5sosybot's Orchestrator. Each turn you receive a user message along with metadata:
username, locale (e.g. "en" / "ar"), and an optional pre-classified `intent`.

Your job:
1. Classify the user's intent into one of:
   - ask_time        → user is asking for the current local time somewhere
   - ask_weather     → user is asking about current weather/temperature somewhere
   - chit_chat       → greetings, small talk, identity questions
   - unknown         → anything that doesn't fit the above
2. If `ask_time` or `ask_weather` → transfer the conversation to the `executor`
   sub-agent. Pass the original user message along so the executor can extract
   city/country itself.
3. If `chit_chat` or `unknown` → reply yourself in one or two short sentences.
4. ALWAYS respond in the user's locale (Arabic when locale=ar, English when locale=en).
5. Never invent live data (time, weather, dates) yourself — always delegate.
"""

root_agent = Agent(
    model=MODEL,
    name="orchestrator",
    description=(
        "5sosybot top-level router. Classifies user intent and delegates time/weather "
        "questions to the executor sub-agent; chats directly otherwise."
    ),
    instruction=INSTRUCTION,
    sub_agents=[executor_agent],
)
