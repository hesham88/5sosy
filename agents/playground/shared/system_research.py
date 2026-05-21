"""Education-system research sub-agent + typed skill.

Given a `country`, uses grounded Google Search to enumerate the formal education
systems available there (e.g. Thanaweya Amma, IGCSE, IB Diploma, AP, French
Baccalauréat, Abitur, ...) and returns them as `{id, ar, en}` options.

Mirrors `shared/year_research.py`. Lives separately because ADK requires
`google_search` to be the only tool on its host agent, so each grounded
researcher is its own solo-tool sub-agent.
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
You are 5sosy's Education-System Researcher. Given a `country`, use the
google_search tool to enumerate the formal education systems commonly available
there. Return GENERIC, internationally recognized system names — not specific
schools, not city-specific programs.

Examples of valid system labels:
  - Thanaweya Amma (Egyptian national secondary)
  - IB Diploma / IB MYP
  - IGCSE / GCSE / A-Levels
  - AP (Advanced Placement, US)
  - Baccalauréat (French)
  - Abitur (German)
  - National Curriculum (generic, when one dominates)
  - Homeschool / Self-study

Output ONLY a single JSON object of EXACTLY this shape:

    {
      "options": [
        {"id": "<short_camelCase_or_kebab_id>", "ar": "<Arabic label>", "en": "<English label>"}
      ]
    }

Rules:
- Include 2-5 plausible systems for the country, ordered most-common first.
- Every option object MUST have `id`, `ar`, AND `en`. Never emit `label`.
- After the plausible options, ALWAYS append these two extras in this order:
    {"id": "other", "ar": "غير ذلك", "en": "Other"}
    {"id": "skip",  "ar": "تخطى",   "en": "Skip"}
- Reply with the JSON object ONLY. No prose, no markdown fences.
"""


education_system_agent = Agent(
    model=MODEL,
    name="system_research",
    description=(
        "Enumerates formal education systems available in a given country, "
        "grounded in Google Search results. Returns a structured JSON options list."
    ),
    instruction=_AGENT_INSTRUCTION,
    tools=[google_search],
)

_APP_NAME = "fivesosybot_system_research"
_session_service = InMemorySessionService()
_runner = Runner(
    agent=education_system_agent,
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


async def research_education_systems(country: str, locale: str) -> dict:
    """Return plausible education systems available in the given country.

    Args:
        country: Country (free-form — English name, Arabic name, or "City, Country"
            all accepted; the sub-agent normalizes via search).
        locale: "ar" or "en" — hint only; both Arabic and English labels are
            always populated in the returned options.

    Returns:
        On success: {"status": "success", "country", "options": [...], "grounding"}
        On error:   {"status": "error", "error_message": "<reason>", "raw": "<...>"}
    """
    query = (
        f"In {country}, list the formal education systems students commonly study "
        "under (national curriculum, IB, IGCSE/GCSE/A-Levels, AP, Baccalauréat, "
        f"Abitur, etc.). Locale for context: {locale}. Reply with the JSON options "
        "object only, no prose."
    )
    try:
        raw, grounding = await _run(query)
        options = _parse_options(raw)
        if not options:
            return {
                "status": "error",
                "error_message": "could not parse system options from system_research output",
                "raw": raw,
            }
        return {
            "status": "success",
            "country": country,
            "options": options,
            "grounding": grounding,
        }
    except Exception as exc:
        return {"status": "error", "error_message": f"{type(exc).__name__}: {exc}"}
