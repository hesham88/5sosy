import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase/admin';
import { connectToDatabase } from '@/lib/mongodb';
import { bookFromFirestore, compareBooks } from '@/lib/books';
import type { Book } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();
      const docs = await db.collection('books').find({}).toArray();
      const books: Book[] = docs.map((doc: any) => {
        const id = doc._id.toString();
        return bookFromFirestore(id, doc as any);
      });
      books.sort(compareBooks);
      return NextResponse.json(books);
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
