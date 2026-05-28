import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const key = process.env.MAPS_API_KEY || '';
  return NextResponse.json({ key });
}
