from . import agent  # noqa: F401
from .detector import (
    SUPPORTED_LANGUAGES,
    LANGUAGE_NAMES,
    detect_language,
    detect_language_verbose,
)

__all__ = [
    "SUPPORTED_LANGUAGES",
    "LANGUAGE_NAMES",
    "detect_language",
    "detect_language_verbose",
]
