import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase/admin';
import { connectToDatabase } from '@/lib/mongodb';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();
      const statusDoc = await db.collection('ingestion').findOne({ _id: 'status' as any });
      if (!statusDoc) {
        return NextResponse.json({ error: 'Status not found' }, { status: 404 });
      }
      return NextResponse.json(statusDoc);
    } else {
      const { db } = getAdmin();
      const snap = await db.collection('ingestion').doc('status').get();
      if (!snap.exists) {
        return NextResponse.json({ error: 'Status not found' }, { status: 404 });
      }
      return NextResponse.json(snap.data());
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/ingestion/status] Error fetching status:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
