import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase/admin';
import { connectToDatabase } from '@/lib/mongodb';
import { bookFromFirestore } from '@/lib/books';
import type { Book } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();
      const bookDoc = await db.collection('books').findOne({ _id: id as any });
      if (!bookDoc) {
        return NextResponse.json({ error: 'Book not found' }, { status: 404 });
      }

      // Fetch pages from book_contents
      let pages: { pageNumber: number; text: string }[] = [];
      const contentDoc = await db.collection('book_contents').findOne({ _id: `${id}_full` as any });
      if (contentDoc && Array.isArray(contentDoc.pagesList)) {
        pages = contentDoc.pagesList;
      } else if (Array.isArray(bookDoc.pagesList)) {
        pages = bookDoc.pagesList;
      } else {
        // Fallback to book_pages collection
        const pagesDocs = await db.collection('book_pages').find({ bookId: id }).toArray();
        pages = pagesDocs.map((pd: any) => ({
          pageNumber: pd.pageNumber || 0,
          text: pd.text || '',
        }));
      }

      pages.sort((a, b) => a.pageNumber - b.pageNumber);

      const book = bookFromFirestore(id, bookDoc as any);

      return NextResponse.json({ book, pages });
    } else {
      // Default: Firestore
      const { db } = getAdmin();
      const bookSnap = await db.collection('books').doc(id).get();
      if (!bookSnap.exists) {
        return NextResponse.json({ error: 'Book not found' }, { status: 404 });
      }
      const data = bookSnap.data() || {};
      const book = bookFromFirestore(id, data);

      let pages: { pageNumber: number; text: string }[] = [];
      const contentSnap = await db.collection('books').doc(id).collection('content').doc('full').get();
      if (contentSnap.exists) {
        const c = contentSnap.data() || {};
        if (Array.isArray(c.pagesList)) {
          pages = c.pagesList;
        }
      }

      if (pages.length === 0 && Array.isArray(data.pagesList)) {
        pages = data.pagesList;
      }

      if (pages.length === 0) {
        const pagesSnap = await db.collection('books').doc(id).collection('pages').orderBy('pageNumber', 'asc').get();
        pages = pagesSnap.docs.map((d) => {
          const pd = d.data();
          return { pageNumber: pd.pageNumber || 0, text: pd.text || '' };
        });
      }

      pages.sort((a, b) => a.pageNumber - b.pageNumber);

      return NextResponse.json({ book, pages });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[api/books/id] Error fetching book ${id}:`, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
