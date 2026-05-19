import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export type AgentName = 'orchestrator' | 'ingestion' | 'pedagogy' | 'assessment' | 'av';

type SimResponse = {
  ok: true;
  source: 'simulated' | 'cloud-run';
  agent: AgentName;
  result: Record<string, unknown>;
  log: { agent: string; text: string; status?: 'ok' | 'warn' | 'info' }[];
};

const SIM: Record<AgentName, (payload: Record<string, unknown>) => SimResponse['result']> = {
  orchestrator: (p) => ({
    intent: p.intent ?? 'Physics exam in 48h',
    parsed: { subject: 'physics', topic: 'gas_laws', urgencyHours: 48, intensity: 'high' },
    plan: ['review:boyle:25m', 'quiz:gas_laws:15m', 'lesson:thermo:20m', 'oral:thermo:20m']
  }),
  ingestion: (p) => ({
    sources: p.sources ?? ['MOE/physics-g12-2025.pdf'],
    chapters: 18, theorems: 42, examples: 318, embeddings: 4206
  }),
  pedagogy: () => ({
    weakConcepts: [
      { id: 'pv-nrt', confidence: 0.28, prereqs: ['boyle', 'kelvin'] },
      { id: 'titration', confidence: 0.45, prereqs: ['acid-base'] }
    ],
    misconceptions: [{ pattern: 'divide-before-rearrange', subject: 'physics' }]
  }),
  assessment: (p) => ({
    score: 0.67, time: 222,
    breakdown: [
      { qid: 1, correct: true,  confidence: 0.8 },
      { qid: 2, correct: true,  confidence: 0.65 },
      { qid: 3, correct: false, confidence: 0.4, note: 'steps 2 and 3 swapped' }
    ],
    answers: p.answers ?? {}
  }),
  av: (p) => ({
    artifact: 'audio/ch4-boyle.mp3',
    voice: p.voice ?? 'eg-ar-female-warm',
    durationSec: 138,
    transcript: 'تخيّل عربية ملياااانة ركاب...'
  })
};

function simLog(agent: AgentName): SimResponse['log'] {
  const lab = agent[0].toUpperCase() + agent.slice(1) + 'Agent';
  return [
    { agent: lab, text: `Received request. Routing to ${agent} pipeline…`, status: 'info' },
    { agent: lab, text: 'Loading state from Vertex AI Vector Search…' },
    { agent: lab, text: 'Compiled response. Returning to client.', status: 'ok' }
  ];
}

export async function handleAgent(name: AgentName, req: NextRequest) {
  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const base = process.env.NEXT_PUBLIC_AGENTS_BASE_URL;
  const token = process.env.AGENTS_SERVICE_TOKEN;

  if (base) {
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/agents/${name}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Upstream ${res.status}`);
      const data = await res.json();
      return NextResponse.json({ ok: true, source: 'cloud-run', agent: name, ...data });
    } catch (e) {
      console.warn('[agents]', name, 'upstream failed, falling back to sim:', (e as Error).message);
    }
  }

  return NextResponse.json<SimResponse>({
    ok: true,
    source: 'simulated',
    agent: name,
    result: SIM[name](payload),
    log: simLog(name)
  });
}
