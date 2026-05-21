"""Year-of-education research sub-agent + typed skill.

Given a student's `age` and `country`, uses grounded Google Search to determine
which year(s) of formal education they are most plausibly in, and returns a list
of `{id, ar, en}` options the onboarding UI can render directly.

Architecture mirrors `shared/search.py` + `shared/tools.py`:
  - `year_research_agent` is a solo-tool grounded agent (ADK constraint:
    `google_search` must be the only tool on its host).
  - `research_year_options(age, country, locale)` is the typed skill the
    onboarding agent calls. It drives the sub-agent through a Runner and parses
    its JSON output.

Kept separate from `grounded_search_agent` because the system prompt is more
prescriptive (JSON-only, fixed shape) and the parsing logic is research-specific.
"""
from __future__ import annotations

import json
import os
import re
import uuid

from google.adk.agents.llm_agent import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import google_search
from google.genai import types

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

_AGENT_INSTRUCTION = """\
You are 5sosy's Year-of-Education Researcher. Given a student's `age` and
`country`, use the google_search tool to determine which year(s) of formal
education a person of that age is most plausibly in within that country's
education system.

Cover the FULL spectrum where age-relevant:
  - primary / preparatory (middle) school
  - secondary school (e.g. Thanaweya Amma, IB Diploma, GCSE, AP, baccalaureate)
  - undergraduate (bachelor's, year N)
  - postgraduate (master's, doctoral)
  - scholar / postdoc / lifelong learner

Use GENERIC stage titles, NEVER a specific school or university. It IS fine to
mention country-specific systems in the label (e.g. "Secondary 3 (Thanaweya Amma)"
or "Bachelor's, year 2").

Output ONLY a single JSON object of EXACTLY this shape:

    {
      "options": [
        {"id": "<short_camelCase_or_kebab_id>", "ar": "<Arabic label>", "en": "<English label>"}
      ]
    }

Rules:
- Include 2-4 plausible year/stage options first, ordered most-likely first.
- Every option object MUST have `id`, `ar`, AND `en`. Never emit `label`.
- After the plausible options, ALWAYS append these two extras in this order:
    {"id": "other", "ar": "غير ذلك", "en": "Other"}
    {"id": "skip",  "ar": "تخطى",   "en": "Skip"}
- If the age is implausibly low (<5) or implausibly high (>80), still return at
  least one plausible option plus "other" + "skip" — never refuse.
- Reply with the JSON object ONLY. No prose, no markdown fences.
"""


year_research_agent = Agent(
    model=MODEL,
    name="year_research",
    description=(
        "Determines plausible year(s) of education for a student given their age "
        "and country, grounded in Google Search results. Returns a structured "
        "JSON options list."
    ),
    instruction=_AGENT_INSTRUCTION,
    tools=[google_search],
)

_APP_NAME = "fivesosybot_year_research"
_session_service = InMemorySessionService()
_runner = Runner(
    agent=year_research_agent,
    app_name=_APP_NAME,
    session_service=_session_service,
)


async def _run(query: str) -> tuple[str, dict]:
    session_id = uuid.uuid4().hex
    await _session_service.create_session(
        app_name=_APP_NAME, user_id="tool", session_id=session_id
    )
    message = types.Content(role="user", parts=[types.Part(text=query)])

    final_chunks: list[str] = []
    any_chunks: list[str] = []
    queries: list[str] = []
    citations: list[dict] = []
    seen_uris: set[str] = set()

    async for event in _runner.run_async(
        user_id="tool", session_id=session_id, new_message=message
    ):
        gm = getattr(event, "grounding_metadata", None)
        if gm is not None:
            for q in getattr(gm, "web_search_queries", None) or []:
                if q and q not in queries:
                    queries.append(q)
            for chunk in getattr(gm, "grounding_chunks", None) or []:
                web = getattr(chunk, "web", None)
                if web is None:
                    continue
                uri = getattr(web, "uri", None)
                if not uri or uri in seen_uris:
                    continue
                seen_uris.add(uri)
                citations.append({"uri": uri, "title": getattr(web, "title", None)})

        if not event.content or not event.content.parts:
            continue
        for part in event.content.parts:
            text = getattr(part, "text", None)
            if not text:
                continue
            any_chunks.append(text)
            if event.is_final_response():
                final_chunks.append(text)

    answer = "".join(final_chunks).strip() or "".join(any_chunks).strip()
    return answer, {"queries": queries, "citations": citations}


def _parse_options(raw: str) -> list[dict] | None:
    """Parse a JSON `{options: [...]}` blob, tolerating fences and stray prose."""
    if not raw:
        return None
    candidate = raw.strip()
    if candidate.startswith("```"):
        candidate = candidate.strip("`")
        if candidate.lower().startswith("json"):
            candidate = candidate[4:]
        candidate = candidate.strip()
    obj = None
    try:
        obj = json.loads(candidate)
    except Exception:
        m = re.search(r"\{.*\}", candidate, re.DOTALL)
        if m:
            try:
                obj = json.loads(m.group(0))
            except Exception:
                obj = None
    if not isinstance(obj, dict):
        return None
    options = obj.get("options")
    if not isinstance(options, list):
        return None
    cleaned: list[dict] = []
    for o in options:
        if not isinstance(o, dict):
            continue
        oid = o.get("id")
        ar = o.get("ar") or o.get("label")
        en = o.get("en") or o.get("label")
        if not oid or not (ar or en):
            continue
        cleaned.append({"id": str(oid), "ar": str(ar or en), "en": str(en or ar)})
    return cleaned or None


async def research_year_options(age: int, country: str, locale: str) -> dict:
    """Return plausible year-of-education options for a student.

    Drives the `year_research` sub-agent to do a grounded web search and emit
    a structured options list. The list always ends with an "other" and "skip"
    entry so the onboarding UI can offer those without extra logic.

    Args:
        age: Student's age in years.
        country: Country (free-form — English name, Arabic name, or "City, Country"
            all accepted; the sub-agent normalizes via search).
        locale: "ar" or "en" — hint only; the returned options always carry both
            Arabic and English labels regardless.

    Returns:
        On success: {"status": "success", "age", "country", "options": [...], "grounding"}
        On error:   {"status": "error", "error_message": "<reason>", "raw": "<...>"}
    """
    query = (
        f"A student is {age} years old in {country}. "
        "Determine the most plausible year(s) of formal education they are in. "
        "Cover school stages (primary, preparatory, secondary including Thanaweya/IB/GCSE/AP) "
        "and higher education (bachelor's, master's, doctoral, scholar) where relevant for "
        f"the age. Locale for context: {locale}. Reply with the JSON options object only."
    )
    try:
        raw, grounding = await _run(query)
        options = _parse_options(raw)
        if not options:
            return {
                "status": "error",
                "error_message": "could not parse year options from year_research output",
                "raw": raw,
            }
        return {
            "status": "success",
            "age": age,
            "country": country,
            "options": options,
            "grounding": grounding,
        }
    except Exception as exc:
        return {"status": "error", "error_message": f"{type(exc).__name__}: {exc}"}
