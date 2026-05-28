import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdmin } from '@/lib/firebase/admin';
import { connectToDatabase } from '@/lib/mongodb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verify(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const { auth } = getAdmin();
    return await auth.verifyIdToken(authHeader.slice('Bearer '.length));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const decoded = await verify(req);
  if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const token = String(body.token ?? '').trim();
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();
  let request: {
    childUid: string;
    parentEmail: string;
    status: string;
    expiresAtIso?: string;
    expiresAt?: Timestamp;
  } | null = null;

  if (provider === 'mongodb') {
    const { db: mDb } = await connectToDatabase();
    const reqDoc = await mDb.collection('parentConsentRequests').findOne({ _id: token as any });
    if (reqDoc) {
      request = {
        childUid: reqDoc.childUid,
        parentEmail: reqDoc.parentEmail,
        status: reqDoc.status,
        expiresAtIso: reqDoc.expiresAt
      };
    }
  } else {
    const { db: fDb } = getAdmin();
    const requestSnap = await fDb.collection('parentConsentRequests').doc(token).get();
    if (requestSnap.exists) {
      const data = requestSnap.data() as any;
      request = {
        childUid: data.childUid,
        parentEmail: data.parentEmail,
        status: data.status,
        expiresAt: data.expiresAt
      };
    }
  }

  if (!request) return NextResponse.json({ error: 'Consent request not found' }, { status: 404 });

  if (request.status !== 'pending') {
    return NextResponse.json({ error: `Request is already ${request.status}` }, { status: 409 });
  }

  const isExpired = request.expiresAtIso
    ? new Date(request.expiresAtIso).getTime() < Date.now()
    : request.expiresAt
      ? request.expiresAt.toMillis() < Date.now()
      : false;

  if (isExpired) {
    return NextResponse.json({ error: 'Consent link expired' }, { status: 410 });
  }

  const nowIso = new Date().toISOString();

  if (provider === 'mongodb') {
    const { db: mDb } = await connectToDatabase();

    // 1. Update request status
    await mDb.collection('parentConsentRequests').updateOne(
      { _id: token as any },
      {
        $set: {
          status: 'approved',
          parentUid: decoded.uid,
          approvedAt: nowIso,
          updatedAt: nowIso
        }
      }
    );

    // 2. Update child
    await mDb.collection('users').updateOne(
      { _id: request.childUid as any },
      {
        $set: {
          'parentConsent.status': 'approved',
          'parentConsent.parentEmail': request.parentEmail,
          'parentConsent.parentUid': decoded.uid,
          'parentConsent.approvedAt': nowIso
        },
        $addToSet: {
          'relationships.parents': decoded.uid
        } as any
      }
    );

    // 3. Update parent
    await mDb.collection('users').updateOne(
      { _id: decoded.uid as any },
      {
        $set: {
          role: 'parent',
          updatedAt: nowIso
        },
        $addToSet: {
          'relationships.children': request.childUid
        } as any
      }
    );

    // 4. Create relationship mapping
    const relDoc = {
      _id: `${decoded.uid}_${request.childUid}`,
      id: `${decoded.uid}_${request.childUid}`,
      type: 'parent_child',
      parentUid: decoded.uid,
      childUid: request.childUid,
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso
    };
    await mDb.collection('relationships').updateOne(
      { _id: relDoc._id as any },
      { $set: relDoc },
      { upsert: true }
    );

    // Write audit activity logs to Firestore
    const { db: fDb } = getAdmin();
    await fDb.collection('users').doc(decoded.uid).collection('activity').add({
      actorUid: decoded.uid,
      type: 'consent_approval',
      title: 'Approved child account',
      resourceType: 'parentConsent',
      resourceId: token,
      visibility: 'private',
      metadata: { childUid: request.childUid },
      occurredAt: FieldValue.serverTimestamp(),
      occurredAtIso: nowIso
    });

    await fDb.collection('users').doc(request.childUid).collection('activity').add({
      actorUid: request.childUid,
      type: 'consent_approval',
      title: 'Parent approved account',
      resourceType: 'parentConsent',
      resourceId: token,
      visibility: 'private',
      metadata: { parentUid: decoded.uid },
      occurredAt: FieldValue.serverTimestamp(),
      occurredAtIso: nowIso
    });

  } else {
    const { db: fDb } = getAdmin();
    const requestRef = fDb.collection('parentConsentRequests').doc(token);
    const parentRef = fDb.collection('users').doc(decoded.uid);
    const childRef = fDb.collection('users').doc(request.childUid);
    const relationshipRef = fDb.collection('relationships').doc(`${decoded.uid}_${request.childUid}`);

    const batch = fDb.batch();
    batch.set(requestRef, {
      status: 'approved',
      parentUid: decoded.uid,
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    batch.set(childRef, {
      parentConsent: {
        status: 'approved',
        parentEmail: request.parentEmail,
        parentUid: decoded.uid,
        approvedAt: FieldValue.serverTimestamp()
      },
      relationships: {
        parents: FieldValue.arrayUnion(decoded.uid)
      }
    }, { merge: true });
    batch.set(parentRef, {
      role: 'parent',
      relationships: {
        children: FieldValue.arrayUnion(request.childUid)
      },
      updatedAtServer: FieldValue.serverTimestamp()
    }, { merge: true });
    batch.set(relationshipRef, {
      id: relationshipRef.id,
      type: 'parent_child',
      parentUid: decoded.uid,
      childUid: request.childUid,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    batch.set(parentRef.collection('activity').doc(), {
      actorUid: decoded.uid,
      type: 'consent_approval',
      title: 'Approved child account',
      resourceType: 'parentConsent',
      resourceId: token,
      visibility: 'private',
      metadata: { childUid: request.childUid },
      occurredAt: FieldValue.serverTimestamp(),
      occurredAtIso: nowIso
    });
    batch.set(childRef.collection('activity').doc(), {
      actorUid: request.childUid,
      type: 'consent_approval',
      title: 'Parent approved account',
      resourceType: 'parentConsent',
      resourceId: token,
      visibility: 'private',
      metadata: { parentUid: decoded.uid },
      occurredAt: FieldValue.serverTimestamp(),
      occurredAtIso: nowIso
    });
    await batch.commit();
  }

  return NextResponse.json({ success: true });
}

