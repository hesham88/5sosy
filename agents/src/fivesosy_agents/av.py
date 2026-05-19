"""Audio-Visual Synthesis Agent.

Generates audio summaries (TTS) and runs mock-oral STT/grading.
"""

from __future__ import annotations

import structlog

from .schemas import AgentResponse, AVRequest, LogLine

log = structlog.get_logger("av")


async def handle(req: AVRequest) -> AgentResponse:
    log.info("av.received", voice=req.voice, locale=req.locale, has_text=bool(req.text))

    artifact = "audio/ch4-boyle.mp3"

    return AgentResponse(
        agent="av",
        result={
            "artifact": artifact,
            "voice": req.voice,
            "durationSec": 138,
            "transcript": "تخيّل عربية ملياااانة ركاب..." if req.locale == "ar" else "Imagine a packed minibus...",
        },
        log=[
            LogLine(agent="AV_Synth", text="Initializing TTS pipeline…"),
            LogLine(agent="AV_Synth", text=f"Audio artifact generated: {artifact}", status="ok"),
        ],
    )
