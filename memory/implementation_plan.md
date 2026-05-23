# Implementation Plan - Support Loading Books, Pages, and Videos from MongoDB

This plan details the changes required to ensure books, pages, videos, and sync status are fetched correctly from MongoDB when the database provider is set to `mongodb`.

## User Review Required

> [!IMPORTANT]
> The Books Screen and Book Details Screen were previously hardcoded to use Firestore snapshot listeners.
> We are adding two new API endpoints (`/api/books/[id]` and `/api/ingestion/status`) to query MongoDB, and updating the client components to load from these endpoints (with polling for sync progress) in MongoDB mode.

## Proposed Changes

---

### Ingestion and Books API Endpoints

#### [NEW] [route.ts](file:///C:/Users/hesh1/Desktop/5sosy/web/src/app/api/ingestion/status/route.ts)
- Implement GET endpoint to retrieve the `ingestion/status` document.
- Support both Firestore and MongoDB providers.

#### [NEW] [route.ts](file:///C:/Users/hesh1/Desktop/5sosy/web/src/app/api/books/%5Bid%5D/route.ts)
- Implement GET endpoint to retrieve details for a single book.
- For MongoDB:
  - Find the book in the `books` collection.
  - Fetch pages from the `book_contents` collection (using `_id = {bookId}_full`).
  - Fall back to checking `book_pages` or the book document itself if `book_contents` is missing.
- For Firestore:
  - Fetch the book document and pages list (checking subcollection/full document).

---

### Client Integration

#### [MODIFY] [BooksScreen.tsx](file:///C:/Users/hesh1/Desktop/5sosy/web/src/components/screens/BooksScreen.tsx)
- Check `NEXT_PUBLIC_DATABASE_PROVIDER`.
- If `mongodb`, bypass Firestore snapshot listeners and fetch books, videos, and sync status from the REST API endpoints.
- Set up a 5-second polling interval in MongoDB mode to update sync status and book lists when ingestion is running.

#### [MODIFY] [page.tsx](file:///C:/Users/hesh1/Desktop/5sosy/web/src/app/%5Blocale%5D/books/%5Bid%5D/page.tsx)
- Check `NEXT_PUBLIC_DATABASE_PROVIDER`.
- If `mongodb`, fetch the specific book and its pages list via the new `/api/books/[id]` endpoint instead of using the Firestore snapshot listener.

## Verification Plan

### Manual Verification
1. Run the local application at `http://localhost:3000`.
2. Browse to the Books page and verify the list of books and videos loads correctly from MongoDB.
3. Click on a book to open the Book Details page and verify the book pages display properly.
4. Try triggering a sync command (if configured) and verify progress updates successfully via polling.
5. Verify no console or runtime errors occur.
