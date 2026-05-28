import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdmin } from '@/lib/firebase/admin';
import { MIN_PARENT_CONSENT_AGE, isUnderParentConsentAge } from '@/lib/roles';
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
  const parentEmail = String(body.parentEmail ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    return NextResponse.json({ error: 'Valid parent email is required' }, { status: 400 });
  }

  const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();
  let child: any = null;

  if (provider === 'mongodb') {
    const { db: mDb } = await connectToDatabase();
    child = await mDb.collection('users').findOne({ _id: decoded.uid as any });
  } else {
    const { db: fDb } = getAdmin();
    const childSnap = await fDb.collection('users').doc(decoded.uid).get();
    if (childSnap.exists) {
      child = childSnap.data();
    }
  }

  if (!child) return NextResponse.json({ error: 'Child profile not found' }, { status: 404 });

  if (!isUnderParentConsentAge(child.age)) {
    return NextResponse.json({
      error: `Parent consent is only required below age ${MIN_PARENT_CONSENT_AGE}`
    }, { status: 400 });
  }

  const token = crypto.randomUUID().replace(/-/g, '');
  const origin = new URL(req.url).origin;
  const approvePath = `/${child.locale || 'ar'}/parent-consent/${token}`;
  const approveUrl = `${origin}${approvePath}`;

  if (provider === 'mongodb') {
    const { db: mDb } = await connectToDatabase();
    const requestDoc = {
      _id: token,
      token,
      childUid: decoded.uid,
      childEmail: decoded.email ?? child.email ?? null,
      childName: child.preferredName ?? child.displayName ?? '5sosy learner',
      parentEmail,
      status: 'pending',
      approveUrl,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await mDb.collection('parentConsentRequests').insertOne(requestDoc as any);
    await mDb.collection('users').updateOne(
      { _id: decoded.uid as any },
      {
        $set: {
          parentConsent: {
            status: 'pending',
            parentEmail,
            requestedAt: new Date().toISOString()
          }
        }
      }
    );

    // Trigger Email: write to Firestore mail collection for the firebase extension
    const { db: fDb } = getAdmin();
    await fDb.collection('mail').add({
      to: parentEmail,
      message: {
        subject: 'Approve your child on 5sosy',
        text: `Please approve ${requestDoc.childName}'s 5sosy account: ${approveUrl}`,
        html: `<p>Please approve ${requestDoc.childName}'s 5sosy account.</p><p><a href="${approveUrl}">Approve in 5sosy</a></p>`
      },
      createdAt: FieldValue.serverTimestamp()
    });

    // Activity log: write to child activity subcollection in Firestore
    await fDb.collection('users').doc(decoded.uid).collection('activity').add({
      actorUid: decoded.uid,
      type: 'consent_request',
      title: 'Parent consent requested',
      resourceType: 'parentConsent',
      resourceId: token,
      visibility: 'private',
      metadata: { parentEmail },
      occurredAt: FieldValue.serverTimestamp(),
      occurredAtIso: new Date().toISOString()
    });

  } else {
    const { db: fDb } = getAdmin();
    const childRef = fDb.collection('users').doc(decoded.uid);
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

    const requestDoc = {
      token,
      childUid: decoded.uid,
      childEmail: decoded.email ?? child.email ?? null,
      childName: child.preferredName ?? child.displayName ?? '5sosy learner',
      parentEmail,
      status: 'pending',
      approveUrl,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const batch = fDb.batch();
    batch.set(fDb.collection('parentConsentRequests').doc(token), requestDoc);
    batch.set(childRef, {
      parentConsent: {
        status: 'pending',
        parentEmail,
        requestedAt: FieldValue.serverTimestamp()
      }
    }, { merge: true });
    batch.set(fDb.collection('mail').doc(), {
      to: parentEmail,
      message: {
        subject: 'Approve your child on 5sosy',
        text: `Please approve ${requestDoc.childName}'s 5sosy account: ${approveUrl}`,
        html: `<p>Please approve ${requestDoc.childName}'s 5sosy account.</p><p><a href="${approveUrl}">Approve in 5sosy</a></p>`
      },
      createdAt: FieldValue.serverTimestamp()
    });
    batch.set(childRef.collection('activity').doc(), {
      actorUid: decoded.uid,
      type: 'consent_request',
      title: 'Parent consent requested',
      resourceType: 'parentConsent',
      resourceId: token,
      visibility: 'private',
      metadata: { parentEmail },
      occurredAt: FieldValue.serverTimestamp(),
      occurredAtIso: new Date().toISOString()
    });
    await batch.commit();
  }

  return NextResponse.json({ success: true, token, approveUrl, approvePath });
}

