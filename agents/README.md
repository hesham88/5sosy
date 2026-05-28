# 5sosy Agents — Google ADK Modular Swarm

The modular agent swarm that powers 5sosy's autonomous study assistant. Built on
**Google Agent Development Kit (ADK)** + **Gemini 3.1 Flash-Lite**, wrapped in a
**FastAPI** service for **Cloud Run** and background jobs.

All active implementations live in the `playground/` subdirectory.

## Repository Layout

```
agents/
├── playground/               # Active modular agent swarm implementation
│   ├── server.py             # FastAPI entry; SSE streaming proxy
│   ├── pyproject.toml        # Package dependencies & configuration
│   ├── Dockerfile            # Container build for Cloud Run deployment
│   ├── deploy.ps1            # Deploy script for the orchestrator/executor
│   ├── orchestrator_agent/   # Main intent router and planner
│   ├── ask_me_agent/         # Handles textbook semantic vector search (MongoDB)
│   ├── ingestion_agent/      # Handles OCR + text embedding extraction
│   ├── migration_agent/      # Syncs Firestore state to/from MongoDB
│   └── ...                   # Harvester, analyzer, mindmap, pdf_parser agents
└── README.md                 # This file
```

## Running Locally

To run the `5sosybot` API server locally:

1. Navigate to the playground directory:
   ```bash
   cd agents/playground
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\Activate.ps1
   # macOS/Linux:
   source .venv/bin/activate
   ```
3. Install package and dependencies in editable mode:
   ```bash
   pip install -e .[dev]
   ```
4. Copy environment example file:
   ```bash
   copy .env.example .env
   ```
   Edit `.env` and fill in your `GOOGLE_API_KEY`, `MONGODB_URI`, etc.
5. Run the local FastAPI server:
   ```bash
   $env:PORT=8081; python server.py
   ```

To run the ADK developer console for interactive agent testing:
```bash
adk web
```
And select `orchestrator_agent` in the interface.

## Deploying to Cloud Run

The playground contains helper scripts to deploy the main service and background jobs to Google Cloud Run:

- `deploy.ps1`: Deploys the main `khsosybot` API service.
- `deploy-job.ps1` / `deploy-migration.ps1`: Deploys the sync/migration background jobs.
- `deploy-harvester.ps1` / `deploy-analyzer.ps1`: Deploys text harvester and analyzer jobs.

Refer to `CLAUDE.md` and `GEMINI.md` in the repository root for further production deployment instructions and configuration tips.
