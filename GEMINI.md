# 5sosy Project Instructions

5sosy is an autonomous AI study assistant for Egyptian Thanaweya Amma students, built for the Google for Startups AI Agents Challenge 2026.

## Architecture
- **Web App:** Next.js 15, App Router, TypeScript, Tailwind CSS. Deployed to Firebase App Hosting.
- **Agent Service:** Python (Google ADK, FastAPI). Deployed to Google Cloud Run as main API + background jobs.
- **Persistence (Hybrid):** 
  - **MongoDB:** Used heavily by Agents/Vector Core for storing vectors, textbook content, and analytics.
  - **Cloud Firestore:** Used for real-time UI state, synced continuously by a dedicated `migration_agent`.
  - **Firebase Storage:** Used for per-user upload scopes.
- **AI/LLM:** 
  - **Generation & Orchestration:** Gemini 3.1 Flash-Lite (Default model across the ADK swarm).
  - **Retrieval & OCR:** Gemini 3.1 Flash-Lite for multimodal vision/OCR, MongoDB Native Vector Search (`gemini-embedding-2`) for embeddings.

## Development Workflows

### Web App (`web/`)
- **Commands:**
  - `npm run dev`: Starts local development environment.
  - `npm run build`: Static build (catches prerender errors).
  - `npm run typecheck`: Runs `tsc --noEmit`.
  - `npm run lint`: Runs `next lint`.
  - `npm run seed`: Seeds Firestore (needs `gcloud auth application-default login`).

### Agent Service (`agents/`)
- **Development:**
  - Active development uses the modular swarm in: `agents/playground/` (contains `ask_me_agent`, `ingestion_agent`, `migration_agent`, etc.).
  - Legacy 5-agent code remains in `agents/src/fivesosy_agents/` but is mostly superseded.
  - Use `.venv` for local execution.
  - Deployment uses dedicated PowerShell scripts (e.g., `deploy.ps1`, `deploy-analyzer.ps1`).
- **API Surface:**
  - `fivesosybot` ADK service on Cloud Run.
  - Endpoints follow the `start` → `step` → `final` SSE pattern.

## Conventions
- **Internationalization:** Locale-segmented routes `/[locale]/...` (`ar` default RTL, `en` toggle). Use logical CSS (`ms-*`, `me-*`, `start-*`, `end-*`) for RTL support.
- **Security:** Firebase API keys are public by design. Sensitive credentials (API keys, tokens, MongoDB URIs) are managed via Google Secret Manager.
- **Agent Contract:** Never unify the "floating chatbot" (`FiveSosyBot.tsx`) and the "legacy 5-agent surface"; they are distinct.
- **Testing:** Always validate changes with `typecheck` and `build` before pushing to `main` as App Hosting auto-deploys.

## Current Status & Future Roadmap
**Completed:**
- Next.js web app (7 key screens) using Tailwind + CSS Logical Properties for RTL.
- Firebase Auth (Google/Anonymous) and Firestore Rules.
- Python ADK project scaffolded, heavily leveraging a swarm of Gemini 3.1 Flash-Lite agents.
- Hybrid MongoDB/Firestore database setup, complete with a continuous syncing `migration_agent`.
- Local execution proxies and robust deployment scripts.

**Missing / Planned for the Future:**
- **Full Cutover from Legacy:** Formally deprecate `agents/src/fivesosy_agents/` to ensure all execution goes exclusively through the `agents/playground/` modular swarm.
- **Repository Finalization:** Push local repository up to `hesham88/5sosy` on GitHub.
- **App Hosting Link:** Manually connect the newly pushed GitHub repo to Firebase App Hosting to finalize the CI/CD pipeline.
- **License Integration:** Add the official `Apache-2.0` text into the `LICENSE` file.
- **Expanded Ingestion:** Move beyond the placeholder/seed MOE textbook data to a full-scale ingestion of actual production Thanaweya Amma PDFs and YouTube video mappings.
