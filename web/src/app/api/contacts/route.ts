import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { name, email, message } = await req.json().catch(() => ({}));

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    await db.collection('contactus').insertOne({
      name: name.trim(),
      email: email.trim(),
      message: message.trim(),
      createdAt: new Date()
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Contact form submission error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
