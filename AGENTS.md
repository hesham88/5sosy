# Repository Guidelines

## Project Structure & Module Organization

This repo has two deployable areas. `web/` is the Next.js 15 App Router application with TypeScript, Tailwind, Firebase Auth, Firestore, and Storage. App routes live in `web/src/app`, reusable UI in `web/src/components`, shared Firebase/client helpers in `web/src/lib`, dictionaries in `web/src/i18n`, and static assets in `web/public`.

`agents/playground/` contains the active Cloud Run 5sosybot/onboarding/ingestion service and ADK agents. The legacy five-agent FastAPI scaffold has been fully deprecated and removed.

## Build, Test, and Development Commands

- `npm --prefix web run dev`: start the web app at `http://localhost:3000`.
- `npm --prefix web run build`: production Next.js build; run before pushing.
- `npm --prefix web run typecheck`: TypeScript validation.
- `npm --prefix web run lint`: Next/ESLint checks.
- `npm --prefix web run seed`: seed Firestore; requires Google application-default credentials.
- `cd agents/playground && pip install -e .[dev]`: install the active ADK playground service.
- `cd agents/playground && $env:PORT=8081; python server.py`: run the local FastAPI/SSE service.

## Coding Style & Naming Conventions

Use TypeScript React components with PascalCase filenames for screens/components and camelCase for functions, variables, and hooks. Keep route files minimal and place client interactivity in `'use client'` components. Use Tailwind utility classes and logical RTL-aware spacing where possible.

Python targets 3.11+, uses type hints, Pydantic models for request/response contracts, and Ruff with a 100-character line length.

## Testing Guidelines

Web validation is primarily `typecheck`, `lint`, and `build`. For changes touching App Hosting or Cloud Run integration, smoke-test the relevant local endpoint, such as `/health`, `/v1/chat`, or the Next.js `/api/agents/*` proxy.

## Commit & Pull Request Guidelines

Recent history uses concise Conventional Commit style: `fix(books): ...`, `feat: ...`, `chore: ...`. Keep subjects imperative and scoped when useful.

Pull requests should include a short summary, validation commands run, linked issue/context if any, screenshots for UI changes, and notes for Firebase, Cloud Run, or Secret Manager changes.

## Security & Configuration Tips

Do not commit `.env`, `.env.local`, API keys, or service tokens. Firebase web API keys are public by design; access control belongs in `firestore.rules`, `storage.rules`, and server-side token checks. Keep the floating chatbot (`AGENTS_BASE_URL`/`AGENTS_API_KEY`) separate from the legacy five-agent proxy (`NEXT_PUBLIC_AGENTS_BASE_URL`/`AGENTS_SERVICE_TOKEN`).
