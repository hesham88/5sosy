import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdmin } from '@/lib/firebase/admin';
import { connectToDatabase } from '@/lib/mongodb';
import { buildBaseUserProfile, isValidUsername, normalizeUsername } from '@/lib/profile';
import { defaultBadges, defaultUserSettings } from '@/lib/profile';
import { resolveUserRole } from '@/lib/roles';

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
    return decodedToken;
  } catch (err) {
    console.error('ID token verification failed:', err);
    return null;
  }
}

function isAnonymous(decoded: { firebase?: { sign_in_provider?: string } }) {
  return decoded.firebase?.sign_in_provider === 'anonymous';
}

function cleanProfileBody(
  body: Record<string, unknown>,
  decoded: { uid: string; email?: string; name?: string; picture?: string; firebase?: unknown }
) {
  const base = buildBaseUserProfile({
    uid: decoded.uid,
    email: decoded.email ?? null,
    displayName: decoded.name ?? null,
    photoURL: decoded.picture ?? null,
    isAnonymous: false,
    username: typeof body.username === 'string' ? body.username : undefined,
    role: body.role
  });
  const username = normalizeUsername(body.username ?? base.username);
  if (!isValidUsername(username)) {
    throw new Error('Username must be 3-32 characters and use letters, numbers, underscore, or hyphen.');
  }
  const role = resolveUserRole(decoded.email ?? null, body.role);
  const settingsFromBody =
    body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)
      ? (body.settings as Record<string, unknown>)
      : {};

  return {
    ...base,
    ...body,
    uid: decoded.uid,
    email: decoded.email ?? (typeof body.email === 'string' ? body.email : null),
    isAnonymous: false,
    username,
    role,
    settings: {
      ...defaultUserSettings(),
      ...settingsFromBody
    },
    badges: Array.isArray(body.badges) ? body.badges : defaultBadges(role)
  };
}

export async function GET(req: Request) {
  try {
    const decoded = await verifyAuth(req);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (isAnonymous(decoded)) {
      return NextResponse.json({ error: 'Guests do not have persistent profiles' }, { status: 404 });
    }

    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();
      const userDoc = await db.collection('users').findOne({ _id: decoded.uid as any });
      if (!userDoc) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      return NextResponse.json({ ...userDoc, id: decoded.uid });
    } else {
      // Default: Firestore
      const { db } = getAdmin();
      const snap = await db.collection('users').doc(decoded.uid).get();
      if (!snap.exists) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      return NextResponse.json({ ...snap.data(), id: decoded.uid });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const decoded = await verifyAuth(req);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (isAnonymous(decoded)) {
      return NextResponse.json({ error: 'Guests do not have persistent profiles' }, { status: 403 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();
    const data: Record<string, unknown> = cleanProfileBody(body, decoded);

    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();

      const existingUsername = await db.collection('users').findOne({
        username: data.username,
        _id: { $ne: decoded.uid } as any
      });
      if (existingUsername) {
        return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
      }

      delete data._id;
      delete data.id;
      data.updatedAt = new Date().toISOString();

      await db.collection('users').updateOne(
        { _id: decoded.uid as any },
        { $set: data },
        { upsert: true }
      );
      
      return NextResponse.json({ success: true });
    } else {
      // Firestore
      const { db } = getAdmin();
      const usernameSnap = await db
        .collection('users')
        .where('username', '==', data.username)
        .limit(2)
        .get();
      const collision = usernameSnap.docs.find((doc) => doc.id !== decoded.uid);
      if (collision) {
        return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
      }

      delete data.id;
      
      data.updatedAt = new Date().toISOString();
      data.updatedAtServer = FieldValue.serverTimestamp();
      await db.collection('users').doc(decoded.uid).set(data, { merge: true });
      
      return NextResponse.json({ success: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
