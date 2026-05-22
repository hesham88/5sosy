# 5sosy — خصوصي

Autonomous AI study assistant for Egyptian school students.
Submission for the **Google for Startups AI Agents Challenge 2026, Track 1**.

5sosy ingests Ministry-of-Education textbooks and orchestrates a 5-agent
ensemble to democratize private tutoring and alternate to the current private-tutoring economy 
where 81% of Egyptian secondary students currently rely on private tutors.

> Give it a declarative intent — *"اختبار فيزياء بعد ٤٨ ساعة ومش فاهم قانون الغازات"* —
> and it builds a plan, lessons, adaptive quizzes, and a mock oral exam in
> Egyptian Arabic.

---

## Repository layout

```
5sosy/
├── web/                          # Next.js 15 App Router web app
│   ├── src/
│   │   ├── app/[locale]/         # Locale-segment routing (ar / en, RTL / LTR)
│   │   │   ├── onboarding/
│   │   │   ├── home/  session/  quiz/  oral/  progress/  settings/
│   │   │   ├── sign-in/  profile/
│   │   │   └── u/[username]/     # Advanced routing — parallel @overview + @activity
│   │   ├── app/api/agents/       # Proxy to Cloud Run agent service
│   │   ├── components/screens/   # 7 screens ported from the React prototype
│   │   ├── components/shared/    # Sidebar, MobileBar, AgentLog, atoms, Providers
│   │   ├── i18n/                 # ar/en dictionaries, get-dictionary, config
│   │   ├── lib/firebase/         # client SDK, admin SDK, auth context
│   │   └── lib/agents.ts         # client → /api/agents/<name>
│   ├── scripts/seed-firestore.ts # one-shot seeder (subjects, textbooks, concepts,
│   │                             #   quizQuestions, demo users with subcollections)
│   ├── firestore.rules           # Per-collection ACLs (users own their data)
│   ├── firestore.indexes.json
│   ├── storage.rules             # Per-user upload scopes
│   ├── apphosting.yaml           # Firebase App Hosting config (Next.js → Cloud Run)
│   ├── firebase.json   .firebaserc
│   └── .env.example   .env.local (gitignored)
│
├── agents/                       # Google ADK + FastAPI service (deploys to Cloud Run)
│   ├── pyproject.toml
│   ├── Dockerfile      cloudbuild.yaml
│   └── src/fivesosy_agents/
│       ├── server.py             # FastAPI entry; /agents/<name> endpoints
│       ├── orchestrator.py  ingestion.py  pedagogy.py  assessment.py  av.py
│       ├── schemas.py            # Pydantic request/response contracts
│       └── settings.py
│
├── 5sosy_Prototype.html          # Standalone clickable prototype (React via CDN)
├── claude_prototype/             # Source for the standalone prototype (HTML + JSX)
├── Design_Brief.md               # Visualization spec used to author the prototype
├── Challenge Strategy.html       # Original pitch / blueprint page
├── 5sosy_Claude Research.pdf     # Research dossier
├── 5sosy_Gemini Research.pdf
├── 5sosy_Technical_Blueprint.pdf
└── README.md  (this file)
```

---

## Tech stack

| Layer        | Choice                                                              |
| ------------ | ------------------------------------------------------------------- |
| Framework    | **Next.js 15** App Router, React 18, TypeScript, Tailwind CSS       |
| Auth         | Firebase Authentication (Google + Anonymous)                        |
| Database     | Cloud Firestore (with security rules + indexes)                     |
| Storage      | Firebase Storage (per-user upload scopes)                           |
| Hosting      | Firebase **App Hosting** (Next.js SSR on Cloud Run, GitHub-driven)  |
| Agents       | Google **ADK** + Gemini **3.1 Flash-Lite** (default for all agents) |
| Multimodal   | Gemini 3.1 Flash-Lite for vision/PDF OCR                            |
| Retrieval    | Vertex AI Vector Search (`gemini-embedding-2`)                      |
| Agent host   | FastAPI on **Cloud Run**                                            |
| i18n         | Arabic (RTL) + English (LTR), Cairo / Tajawal / Inter, locale cookies |

---

## Quick start

### 1) Web app (`web/`)

```powershell
cd web
npm install
copy .env.example .env.local      # then fill in the Firebase config values
npm run dev                       # → http://localhost:3000
```

The middleware redirects `/` → `/ar/home`. Try the demo path:
`/ar/onboarding` → `/ar/home` → `/ar/session` → `/ar/quiz` → `/ar/oral` → `/ar/progress`.

Switch to English from the sidebar (🌐) — the layout flips to LTR live.

### 2) Initialize Firebase (one-time, interactive)

```powershell
cd web
npm install -g firebase-tools
firebase login
firebase use khsosy
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### 3) Seed Firestore with sample data

You need application-default credentials first:

```powershell
gcloud auth application-default login
cd web
npm run seed
```

This creates: `subjects/`, `textbooks/`, `chapters/`, `concepts/`,
`quizQuestions/`, plus three demo users (`youssef`, `farida`, `ahmed`) each
with `mastery/`, `quizAttempts/`, `activity/`, and `studyPlans/today`.

You can then visit e.g. `/ar/u/youssef` to see the parallel-routes profile.

### 4) Agents service (`agents/`)

```powershell
cd agents
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
copy .env.example .env
uvicorn fivesosy_agents.server:app --reload --port 8080
```

Then in `web/.env.local`:

```
NEXT_PUBLIC_AGENTS_BASE_URL=http://localhost:8080
```

Until that env var is set, the Next.js `/api/agents/*` routes return
well-shaped **simulated** payloads — so the UI works end-to-end without the
agent backend.

### 5) Deploy

**Web app (Firebase App Hosting):**

1. Push this repo to GitHub.
2. Firebase Console → **App Hosting** → **Add backend**.
3. Choose this GitHub repo, root = `web/`.
4. App Hosting reads `web/apphosting.yaml` and deploys on every push to `main`.
5. Public URL: `https://khsosy.web.app` (or your assigned domain).

**Agents service (Cloud Run):**

```bash
cd agents
gcloud builds submit --config=cloudbuild.yaml --project=khsosy
```

Copy the resulting Cloud Run URL to App Hosting env var
`NEXT_PUBLIC_AGENTS_BASE_URL`, then trigger a redeploy.

---

## Internationalization

- Routes are locale-segmented: `/ar/*` and `/en/*`.
- `middleware.ts` redirects unprefixed paths based on cookie / `Accept-Language` / default `ar`.
- `<html lang dir>` is set per request; layout uses logical CSS
  (`ms-*`, `me-*`, `start-*`, `end-*`) so RTL flips correctly with zero
  hand-tuning per component.
- Numbers are forced LTR with `.ltr` / `.num` helpers.
- Fonts: **Cairo + Tajawal** for Arabic, **Inter** for Latin,
  **JetBrains Mono** for code/telemetry — loaded once in `[locale]/layout.tsx`.

## Advanced routing

`/[locale]/u/[username]` uses Next.js **parallel routes**
(`@overview` + `@activity`) to render a 3-pane profile from a single URL.
See `web/src/app/[locale]/u/[username]/layout.tsx`.

## Security model

- **Firebase web API keys are not secret** — they're meant to ship in the
  browser. Security is enforced by:
  - `firestore.rules`: users can only read/write their own subcollections;
    catalogue collections (`subjects`, `concepts`, `quizQuestions`) are
    read-only.
  - `storage.rules`: uploads scoped to `users/{uid}/uploads/**`, capped at 50 MB.
  - Auth: Firebase Authentication (Google OAuth + anonymous).
- The Cloud Run agent service can require a `Bearer` token
  (`AGENTS_SERVICE_TOKEN`) injected by App Hosting as a secret.

## Status

| Area                                 | State                                |
| ------------------------------------ | ------------------------------------ |
| Web app (all 7 screens)              | ✅ Implemented in Next.js            |
| Firebase Auth (Google + anonymous)   | ✅ Wired                              |
| Firestore rules + indexes            | ✅ Drafted                            |
| Storage rules                        | ✅ Drafted                            |
| Sample seed data                     | ✅ Script ready (`npm run seed`)      |
| Agent API placeholders               | ✅ Proxy + simulated fallback         |
| ADK Python project                   | ✅ Scaffolded (handlers stubbed)      |
| Cloud Run deploy pipeline            | ✅ `cloudbuild.yaml`                  |
| App Hosting config                   | ✅ `web/apphosting.yaml`              |
| GitHub repo at `hesham88/5sosy`      | ⏳ Awaiting `git push`                |
| App Hosting → GitHub connection      | ⏳ Manual step (see deploy section)   |

---

## License

Source available, pending Apache-2.0 — see `LICENSE` (to be added).

## Authors

Hesham · 5sosy — Built for the Google for Startups AI Agents Challenge 2026
(submission deadline **2026-06-06**).
