import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdmin } from '@/lib/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_STRING = 600;
const MAX_METADATA_KEYS = 24;

async function verify(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.slice('Bearer '.length);
    const { auth } = getAdmin();
    return await auth.verifyIdToken(token);
  } catch (err) {
    console.warn('activity auth failed', err);
    return null;
  }
}

function cleanString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, MAX_STRING);
}

function cleanMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input).slice(0, MAX_METADATA_KEYS)) {
    if (typeof value === 'string') out[key] = value.slice(0, MAX_STRING);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) out[key] = value;
    else if (Array.isArray(value)) out[key] = value.slice(0, 20).map((v) => cleanString(v, String(v)));
    else out[key] = JSON.stringify(value).slice(0, MAX_STRING);
  }
  return out;
}

function isAnonymous(decoded: { firebase?: { sign_in_provider?: string } }) {
  return decoded.firebase?.sign_in_provider === 'anonymous';
}

export async function GET(req: Request) {
  const decoded = await verify(req);
  if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (isAnonymous(decoded)) return NextResponse.json({ items: [] });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 30), 1), 100);
  const { db } = getAdmin();
  const snap = await db
    .collection('users')
    .doc(decoded.uid)
    .collection('activity')
    .orderBy('occurredAt', 'desc')
    .limit(limit)
    .get();

  const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const decoded = await verify(req);
  if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (isAnonymous(decoded)) return NextResponse.json({ success: true, ephemeral: true });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const occurredAtIso = new Date().toISOString();
  const item = {
    actorUid: decoded.uid,
    actorEmail: decoded.email ?? null,
    type: cleanString(body.type, 'system_action'),
    title: cleanString(body.title, 'System action'),
    resourceType: cleanString(body.resourceType),
    resourceId: cleanString(body.resourceId),
    visibility: cleanString(body.visibility, 'private'),
    metadata: cleanMetadata(body.metadata),
    occurredAt: FieldValue.serverTimestamp(),
    occurredAtIso,
    createdAt: FieldValue.serverTimestamp()
  };

  const { db } = getAdmin();
  const userActivityRef = db.collection('users').doc(decoded.uid).collection('activity').doc();
  const auditRef = db.collection('activityLogs').doc(userActivityRef.id);
  const batch = db.batch();
  batch.set(userActivityRef, item);
  batch.set(auditRef, item);
  batch.set(
    db.collection('users').doc(decoded.uid),
    { lastActivityAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await batch.commit();

  return NextResponse.json({ success: true, id: userActivityRef.id });
}

