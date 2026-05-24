import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase/admin';
import { connectToDatabase } from '@/lib/mongodb';
import { bookFromFirestore } from '@/lib/books';

export const runtime = 'nodejs';

const HEAVY = { embedding: 0, embeddings: 0, fullText: 0, rawText: 0, ocr: 0 } as const;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pageParam = new URL(req.url).searchParams.get('page');
  try {
    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();

      // ---- Single-page mode: fetch just one page's text (fast, lazy) ----
      if (pageParam) {
        const n = parseInt(pageParam, 10);
        let text = '';
        const pd = await db.collection('book_pages').findOne(
          { bookId: id, pageNumber: n }, { projection: { text: 1, _id: 0 } }
        );
        if (pd) {
          text = (pd as any).text || '';
        } else {
          const contentDoc = await db.collection('book_contents').findOne(
            { _id: `${id}_full` as any }, { projection: { pagesList: 1 } }
          );
          const list = Array.isArray((contentDoc as any)?.pagesList) ? (contentDoc as any).pagesList : [];
          const found = list.find((p: any) => p.pageNumber === n);
          text = found?.text || '';
        }
        return NextResponse.json({ page: { pageNumber: n, text } });
      }

      // ---- Meta mode: book + page count + page 1 only (the rest load lazily) ----
      const bookDoc = await db.collection('books').findOne(
        { _id: id as any }, { projection: HEAVY }
      );
      if (!bookDoc) {
        return NextResponse.json({ error: 'Book not found' }, { status: 404 });
      }
      const book = bookFromFirestore(id, bookDoc as any);

      let pageCount = book.pages || 0;            // count is stored on the book doc
      let pages: { pageNumber: number; text: string }[] = [];

      // First page from per-page docs (cheap), else from the monolithic content doc.
      const firstArr = await db.collection('book_pages')
        .find({ bookId: id }, { projection: { pageNumber: 1, text: 1, _id: 0 } })
        .sort({ pageNumber: 1 }).limit(1).toArray();
      if (firstArr.length) {
        pages = [{ pageNumber: (firstArr[0] as any).pageNumber || 1, text: (firstArr[0] as any).text || '' }];
      } else {
        const contentDoc = await db.collection('book_contents').findOne(
          { _id: `${id}_full` as any }, { projection: { pagesList: 1 } }
        );
        let list: any[] = Array.isArray((contentDoc as any)?.pagesList)
          ? (contentDoc as any).pagesList
          : (Array.isArray((bookDoc as any).pagesList) ? (bookDoc as any).pagesList : []);
        list = [...list].sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
        if (!pageCount) pageCount = list.length;
        if (list.length) pages = [{ pageNumber: list[0].pageNumber || 1, text: list[0].text || '' }];
      }

      return NextResponse.json({ book, pageCount, pages });
    } else {
      // ---- Firestore (non-prod): keep returning all pages; add pageCount ----
      const { db } = getAdmin();
      const bookSnap = await db.collection('books').doc(id).get();
      if (!bookSnap.exists) {
        return NextResponse.json({ error: 'Book not found' }, { status: 404 });
      }
      const data = bookSnap.data() || {};
      const book = bookFromFirestore(id, data);

      if (pageParam) {
        const n = parseInt(pageParam, 10);
        const pageSnap = await db.collection('books').doc(id).collection('pages').doc(String(n)).get();
        const text = pageSnap.exists ? ((pageSnap.data() || {}).text || '') : '';
        return NextResponse.json({ page: { pageNumber: n, text } });
      }

      let pages: { pageNumber: number; text: string }[] = [];
      const contentSnap = await db.collection('books').doc(id).collection('content').doc('full').get();
      if (contentSnap.exists) {
        const c = contentSnap.data() || {};
        if (Array.isArray(c.pagesList)) pages = c.pagesList;
      }
      if (pages.length === 0 && Array.isArray(data.pagesList)) pages = data.pagesList;
      if (pages.length === 0) {
        const pagesSnap = await db.collection('books').doc(id).collection('pages').orderBy('pageNumber', 'asc').get();
        pages = pagesSnap.docs.map((d) => {
          const pd = d.data();
          return { pageNumber: pd.pageNumber || 0, text: pd.text || '' };
        });
      }
      pages.sort((a, b) => a.pageNumber - b.pageNumber);
      return NextResponse.json({ book, pageCount: pages.length, pages });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[api/books/id] Error fetching book ${id}:`, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
