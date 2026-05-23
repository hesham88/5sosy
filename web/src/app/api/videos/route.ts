import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase/admin';
import { connectToDatabase } from '@/lib/mongodb';
import { normalizeSubject } from '@/lib/books';
import type { Video } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();
      const docs = await db.collection('videos').find({}).toArray();
      const videos: Video[] = docs.map((doc: any) => ({
        id: doc._id.toString(),
        title: doc.title || '',
        stage: doc.stage || '',
        grade: doc.grade || '',
        subject: normalizeSubject(doc.subject || ''),
        term: doc.term || '',
        youtubeUrl: doc.youtubeUrl || '',
        sourceUrl: doc.sourceUrl || '',
      }));
      videos.sort((a, b) => a.title.localeCompare(b.title));
      return NextResponse.json(videos);
    } else {
      // Default: Firestore
      const { db } = getAdmin();
      const snapshot = await db.collection('videos').get();
      const videos: Video[] = [];
      snapshot.forEach((d) => {
        try {
          const data = d.data();
          videos.push({
            id: d.id,
            title: data.title || '',
            stage: data.stage || '',
            grade: data.grade || '',
            subject: normalizeSubject(data.subject || ''),
            term: data.term || '',
            youtubeUrl: data.youtubeUrl || '',
            sourceUrl: data.sourceUrl || '',
          });
        } catch (err) {
          console.warn('[api/videos] skipped malformed doc', d.id, err);
        }
      });
      videos.sort((a, b) => a.title.localeCompare(b.title));
      return NextResponse.json(videos);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/videos] Error fetching videos:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
