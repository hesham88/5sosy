import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdmin } from '@/lib/firebase/admin';
import { connectToDatabase } from '@/lib/mongodb';
import { buildBaseUserProfile, isValidUsername, normalizeUsername } from '@/lib/profile';
import { defaultUserSettings } from '@/lib/profile';
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

// Splits an incoming profile write into:
//   - `defaults`: the full base profile, applied ONLY when the doc is first
//     created (insert). It carries onboardingCompleted=false and the grade/xp/
//     streak/etc. seed values.
//   - `updates`: only the fields the caller actually sent, applied on every
//     write. Anything absent from `body` is left untouched on existing docs.
// This separation is critical: callers like the login touch send just
// {lastSeenAt,lastLoginAt}. If base defaults were merged into every write (the
// old behavior), each login reset onboardingCompleted back to false — bouncing
// the user into onboarding forever — and wiped grade/xp/streak/displayName.
function buildProfileWrite(
  body: Record<string, unknown>,
  decoded: { uid: string; email?: string; name?: string; picture?: string; firebase?: unknown }
): {
  defaults: Record<string, unknown>;
  updates: Record<string, unknown>;
  usernameToCheck: string | null;
} {
  const defaults = buildBaseUserProfile({
    uid: decoded.uid,
    email: decoded.email ?? null,
    displayName: decoded.name ?? null,
    photoURL: decoded.picture ?? null,
    isAnonymous: false,
    username: typeof body.username === 'string' ? body.username : undefined,
    role: body.role
  });

  const updates: Record<string, unknown> = { ...body };
  for (const k of ['_id', 'id', 'uid', 'isAnonymous', 'username', 'role', 'settings', 'badges', 'updatedAtServer']) {
    delete updates[k];
  }

  // Server-authoritative identity — safe to refresh on every write, never trust
  // the client for these.
  updates.uid = decoded.uid;
  updates.email = decoded.email ?? (typeof body.email === 'string' ? body.email : null);
  updates.isAnonymous = false;

  let usernameToCheck: string | null = null;
  if (typeof body.username === 'string') {
    const username = normalizeUsername(body.username);
    if (!isValidUsername(username)) {
      throw new Error('Username must be 3-32 characters and use letters, numbers, underscore, or hyphen.');
    }
    updates.username = username;
    usernameToCheck = username;
  }

  if (body.role !== undefined) {
    updates.role = resolveUserRole(decoded.email ?? null, body.role);
  }

  if (body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)) {
    updates.settings = {
      ...defaultUserSettings(),
      ...(body.settings as Record<string, unknown>)
    };
  }

  if (Array.isArray(body.badges)) {
    updates.badges = body.badges;
  }

  return { defaults, updates, usernameToCheck };
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
    const { defaults, updates, usernameToCheck } = buildProfileWrite(body, decoded);

    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();

      if (usernameToCheck) {
        const existingUsername = await db.collection('users').findOne({
          username: usernameToCheck,
          _id: { $ne: decoded.uid } as any
        });
        if (existingUsername) {
          return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
        }
      }

      const set: Record<string, unknown> = { ...updates, updatedAt: new Date().toISOString() };

      // Insert-only defaults must not overlap any $set key, or MongoDB throws a
      // path conflict. Strip everything we're already setting.
      const setOnInsert: Record<string, unknown> = { ...defaults };
      for (const k of Object.keys(set)) delete setOnInsert[k];
      delete setOnInsert._id;

      const update: Record<string, unknown> = { $set: set };
      if (Object.keys(setOnInsert).length > 0) update.$setOnInsert = setOnInsert;

      await db.collection('users').updateOne(
        { _id: decoded.uid as any },
        update,
        { upsert: true }
      );

      return NextResponse.json({ success: true });
    } else {
      // Firestore
      const { db } = getAdmin();
      if (usernameToCheck) {
        const usernameSnap = await db
          .collection('users')
          .where('username', '==', usernameToCheck)
          .limit(2)
          .get();
        const collision = usernameSnap.docs.find((doc) => doc.id !== decoded.uid);
        if (collision) {
          return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
        }
      }

      const ref = db.collection('users').doc(decoded.uid);
      const snap = await ref.get();
      // Seed base defaults only when the doc doesn't exist yet; on an existing
      // doc, write just the explicit fields so a partial update can't reset
      // onboardingCompleted / grade / xp / streak.
      const write: Record<string, unknown> = snap.exists ? { ...updates } : { ...defaults, ...updates };
      delete write.id;
      write.updatedAt = new Date().toISOString();
      write.updatedAtServer = FieldValue.serverTimestamp();
      await ref.set(write, { merge: true });

      return NextResponse.json({ success: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
