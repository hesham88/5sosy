# Session 2026-05-24 — Fix Onboarding Bypass & MongoDB Books/Pages Loading

## Current Diagnostics & Root Cause

1. **Onboarding Bypass**:
   - The user noticed that creating a new guest or logging in with Google bypassed the onboarding wizard and directly routed to the Home page.
   - **Root Cause**: Previously, `AuthGate.tsx` checked `if (profile && profile.onboardingCompleted !== true)`. When a user signed in for the first time, `profile` was initially `null` since no profile had been created in MongoDB. Because `profile` was `null`, the condition evaluated to `false`, bypassing the onboarding gate altogether and letting the user access the main application dashboard showing hardcoded static/fallback mock data.

2. **Missing Profiles in MongoDB**:
   - **Root Cause**: The client-side authentication callback `upsertUserDoc` was hardcoded to check and write profile documents directly to Firestore, meaning MongoDB was never initialized with a profile document on new registrations or sign-ins.

3. **Timestamps & Serialization Issues**:
   - **Root Cause**: Firestore's `serverTimestamp()` sentinel value was being sent over JSON to the MongoDB REST endpoints on onboarding completion, causing database errors.

4. **Books, Pages, and Videos direct Firestore reads**:
   - **Root Cause**: The books listing (`BooksScreen.tsx`) and the single book details/pages view (`books/[id]/page.tsx`) were using direct Firestore snapshot listeners (`onSnapshot`) without checking the active database provider.

## Resolutions & Implemented Changes

1. **Gate Redirection Update**:
   - Modified `AuthGate.tsx` to require that the profile must exist (`!profile` redirects to onboarding) and `onboardingCompleted` must be `true` before allowing access to internal pages.

2. **MongoDB Profile Upserts**:
   - Updated `auth-context.tsx` to handle `provider === 'mongodb'`. It now checks if the profile exists in MongoDB via a `GET /api/users/profile` request. If it receives a `404`, it initializes the profile document with `onboardingCompleted: false` via a `POST` request. If the profile exists, it updates `lastSeenAt` and `lastLoginAt`.

3. **Timestamp Normalization**:
   - Updated `OnboardingScreen.tsx` to use standard ISO strings (`new Date().toISOString()`) for `onboardingCompletedAt` if the database provider is MongoDB, preventing serialization problems.

4. **MongoDB Books, Videos, and Ingestion APIs**:
   - Created `/api/books/[id]` GET endpoint to fetch metadata from the `books` collection and retrieve pages list from the `book_contents` collection (collating pages properly for MongoDB).
   - Created `/api/ingestion/status` GET endpoint to fetch ingestion status.
   - Updated `BooksScreen.tsx` to conditionally fetch books, videos, and ingestion status from the REST API endpoints and poll progress status every 5 seconds when in MongoDB mode.
   - Updated `books/[id]/page.tsx` to load single book metadata and pages list from `/api/books/[id]` if in MongoDB mode.
