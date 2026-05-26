import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase/admin';
import { connectToDatabase } from '@/lib/mongodb';

export const runtime = 'nodejs';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf'];

// Accepts a user problem-report (multipart/form-data). Optional attachment is
// uploaded to Firebase Storage via the Admin SDK; the report record is written
// to the `feedback_reports` collection (MongoDB in prod, Firestore otherwise).
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const str = (k: string) => (form.get(k) ?? '').toString().trim();

    const subject = str('subject');
    const description = str('description');
    if (!subject || !description) {
      return NextResponse.json({ error: 'subject and description are required' }, { status: 400 });
    }

    const report: Record<string, unknown> = {
      name: str('name').slice(0, 200),
      email: str('email').slice(0, 200),
      subject: subject.slice(0, 300),
      description: description.slice(0, 5000),
      reproduce: str('reproduce').slice(0, 5000),
      locale: str('locale').slice(0, 8),
      sessionId: str('sessionId').slice(0, 100),
      status: 'new',
      createdAt: new Date().toISOString(),
      attachment: null as null | Record<string, unknown>,
    };

    const file = form.get('file');
    if (file && file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: 'file too large (max 2MB)' }, { status: 413 });
      }
      if (file.type && !ALLOWED.includes(file.type)) {
        return NextResponse.json({ error: 'unsupported file type' }, { status: 415 });
      }
      const { app } = getAdmin();
      const { getStorage } = await import('firebase-admin/storage');
      const bucketName =
        process.env.GCS_BUCKET ||
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        'khsosy.firebasestorage.app';
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'attachment';
      const objectPath = `feedback/${id}/${safeName}`;
      const buf = Buffer.from(await file.arrayBuffer());
      await getStorage(app)
        .bucket(bucketName)
        .file(objectPath)
        .save(buf, { contentType: file.type || 'application/octet-stream', resumable: false });
      report.attachment = {
        path: `gs://${bucketName}/${objectPath}`,
        name: file.name,
        size: file.size,
        contentType: file.type || '',
      };
    }

    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();
    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();
      const res = await db.collection('feedback_reports').insertOne(report);
      return NextResponse.json({ ok: true, id: res.insertedId.toString() });
    } else {
      const { db } = getAdmin();
      const ref = await db.collection('feedback_reports').add(report);
      return NextResponse.json({ ok: true, id: ref.id });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[api/feedback]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
