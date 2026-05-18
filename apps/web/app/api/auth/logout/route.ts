import { NextResponse } from 'next/server';
import { clearSessionCookies } from '@/lib/auth/cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response.cookies);
  return response;
}
