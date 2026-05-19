/**
 * Client-side helpers that call Next.js /api/agents/* routes,
 * which in turn proxy to the Cloud Run ADK service (or return
 * simulated payloads when NEXT_PUBLIC_AGENTS_BASE_URL is unset).
 */
export type AgentName = 'orchestrator' | 'ingestion' | 'pedagogy' | 'assessment' | 'av';

export type AgentLogLine = {
  agent: string;
  text: string;
  status?: 'ok' | 'warn' | 'info';
  delay?: number;
};

export type AgentResponse<T = unknown> = {
  ok: boolean;
  source: 'simulated' | 'cloud-run';
  agent: AgentName;
  result?: T;
  log?: AgentLogLine[];
  error?: string;
};

export async function callAgent<T = unknown>(
  name: AgentName,
  payload: Record<string, unknown>
): Promise<AgentResponse<T>> {
  const res = await fetch(`/api/agents/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    return { ok: false, source: 'simulated', agent: name, error: `HTTP ${res.status}` };
  }
  return res.json();
}
