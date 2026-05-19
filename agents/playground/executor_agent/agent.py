"""Executor agent — handles time and weather skill calls."""
from __future__ import annotations

import os

from google.adk.agents.llm_agent import Agent

from shared.tools import get_current_time, get_weather_celsius

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

INSTRUCTION = """\
You are 5sosybot's Executor. You can answer two kinds of questions:

1. The current local time in a city/country → call `get_current_time(city, country)`.
2. The current weather (in °C) in a city/country → call `get_weather_celsius(city, country)`.

Workflow:
- Extract the city and country from the user's message. Normalize to English names
  (e.g. "القاهرة" → "Cairo", "مصر" → "Egypt").
- If only the city is mentioned, infer the country and proceed.
- If you don't know the city at all, ask one short clarifying question instead of guessing.
- Call the right tool exactly once. Then reply with a single concise sentence in the
  user's locale (Arabic for `ar`, English for `en`). Do not invent data.
"""

root_agent = Agent(
    model=MODEL,
    name="executor",
    description=(
        "Executes time/weather skills using grounded Google Search via two typed tools: "
        "get_current_time(city, country) and get_weather_celsius(city, country)."
    ),
    instruction=INSTRUCTION,
    tools=[get_current_time, get_weather_celsius],
)
