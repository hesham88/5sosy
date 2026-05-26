import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase/admin';
import { connectToDatabase } from '@/lib/mongodb';

export const runtime = 'nodejs';

// Admin-SDK delete for user-uploaded ("Added Book") textbooks. Cascades to the
// page records and removes the per-user GCS upload.
//
// Auth: caller must send a Firebase ID token in the `authorization: Bearer ...`
// header. Only user uploads can be deleted here — catalog/sync books are
// removed via the Sync Console "Reset". Ownership is enforced via the storage
// path (users/{uid}/uploads/...) when present; older docs created without a
// stored path are still deletable since the delete button is only ever shown
// to the uploader on their own "User Uploads" tab.
export async function POST(req: Request) {
  try {
    const { bookId } = await req.json().catch(() => ({}));
    if (!bookId || typeof bookId !== 'string') {
      return NextResponse.json({ error: 'bookId required' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'missing auth token' }, { status: 401 });
    }

    const { auth, app } = getAdmin();
    const decoded = await auth.verifyIdToken(idToken).catch(() => null);
    if (!decoded) {
      return NextResponse.json({ error: 'invalid token' }, { status: 401 });
    }

    // Returns 403 if the book exists but isn't a deletable user upload.
    const guard = (data: Record<string, any>): { ok: true } | { error: string; status: number } => {
      const isAdded = data.type === 'Added Book';
      if (!isAdded) {
        return { error: 'catalog books can only be removed via Sync Console Reset', status: 403 };
      }
      const storagePath: string = data.storagePath || data.gcsUri || '';
      // When we know the storage path, enforce that it belongs to the caller.
      // When we don't (legacy docs), allow the delete to unstick the upload.
      if (storagePath && !storagePath.includes(`users/${decoded.uid}/uploads/`)) {
        return { error: 'forbidden', status: 403 };
      }
      return { ok: true };
    };

    const cleanupStorage = async (storagePath: string) => {
      if (!storagePath.startsWith('gs://')) return;
      try {
        const { getStorage } = await import('firebase-admin/storage');
        const storage = getStorage(app);
        const match = storagePath.match(/^gs:\/\/([^/]+)\/(.+)$/);
        if (match) {
          const [, bucketName, objectPath] = match;
          await storage.bucket(bucketName).file(objectPath).delete({ ignoreNotFound: true });
        }
      } catch (e) {
        console.warn('[books/delete] storage cleanup failed:', e);
      }
    };

    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();
      const book = await db.collection('books').findOne({ _id: bookId as any });
      if (!book) {
        return NextResponse.json({ ok: true, message: 'already deleted' });
      }
      const g = guard(book as any);
      if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

      const pagesRes = await db.collection('book_pages').deleteMany({ bookId });
      await db.collection('books').deleteOne({ _id: bookId as any });
      await cleanupStorage((book as any).storagePath || (book as any).gcsUri || '');

      return NextResponse.json({ ok: true, deletedPages: pagesRes.deletedCount ?? 0 });
    }

    // Firestore
    const { db } = getAdmin();
    const bookRef = db.collection('books').doc(bookId);
    const snap = await bookRef.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: true, message: 'already deleted' });
    }
    const data = snap.data() || {};
    const g = guard(data);
    if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

    // Cascade-delete the pages subcollection in batches.
    let deletedPages = 0;
    while (true) {
      const pages = await bookRef.collection('pages').limit(400).get();
      if (pages.empty) break;
      const batch = db.batch();
      pages.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deletedPages += pages.size;
      if (pages.size < 400) break;
    }

    await cleanupStorage(data.storagePath || data.gcsUri || '');
    await bookRef.delete();

    return NextResponse.json({ ok: true, deletedPages });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[books/delete]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
