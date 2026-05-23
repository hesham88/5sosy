import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase/admin';
import { connectToDatabase } from '@/lib/mongodb';

export const runtime = 'nodejs';

async function verifyAuth(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const idToken = authHeader.split('Bearer ')[1];
  if (!idToken) return null;

  try {
    const { auth } = getAdmin();
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (err) {
    console.error('ID token verification failed:', err);
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const uid = await verifyAuth(req);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();
      const userDoc = await db.collection('users').findOne({ _id: uid as any });
      if (!userDoc) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      return NextResponse.json({ ...userDoc, id: uid });
    } else {
      // Default: Firestore
      const { db } = getAdmin();
      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      return NextResponse.json({ ...snap.data(), id: uid });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const uid = await verifyAuth(req);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();
      
      const data = { ...body };
      delete data._id;
      delete data.id;
      data.updatedAt = new Date().toISOString();

      await db.collection('users').updateOne(
        { _id: uid as any },
        { $set: data },
        { upsert: true }
      );
      
      return NextResponse.json({ success: true });
    } else {
      // Firestore
      const { db } = getAdmin();
      const data = { ...body };
      delete data.id;
      
      data.updatedAt = new Date().toISOString();
      await db.collection('users').doc(uid).set(data, { merge: true });
      
      return NextResponse.json({ success: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
