# Task List - Fix Onboarding Bypass and Support MongoDB Books/Pages

- `[x]` Update `AuthGate.tsx` to handle missing profiles (`profile === null`) and redirect to onboarding
- `[x]` Update `auth-context.tsx` to initialize user profiles in MongoDB on user authentication / guest sign-in
- `[x]` Update `OnboardingScreen.tsx` to avoid sending `serverTimestamp()` in MongoDB mode
- `[x]` Create API endpoint for single book fetch: `/api/books/[id]`
- `[x]` Create API endpoint for ingestion status: `/api/ingestion/status`
- `[x]` Update client `BooksScreen.tsx` to load books, videos, and sync status from MongoDB via APIs
- `[x]` Update client `books/[id]/page.tsx` to load single book and pages from MongoDB via `/api/books/[id]`
- `[x]` Verify changes locally by running code quality validation (typecheck, lint, build)
