import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase/admin';
import { connectToDatabase } from '@/lib/mongodb';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();

    // Empty-state default so the BooksScreen poller doesn't spam 404s when
    // the ingestion control doc hasn't been seeded yet. Client tells "never
    // started" from "stopped" via status === 'idle'.
    const empty = {
      status: 'idle',
      totalBooks: 0,
      downloadedBooks: 0,
      parsedBooks: 0,
      percentage: 0,
      progressMessage: '',
      logs: [],
    };

    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();
      const statusDoc = await db.collection('ingestion').findOne({ _id: 'status' as any });
      return NextResponse.json(statusDoc ?? empty);
    } else {
      const { db } = getAdmin();
      const snap = await db.collection('ingestion').doc('status').get();
      return NextResponse.json(snap.exists ? snap.data() : empty);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/ingestion/status] Error fetching status:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
