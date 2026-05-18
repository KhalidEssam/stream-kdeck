import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookies } from '@/lib/auth/cookies';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { getSupabaseAuth } from '@/lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: unknown; password?: unknown };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!isValidEmail(email) || !password) {
    return Response.json({ error: 'INVALID_CREDENTIALS' }, { status: 400 });
  }

  const { data, error } = await getSupabaseAuth().auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return Response.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
  }

  const claims = await verifyAccessToken(data.session.access_token);
  if (claims.role !== 'admin' && claims.role !== 'owner') {
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  setSessionCookies(response.cookies, data.session);
  return response;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
