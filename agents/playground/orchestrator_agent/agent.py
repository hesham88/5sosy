"""Orchestrator agent — classifies intent and delegates to the executor or ask_me agent."""
from __future__ import annotations

import os

from google.adk.agents.llm_agent import Agent

from executor_agent.agent import root_agent as executor_agent
from translation_agent.agent import root_agent as translator_agent
from ask_me_agent.agent import root_agent as ask_me_agent
from shared.locale_prompts import LOCALE_INSTRUCTION

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

INSTRUCTION = f"""\
You are 5sosybot's Orchestrator. Each turn you receive a user message along with metadata:
username, locale (one of ar/en/fr/de/es/it/zh), and an optional pre-classified `intent`.

Your job:
1. Classify the user's intent into one of:
   - ask_time           → user is asking for the current local time somewhere
   - ask_weather        → user is asking about current weather/temperature somewhere
   - request_translation→ user is asking to translate a passage or page to another
                          language (e.g. "translate this to French", "اشرحلي ده
                          بالإنجليزي", "Übersetze das auf Deutsch")
   - ask_library        → user is asking a question about textbook material, science, history,
                          concepts covered in books, or requesting to search/retrieve page info.
   - chit_chat          → greetings, small talk, identity questions
   - unknown            → anything that doesn't fit the above
2. If `ask_time` or `ask_weather` → transfer to the `executor` sub-agent.
3. If `request_translation` → transfer to the `translator` sub-agent. Pass the
   source text plus source_locale and target_locale you extracted from the user.
4. If `ask_library` → transfer to the `ask_me` sub-agent.
5. If `chit_chat` or `unknown` → reply yourself in one or two short sentences.
6. Never invent live data (time, weather, dates) or search library content yourself — always delegate.

{LOCALE_INSTRUCTION}
"""

root_agent = Agent(
    model=MODEL,
    name="orchestrator",
    description=(
        "5sosybot top-level router. Classifies user intent and delegates time/weather "
        "questions to the executor sub-agent, translation requests to the translator "
        "sub-agent, and book queries to the ask_me sub-agent. Supports 7 UI locales (ar/en/fr/de/es/it/zh)."
    ),
    instruction=INSTRUCTION,
    sub_agents=[executor_agent, translator_agent, ask_me_agent],
)
