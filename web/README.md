# 5sosy — web app

Next.js 15 (App Router) implementation of the 5sosy student web app.
See the top-level [`../README.md`](../README.md) for the full project context.

## Scripts

| Command           | What it does                                                |
| ----------------- | ----------------------------------------------------------- |
| `npm run dev`     | Dev server on `http://localhost:3000`                       |
| `npm run build`   | Production build                                            |
| `npm start`       | Run built app                                               |
| `npm run lint`    | Next/ESLint                                                 |
| `npm run typecheck` | `tsc --noEmit`                                            |
| `npm run seed`    | Seed Firestore (requires ADC or `GOOGLE_APPLICATION_CREDENTIALS`) |

## Routes

```
/                              → redirects to /ar/home (locale from cookie / Accept-Language)
/[locale]/onboarding           3-step setup wizard
/[locale]/home                 Dashboard (intent input + plan + weak topics)
/[locale]/session              Smart lesson + audio summary + chat
/[locale]/quiz                 Adaptive quiz (MCQ / short / order)
/[locale]/oral                 Mock oral exam (mic orb + live rubric)
/[locale]/progress             Heatmap + concept graph + badges
/[locale]/settings             Language, TTS accent, textbooks, privacy
/[locale]/sign-in              Google + anonymous Firebase auth
/[locale]/profile              Edit your Firestore profile doc
/[locale]/u/[username]         Public profile (parallel routes: @overview + @activity)

/api/agents                    GET — list available agents + upstream mode
/api/agents/<name>             POST — proxy to Cloud Run (or simulated)
```

`[locale]` ∈ `{ ar, en }`.

## Key files

- `src/middleware.ts` — locale detection / redirect
- `src/app/[locale]/layout.tsx` — fonts (Cairo/Tajawal/Inter/JetBrains Mono) + `<html dir>`
- `src/components/shared/Providers.tsx` — `useApp()` context (locale, streak, xp, dict)
- `src/lib/firebase/client.ts` — lazy SDK init
- `src/lib/firebase/auth-context.tsx` — `<AuthProvider>` + user doc upsert
- `src/app/api/agents/_lib.ts` — single proxy handler with simulated fallback

## Environment

`.env.example` lists every variable. `.env.local` is gitignored and contains
the actual Firebase web config for the **khsosy** project.

| Var                                | Where it's used                          |
| ---------------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_FIREBASE_*`           | Browser-side Firebase SDK init           |
| `NEXT_PUBLIC_AGENTS_BASE_URL`      | If set, `/api/agents/*` proxies upstream |
| `AGENTS_SERVICE_TOKEN`             | Server-only Bearer token for Cloud Run   |

The Firebase **web** config keys are designed to be public — security is
enforced by `firestore.rules` + `storage.rules` + Auth.

## Notes

- All client interactivity (state, animations, mic orb pulse, agent-log
  typewriter) lives in `'use client'` components under `components/`.
- Server components (the `app/.../page.tsx` files) stay minimal — they only
  await `params` and render the client screen.
- Numbers are forced LTR with `.ltr` / `.num` helpers — they always render
  left-to-right even inside Arabic paragraphs.
