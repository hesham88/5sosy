# 5sosy Agents — Google ADK service

The 5-agent ensemble that powers 5sosy's autonomous study assistant. Built on
**Google Agent Development Kit (ADK)** + **Gemini 2.5**, wrapped in a
**FastAPI** service for **Cloud Run**.

| Agent             | Module                     | Job                                                          |
| ----------------- | -------------------------- | ------------------------------------------------------------ |
| Orchestrator      | `orchestrator.py`          | Parses declarative intent, drafts the macro plan             |
| Ingestion / Topology | `ingestion.py`         | OCRs MOE PDFs, embeds chunks to Vertex AI Vector Search      |
| Pedagogy          | `pedagogy.py`              | Maps misconceptions, flags weak concepts                     |
| Assessment        | `assessment.py`            | Scores quizzes, isolates algorithmic failure modes           |
| Audio-Visual      | `av.py`                    | Egyptian-Arabic TTS summaries + mock-oral STT/grading        |

## Layout

```
agents/
├── pyproject.toml          # Python 3.11+, ADK, FastAPI, google-genai
├── Dockerfile              # Cloud Run image
├── cloudbuild.yaml         # CI/CD → Cloud Run
├── .env.example            # Local config template
└── src/fivesosy_agents/
    ├── server.py           # FastAPI app (Cloud Run entry)
    ├── settings.py         # Env-driven config
    ├── schemas.py          # Pydantic request/response models
    ├── orchestrator.py
    ├── ingestion.py
    ├── pedagogy.py
    ├── assessment.py
    └── av.py
```

## Local dev

```bash
cd agents
python -m venv .venv && source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -e .[dev]

cp .env.example .env
# Edit .env — at minimum set GOOGLE_CLOUD_PROJECT, run `gcloud auth application-default login`

uvicorn fivesosy_agents.server:app --reload --port 8080
```

Smoke-test:

```bash
curl -s http://localhost:8080/healthz
curl -s -X POST http://localhost:8080/agents/orchestrator \
  -H 'content-type: application/json' \
  -d '{"intent":"اختبار فيزياء بعد ٤٨ ساعة","locale":"ar"}' | jq
```

Run tests:

```bash
pytest -q
```

## Wiring to the Next.js web app

Set in `web/.env.local` (or in Firebase App Hosting env vars):

```
NEXT_PUBLIC_AGENTS_BASE_URL=http://localhost:8080    # local
NEXT_PUBLIC_AGENTS_BASE_URL=https://5sosy-agents-<hash>-uc.a.run.app  # deployed
AGENTS_SERVICE_TOKEN=<random-string>                  # if you set one here too
```

The Next.js route at `/api/agents/<name>` will proxy to this service. If the
URL is unset, it returns simulated payloads — useful while the agent logic is
still being built.

## Deploy to Cloud Run

```bash
gcloud config set project khsosy
gcloud builds submit --config=cloudbuild.yaml
```

Or manually:

```bash
gcloud run deploy 5sosy-agents \
  --source=. \
  --region=us-central1 \
  --allow-unauthenticated \
  --set-env-vars=GOOGLE_CLOUD_PROJECT=khsosy,GOOGLE_GENAI_USE_VERTEXAI=true \
  --memory=1Gi --cpu=1 --max-instances=10
```

Then take the resulting `https://...run.app` URL and set it as
`NEXT_PUBLIC_AGENTS_BASE_URL` in App Hosting.

## Status

All five agent handlers currently return well-shaped placeholder payloads that
match the schema the web app expects. Wire real ADK `Agent` / `Tool` graphs
inside each `handle()` once you're ready — the HTTP contract won't change.
