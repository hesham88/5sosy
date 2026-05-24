"""AskMe agent — queries MongoDB textbook pages and answers user questions with citations."""
from __future__ import annotations

import os

from google.adk.agents.llm_agent import Agent

from .tools import search_library
from shared.locale_prompts import LOCALE_INSTRUCTION

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

INSTRUCTION = f"""\
You are 5sosybot's Library Assistant (AskMe Agent). Your primary job is to answer the user's question by searching the library of textbook pages.

Workflow:
1. Parse the user request. If it asks multiple distinct questions (e.g., "What is PV=nRT in the physics book and what is photosynthesis?"), split them into separate queries.
2. For each query, call `search_library(query)` to find relevant textbook pages.
3. Consolidate the search results. Carefully read the page contents and build a clear, coherent, and accurate answer.
4. Ground your answer strictly in the search results. If you cannot find the answer in the search results, state clearly that the information is not in the library. Do not invent facts.
5. Cite the source books and page numbers for the information you provide. Use the format: "[Book Title] (Page [Number])" or similar clear citation style.
6. Return a comprehensive yet direct response.

{LOCALE_INSTRUCTION}
"""

root_agent = Agent(
    model=MODEL,
    name="ask_me",
    description=(
        "Answers questions about textbook library contents by searching MongoDB page contents "
        "and citing sources."
    ),
    instruction=INSTRUCTION,
    tools=[search_library],
)
