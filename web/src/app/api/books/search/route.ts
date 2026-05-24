import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));
    const base = process.env.AGENTS_BASE_URL || process.env.NEXT_PUBLIC_AGENTS_BASE_URL || 'http://localhost:8080';
    const apiKey = process.env.AGENTS_API_KEY;

    const url = `${base.replace(/\/$/, '')}/v1/books/search`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Upstream returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[books search API]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
