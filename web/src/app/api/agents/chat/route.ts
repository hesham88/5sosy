import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIM_BASE = 'data: {"index":0,"agent":"orchestrator","step_type":"text","output":"Cloud Run isn\'t wired yet — set AGENTS_BASE_URL + AGENTS_API_KEY in env.","final":true,"duration_ms":0}';

function sim(message: string, locale: string): Response {
  const sessionId = crypto.randomUUID().replace(/-/g, '');
  const startedAt = new Date().toISOString();
  const finalText =
    locale === 'ar'
      ? 'الـkhsosybot لسه ما اتربطش بالـ Cloud Run. ضبط AGENTS_BASE_URL و AGENTS_API_KEY في الـ env.'
      : "khsosybot isn't wired to Cloud Run yet — set AGENTS_BASE_URL and AGENTS_API_KEY in env.";
  const trace = [
    {
      index: 0,
      agent: 'orchestrator',
      step_type: 'text',
      output: finalText,
      final: true,
      duration_ms: 0
    }
  ];
  const final = {
    session_id: sessionId,
    username: 'guest',
    locale,
    intent: 'chit_chat',
    final_response: finalText,
    trace,
    started_at: startedAt,
    finished_at: startedAt,
    duration_ms: 0,
    source: 'simulated'
  };
  const body =
    `event: start\ndata: ${JSON.stringify({ session_id: sessionId, started_at: startedAt, source: 'simulated' })}\n\n` +
    `event: step\ndata: ${JSON.stringify(trace[0])}\n\n` +
    `event: final\ndata: ${JSON.stringify(final)}\n\n`;
  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no'
    }
  });
}

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const message = String(payload.message ?? '');
  const locale = String(payload.locale ?? 'en');

  const base = process.env.AGENTS_BASE_URL?.replace(/\/$/, '');
  const apiKey = process.env.AGENTS_API_KEY;

  if (!base || !apiKey) {
    return sim(message, locale);
  }

  const upstream = await fetch(`${base}/v1/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify(payload)
  }).catch((e) => {
    console.warn('[5sosybot] upstream fetch failed:', (e as Error).message);
    return null;
  });

  if (!upstream || !upstream.ok || !upstream.body) {
    return sim(message, locale);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no'
    }
  });
}
