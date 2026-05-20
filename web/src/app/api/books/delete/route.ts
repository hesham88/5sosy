import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

// Admin-SDK delete: cascades to the books/{bookId}/pages subcollection and
// removes the per-user GCS upload if storagePath looks like one.
//
// Auth: caller must send a Firebase ID token in the `authorization: Bearer ...`
// header. We verify the token and require the requester to be the same user
// who owns the storage path (users/{uid}/...). Catalog-sync books with no
// per-user storage path can only be deleted via the sync console "Reset".
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

    const { auth, db, app } = getAdmin();
    const decoded = await auth.verifyIdToken(idToken).catch(() => null);
    if (!decoded) {
      return NextResponse.json({ error: 'invalid token' }, { status: 401 });
    }

    const bookRef = db.collection('books').doc(bookId);
    const snap = await bookRef.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: true, message: 'already deleted' });
    }
    const data = snap.data() || {};

    const storagePath: string = data.storagePath || data.gcsUri || '';
    const isUserUpload = storagePath.includes(`users/${decoded.uid}/uploads/`);
    const isCatalog = data.type !== 'Added Book';

    if (!isUserUpload && !isCatalog) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (isCatalog) {
      // Catalog books should only be removed via the sync console "Reset".
      return NextResponse.json(
        { error: 'catalog books can only be removed via Sync Console Reset' },
        { status: 403 }
      );
    }

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

    // Best-effort GCS cleanup. We don't fail the request if storage is gone.
    if (storagePath.startsWith('gs://')) {
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
    }

    await bookRef.delete();

    return NextResponse.json({ ok: true, deletedPages });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[books/delete]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
