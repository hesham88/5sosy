import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { connectToDatabase } from '@/lib/mongodb';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));
    const { bookId, title, gcsUri, stage, grade, term, subject, type, language, year } = payload;
    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();

    // 1. Create the temporary 'processing' book doc in the ACTIVE store so the
    //    upload shows immediately and the service indexes into the same place.
    const meta = {
      subject: subject || 'physics',
      title: title || 'Untitled Book',
      stage: stage || 'Secondary',
      grade: grade || 'G10',
      term: term || 'Term 1',
      type: type || 'Added Book',
      language: language || 'ar',
      year: year || 2026,
      status: 'processing' as const,
      pages: 0,
      chapters: 0,
    };
    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();
      await db.collection('books').updateOne(
        { _id: bookId as any },
        { $set: { ...meta, gcsUri: gcsUri || '' }, $setOnInsert: { createdAt: new Date().toISOString() } },
        { upsert: true }
      );
    } else {
      const { db } = getAdmin();
      await db.collection('books').doc(bookId).set({
        id: bookId,
        ...meta,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    // 2. Call python service to start parsing
    let base = process.env.AGENTS_BASE_URL || process.env.NEXT_PUBLIC_AGENTS_BASE_URL || 'http://localhost:8080';
    
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 200);
      const isLocal8080 = await fetch('http://localhost:8080/health', { signal: controller.signal })
        .then(r => r.ok)
        .catch(() => false);
      clearTimeout(id);
      
      if (isLocal8080) {
        base = 'http://localhost:8080';
      } else {
        const controller2 = new AbortController();
        const id2 = setTimeout(() => controller2.abort(), 200);
        const isLocal8081 = await fetch('http://localhost:8081/health', { signal: controller2.signal })
          .then(r => r.ok)
          .catch(() => false);
        clearTimeout(id2);
        if (isLocal8081) {
          base = 'http://localhost:8081';
        }
      }
    } catch (e) {
      // Ignore
    }

    console.log(`[Parse Added API] Routing request to backend: ${base}`);

    const apiKey = process.env.AGENTS_API_KEY;

    const url = `${base.replace(/\/$/, '')}/v1/ingestion/parse-book`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Upstream returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[books parse-added API]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
