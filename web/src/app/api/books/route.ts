import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase/admin';
import { connectToDatabase } from '@/lib/mongodb';
import { bookFromFirestore, compareBooks } from '@/lib/books';
import type { Book } from '@/lib/types';

export const runtime = 'nodejs';

// In-memory TTL cache for the full catalog. The list changes rarely (only when
// ingestion adds books), so serving from cache turns repeat loads from seconds
// into milliseconds. Shared per server instance.
let _booksCache: { at: number; data: Book[] } | null = null;
const BOOKS_TTL_MS = 120_000;

export async function GET(req: Request) {
  try {
    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      if (_booksCache && Date.now() - _booksCache.at < BOOKS_TTL_MS) {
        return NextResponse.json(_booksCache.data, {
          headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' },
        });
      }
      const { db } = await connectToDatabase();
      // Card view needs only metadata — never ship page text / embeddings /
      // full content for 1533 books (that's what made the list crawl).
      const docs = await db
        .collection('books')
        .find({}, { projection: { pagesList: 0, embedding: 0, embeddings: 0, content: 0, fullText: 0, rawText: 0, ocr: 0, pages_text: 0 } })
        .toArray();
      const books: Book[] = docs.map((doc: any) => {
        const id = doc._id.toString();
        return bookFromFirestore(id, doc as any);
      });
      books.sort(compareBooks);
      _booksCache = { at: Date.now(), data: books };
      return NextResponse.json(books, {
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' },
      });
    } else {
      // Default: Firestore
      const { db } = getAdmin();
      const snapshot = await db.collection('books').get();
      const books: Book[] = [];
      snapshot.forEach((d) => {
        try {
          books.push(bookFromFirestore(d.id, d.data()));
        } catch (err) {
          console.warn('[api/books] skipped malformed doc', d.id, err);
        }
      });
      books.sort(compareBooks);
      return NextResponse.json(books);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/books] Error fetching books:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
