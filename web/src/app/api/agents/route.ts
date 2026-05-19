import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    agents: ['orchestrator', 'ingestion', 'pedagogy', 'assessment', 'av'],
    upstream: process.env.NEXT_PUBLIC_AGENTS_BASE_URL || null,
    mode: process.env.NEXT_PUBLIC_AGENTS_BASE_URL ? 'cloud-run' : 'simulated',
    note: 'POST to /api/agents/<name> with a JSON body to invoke.'
  });
}
