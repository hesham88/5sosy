# 5sosybot Playground — orchestrator + executor

A two-agent ADK POC for the 5sosybot floating chat bot.

```
agents/playground/
├─ orchestrator_agent/         # routes intent, delegates to executor for time/weather
├─ executor_agent/             # runs get_current_time / get_weather_celsius
└─ shared/                     # private grounded_search sub-agent + the two tool fns
```

## Why a private grounded_search sub-agent?

ADK's built-in `google_search` tool can **only** be used by itself in an agent. To still
expose two named skills (`get_current_time`, `get_weather_celsius`) on the executor, each
tool function internally runs the `grounded_search` sub-agent (which has just
`google_search`) and returns its answer.

## Local dev (Phase 1)

```bash
cd agents/playground
python -m venv .venv
. .venv/Scripts/activate   # Windows PowerShell:  .venv\Scripts\Activate.ps1
pip install -e .
cp .env.example .env       # then paste your GOOGLE_API_KEY
adk web                    # opens http://localhost:8000
```

Pick **orchestrator_agent** in the dropdown for the end-to-end flow, or **executor_agent**
to test the skills directly.

## Phase 2 (next)

FastAPI server (`server.py`) wrapping the orchestrator with SSE streaming on `/v1/chat`,
plus Dockerfile + Cloud Build to deploy as a single Cloud Run service.
