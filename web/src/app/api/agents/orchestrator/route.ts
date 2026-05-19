import { handleAgent } from '../_lib';
export const runtime = 'nodejs';
export async function POST(req: Request) { return handleAgent('orchestrator', req as unknown as import('next/server').NextRequest); }
