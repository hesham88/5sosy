import { NextResponse } from 'next/server';

type JobKind = 'harvester' | 'analyzer' | 'migration';

/**
 * Proxy a job-command POST to the khsosybot service.
 *
 * Tries local backends first (port 8080 then 8081) so the same web app works
 * against a running `python server.py` during dev, and falls back to
 * AGENTS_BASE_URL (Cloud Run) in production. Mirrors the existing
 * /api/agents/ingestion/route.ts shape so both clients behave identically.
 */
export async function proxyJobCommand(kind: JobKind, payload: unknown) {
  let base = process.env.AGENTS_BASE_URL || process.env.NEXT_PUBLIC_AGENTS_BASE_URL || '';

  // Local-first detection (200ms probe per port)
  for (const port of [8080, 8081]) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 200);
      const ok = await fetch(`http://localhost:${port}/health`, { signal: controller.signal })
        .then((r) => r.ok)
        .catch(() => false);
      clearTimeout(id);
      if (ok) {
        base = `http://localhost:${port}`;
        break;
      }
    } catch {
      /* ignore */
    }
  }

  if (!base) {
    return NextResponse.json(
      { ok: false, error: 'No backend service base URL found.' },
      { status: 500 },
    );
  }

  const url = `${base.replace(/\/$/, '')}/v1/ingestion/${kind}`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const apiKey = process.env.AGENTS_API_KEY;
  if (apiKey) headers['X-API-Key'] = apiKey;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: data?.detail || `Upstream ${res.status}`, ...data },
        { status: res.status },
      );
    }
    return NextResponse.json({ ok: true, source: base.includes('localhost') ? 'local' : 'cloud-run', kind, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message, kind }, { status: 502 });
  }
}
