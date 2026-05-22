import { NextResponse } from 'next/server';
import { proxyJobCommand } from '../_lib/proxyJob';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  return proxyJobCommand('analyzer', payload);
}
