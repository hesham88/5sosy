"""translation_agent — session-scoped pedagogical translator.

Axis 4 of the locale model: on-demand, NEVER persisted to MongoDB.
Callers receive translated text back and are free to cache it in
session/memory; the agent itself writes nothing.
"""
from . import agent  # noqa: F401
from .agent import root_agent, translate_text

__all__ = ["root_agent", "translate_text"]
