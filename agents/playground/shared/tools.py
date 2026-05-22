"""Executor's typed skills.

Each skill drives the private `grounded_search` sub-agent through a Runner and
returns a structured dict, so the executor sees a typed function but the answer
is still grounded in live Google Search results.

The dict shape follows the ADK convention:
    {"status": "success", ...payload}  on success
    {"status": "error", "error_message": "..."}  on failure
"""
from __future__ import annotations

import uuid

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from .search import grounded_search_agent

_APP_NAME = "khsosybot_search"
_session_service = InMemorySessionService()
_runner = Runner(
    agent=grounded_search_agent,
    app_name=_APP_NAME,
    session_service=_session_service,
)


async def _ask_grounded(query: str) -> tuple[str, dict]:
    """Single-turn run of grounded_search. Returns (answer, grounding)."""
    session_id = uuid.uuid4().hex
    await _session_service.create_session(
        app_name=_APP_NAME, user_id="tool", session_id=session_id
    )
    message = types.Content(role="user", parts=[types.Part(text=query)])

    final_chunks: list[str] = []
    any_chunks: list[str] = []
    queries: list[str] = []
    citations: list[dict] = []
    seen_citation_uris: set[str] = set()

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
                if not uri or uri in seen_citation_uris:
                    continue
                seen_citation_uris.add(uri)
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


async def get_current_time(city: str, country: str) -> dict:
    """Return the current local time in the given city and country.

    Uses grounded Google Search so the answer reflects real-world time, not the
    model's training cutoff.

    Args:
        city: City name in English, e.g. "Cairo".
        country: Country name in English, e.g. "Egypt".

    Returns:
        On success: {"status": "success", "city", "country", "time", "grounding"}
        On error:   {"status": "error", "error_message": "<reason>"}
    """
    query = (
        f"What is the current local time in {city}, {country}? "
        "Reply with one short sentence and include the timezone."
    )
    try:
        answer, grounding = await _ask_grounded(query)
        if not answer:
            return {
                "status": "error",
                "error_message": f"grounded_search returned no answer for {city}, {country}.",
            }
        return {
            "status": "success",
            "city": city,
            "country": country,
            "time": answer,
            "grounding": grounding,
        }
    except Exception as exc:
        return {"status": "error", "error_message": f"{type(exc).__name__}: {exc}"}


async def get_weather_celsius(city: str, country: str) -> dict:
    """Return the current temperature (°C) and brief conditions for a city.

    Uses grounded Google Search; the value is fresh, not from training data.

    Args:
        city: City name in English, e.g. "Cairo".
        country: Country name in English, e.g. "Egypt".

    Returns:
        On success: {"status": "success", "city", "country", "weather", "grounding"}
        On error:   {"status": "error", "error_message": "<reason>"}
    """
    query = (
        f"What is the current weather in {city}, {country}? "
        "Reply with one short sentence including the temperature in degrees Celsius "
        "and a brief description (e.g. clear, cloudy, rainy)."
    )
    try:
        answer, grounding = await _ask_grounded(query)
        if not answer:
            return {
                "status": "error",
                "error_message": f"grounded_search returned no answer for {city}, {country}.",
            }
        return {
            "status": "success",
            "city": city,
            "country": country,
            "weather": answer,
            "grounding": grounding,
        }
    except Exception as exc:
        return {"status": "error", "error_message": f"{type(exc).__name__}: {exc}"}
