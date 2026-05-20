import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));
    // Auto-detect backend service url
    let base = process.env.AGENTS_BASE_URL || process.env.NEXT_PUBLIC_AGENTS_BASE_URL || 'http://localhost:8080';
    
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 200);
      const isLocal8080 = await fetch('http://localhost:8080/health', { signal: controller.signal })
        .then(r => r.ok)
        .catch(() => false);
      clearTimeout(id);
      
      if (isLocal8080) {
        base = 'http://localhost:8080';
      } else {
        const controller2 = new AbortController();
        const id2 = setTimeout(() => controller2.abort(), 200);
        const isLocal8081 = await fetch('http://localhost:8081/health', { signal: controller2.signal })
          .then(r => r.ok)
          .catch(() => false);
        clearTimeout(id2);
        if (isLocal8081) {
          base = 'http://localhost:8081';
        }
      }
    } catch (e) {
      // Ignore detection error, use default base
    }

    console.log(`[Ingestion API] Routing request to backend: ${base}`);

    const apiKey = process.env.AGENTS_API_KEY;

    if (base) {
      const url = `${base.replace(/\/$/, '')}/v1/ingestion/sync`;
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
      return NextResponse.json({
        ok: true,
        source: base.includes('localhost') || base.includes('127.0.0.1') ? 'local' : 'cloud-run',
        ...data
      });
    }

    return NextResponse.json({ ok: false, error: 'No backend service base URL found.' });
  } catch (error: any) {
    console.error('[ingestion API]', error);
    return NextResponse.json({ ok: false, error: error.message });
  }
}
