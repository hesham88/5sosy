# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

5sosy (خصوصي) — an AI study assistant for Egyptian Thanaweya Amma students, submitted to the Google for Startups AI Agents Challenge 2026 (Track 1, deadline **2026-06-06**). The stack is locked to Google: Gemini 2.5 / 3.1, ADK Python, Vertex AI Vector Search, Firebase. Multi-LLM (Claude / GPT) is explicitly excluded from the product surface.

Two deployable units live in this repo, with very different runtime models:

- **`web/`** — Next.js 15 App Router app on Firebase **App Hosting** (`khsosyapphosting` backend in `us-east4`, auto-deploys from `main`). Live at https://khsosyapphosting--khsosy.us-east4.hosted.app. Firebase project: `khsosy`.
- **`agents/playground/`** — `fivesosybot` ADK service on **Cloud Run** (`us-east4`, project `khsosy`). Live at https://fivesosybot-ujeiecpdja-uk.a.run.app. **Not** in the App Hosting deploy graph — deploy it explicitly with `agents/playground/deploy.ps1`.
- **`agents/src/fivesosy_agents/`** — scaffold for the 5-agent production stack (orchestrator / ingestion / pedagogy / assessment / av). All handlers currently return well-shaped placeholder payloads; HTTP contract is stable so the web app already consumes it via simulated fallback.

`khsosy.web.app` is a Firebase *Hosting* default — it is a different product and cannot be added as an App Hosting custom domain.

## Common commands

All web commands run from `web/`:

```powershell
npm run dev         # http://localhost:3000  (middleware redirects / → /ar/home)
npm run build       # Catches the static-prerender errors that only fire here
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run seed        # tsx scripts/seed-firestore.ts — needs `gcloud auth application-default login` first
```

Agent playground commands run from `agents/playground/`:

```powershell
.\.venv\Scripts\Activate.ps1
adk web                          # http://localhost:8000 — pick orchestrator_agent for the full flow
$env:PORT=8081; python server.py # FastAPI SSE server locally
.\deploy.ps1                     # Re-deploys fivesosybot to Cloud Run
.\setup-secrets.ps1 -Force -AgentsKey <new>   # Rotate API key in Secret Manager
```

Legacy 5-agent scaffold (`agents/`):

```powershell
pip install -e .[dev]
uvicorn fivesosy_agents.server:app --reload --port 8080
pytest -q
```

Validate before pushing to `main` — App Hosting auto-deploys on push, so a bad commit ships straight to production:

```powershell
npm --prefix web run typecheck
npm --prefix web run build
```

If a fix involves Cloud Run, **also redeploy `fivesosybot` and smoke-test `/health` + `/v1/chat`** before pushing. App Hosting deploys do not touch Cloud Run.

## Architecture

### Web → Agents wiring

Two parallel proxy layers, with different upstreams and different fallback behavior:

1. **Floating chatbot (`5sosybot`)**: `web/src/components/fivesosybot/FiveSosyBot.tsx` is mounted in `web/src/app/[locale]/layout.tsx` so it appears on every locale route. It POSTs to `web/src/app/api/agents/chat/route.ts`, which reads `AGENTS_BASE_URL` + `AGENTS_API_KEY` from env, injects `X-API-Key`, and streams SSE from the Cloud Run `fivesosybot` service through to the browser. Falls back to a simulated SSE answer if either env var is missing.

2. **Legacy 5-agent surface**: client calls `callAgent(name, payload)` from `web/src/lib/agents.ts` → `/api/agents/<name>` (handled by `web/src/app/api/agents/_lib.ts`) → reads `NEXT_PUBLIC_AGENTS_BASE_URL` + `AGENTS_SERVICE_TOKEN` to proxy to the FastAPI service in `agents/src/fivesosy_agents/`. Returns simulated payloads when `NEXT_PUBLIC_AGENTS_BASE_URL` is unset (the current production state). Do not unify the two surfaces — they exist on purpose.

The SSE shape from `agents/playground/server.py /v1/chat` is `start` → many `step` (each with `agent`, `step_type`, `input/output`, `duration_ms`, optional `grounding`) → terminal `final` (with `intent`, `final_response`, `trace[]`, timings). See `_extract_step` for the mapping from ADK runtime events.

### ADK playground (`agents/playground/`)

Two-agent in-process design — single Cloud Run service, both agents share one runner:

- `orchestrator_agent` — classifies intent (`ask_time` / `ask_weather` / `chit_chat` / `unknown`), delegates time/weather to executor via `sub_agents=[executor]`, replies directly for chit-chat. Always responds in the user's locale (en / ar).
- `executor_agent` — typed skills `get_current_time(city, country)` and `get_weather_celsius(city, country)`. Each skill internally runs the `shared/search.py grounded_search` sub-agent because **ADK requires `google_search` to be the only tool on its host agent** — that's why grounded_search is a separate solo-tool sub-agent invoked from inside the typed skill functions.
- ADK app names must start with a letter (Pydantic-validated): use `fivesosybot_search`, not `5sosybot_search`.
- Use `from google.adk.agents.llm_agent import Agent` (not `LlmAgent`); tool functions return structured `dict` with a `status` key, not raw strings.
- Model is controlled by `GEMINI_MODEL` env var (default `gemini-3.1-flash-lite`).

### Web app

- Next.js 15 App Router with locale-segmented routes `/[locale]/...` (`ar` RTL default, `en` LTR toggle). `web/src/middleware.ts` redirects unprefixed paths via cookie → `Accept-Language` → default.
- All layout uses logical CSS (`ms-*`, `me-*`, `start-*`, `end-*`) so RTL flips automatically.
- Screens live in `web/src/components/screens/`; chrome (sidebar, mobile drawer, agent log) in `web/src/components/shared/Chrome.tsx`.
- Auth via Firebase Authentication (Google + Anonymous). Firestore security is per-collection ACLs in `web/firestore.rules`; storage upload scopes in `web/storage.rules`. Firebase web API key is **not** secret — it ships to the browser by design.
- `/[locale]/u/[username]` uses Next.js parallel routes (`@overview` + `@activity`).
- The brand mark **"5sosy" stays Latin in both locales** — never transliterate to "٥سوسي". Tagline/copy around it is Arabic; the wordmark is not.

## Production gotchas (paid for in blood — read before changing deploy config)

### Firebase App Hosting (`web/`)

1. **Backend source-code root is `/web`**, not `/`. Set in Firebase Console → backend Settings; there is no `apphosting.yaml` knob for this.
2. **`apphosting.yaml` rejects `value: ""`** — the buildpack fails with `fah/invalid-apphosting-yaml`. Either give a real value or omit the entry. Same for `secret:` references to secrets that don't exist yet in Secret Manager — provision first with `firebase apphosting:secrets:set <NAME>`.
3. **Next.js floor for the 15.x line is `15.5.18`** + matching `eslint-config-next`. The buildpack runs its own CVE check and refused 15.0.3 and 15.5.7. Bump again if a new advisory drops.
4. **`useSearchParams()` needs `<Suspense>` for static prerender.** Pattern: split body into a `*Client.tsx` subcomponent and wrap in `<Suspense fallback={null}>` from `page.tsx`. Already applied to `/[locale]/books/page.tsx` and `/[locale]/sign-in/page.tsx`.
5. **`firestore.indexes.json` is for *composite* indexes only.** Single-field entries make `firebase deploy --only firestore` 400 with "this index is not necessary." Single-field indexes are configured via Firestore Console.
6. **Stale `secret-alias-N` references silently break env vars.** If a `secret:` referenced in `apphosting.yaml` wasn't accessible at build time, App Hosting still ships the revision pointing at a missing alias, and the env var resolves empty at runtime (silently falling into any "unset" fallback path). Symptom: 5sosybot chat returns the simulated reply in production. Fix: `firebase apphosting:secrets:grantaccess <secret> --backend <backend>` then `firebase apphosting:rollouts:create <backend> --git-branch main --force`. Verify with `gcloud run services describe <backend> --format='value(spec.template.spec.containers[0].env)'`.

### Cloud Run `fivesosybot` (`agents/playground/`)

1. **`--set-env-vars` parses on commas.** `ALLOWED_ORIGINS` contains commas between origins, which the parser splits as separate keys → "Bad syntax for dict arg." Prefix the value with `^@^` to override the delimiter to `@`. See `deploy.ps1`.
2. **Compute default SA needs `roles/cloudbuild.builds.builder`** for `gcloud run deploy --source` (otherwise `403 storage.objects.get` reading the staged source). `deploy.ps1` binds this idempotently.
3. **Pre-create Artifact Registry repo `cloud-run-source-deploy`** + use `--quiet` so the first deploy doesn't prompt.
4. **Knative reserves `/healthz`** — the Google Frontend intercepts it before the container sees it (returns an HTML 404 with no `x-cloud-trace-context` header). Use `/health` instead. Already wired this way in `server.py`.
5. **Two URL formats coexist** (`*-<project-number>.<region>.run.app` and `*-<random>-<region-code>.a.run.app`). Both route to the same revision; `gcloud run services describe ... --format "value(status.url)"` returns the legacy one.

### Auth for the Cloud Run service

`X-API-Key` header must match `AGENTS_API_KEY` env (mounted from Secret Manager secret `fivesosybot-api-key`). When the env var is unset locally, auth is disabled — convenience for `python server.py` dev. The service is `--allow-unauthenticated` at the Cloud Run level; the API key is the real gate. The same plaintext lives in `web/.env.local` and in App Hosting via `secret: fivesosybot-api-key` in `apphosting.yaml`.

### Tooling notes

- **Long parallel `firebase` / `gcloud` describe commands inside Claude Code's Bun runtime have OOM-crashed the CLI twice** when deploy-verifying. Prefer sequential single calls, or run from a plain PowerShell terminal when checking many resources at once.
- `adk` CLI lives at `agents/playground/.venv/Scripts/adk.exe` (not on PATH). Activate the venv or invoke the exe directly; `python -m google.adk.cli web <agents_dir>` is the no-venv equivalent.
