import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Proxy the session-scoped translator to the khsosybot service /v1/translate.
// Never persists — the client caches the result for the reading session only.
export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));
    const base = process.env.AGENTS_BASE_URL || process.env.NEXT_PUBLIC_AGENTS_BASE_URL || 'http://localhost:8080';
    const apiKey = process.env.AGENTS_API_KEY;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let res: Response;
    try {
      res = await fetch(`${base.replace(/\/$/, '')}/v1/translate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (error: any) {
    const aborted = error?.name === 'AbortError';
    console.error('[books translate API]', error);
    return NextResponse.json(
      { status: 'error', error: aborted ? 'Translation timed out' : error.message, translated: '' },
      { status: aborted ? 504 : 500 }
    );
  }
}
