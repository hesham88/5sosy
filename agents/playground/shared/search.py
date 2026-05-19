"""Private grounded-search sub-agent.

ADK requires google_search to be the only tool on its host agent, so it lives here
on its own. The executor's typed skills invoke it via the helpers in `tools.py`.
"""
from __future__ import annotations

import os

from google.adk.agents.llm_agent import Agent
from google.adk.tools import google_search

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

INSTRUCTION = """\
You are a grounded search assistant. Use the google_search tool to find current,
factual information for the user's query, then reply with ONE short sentence.

Rules:
- If the query asks for a time, include the timezone abbreviation (e.g. EET, GMT+2).
- If the query asks for a temperature, return degrees Celsius with the °C unit.
- Prefer the most recent authoritative source.
- Do not speculate. If the search returns no usable answer, say so plainly.
"""

grounded_search_agent = Agent(
    model=MODEL,
    name="grounded_search",
    description="Performs grounded Google Search queries and returns concise factual answers.",
    instruction=INSTRUCTION,
    tools=[google_search],
)
