import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookies } from '@/lib/auth/cookies';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { createUserSupabaseClient } from '@/lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    factorId?: unknown;
    challengeId?: unknown;
    code?: unknown;
    tempAccessToken?: unknown;
    tempRefreshToken?: unknown;
  };

  const factorId = typeof body.factorId === 'string' ? body.factorId : '';
  const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
  const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
  const tempAccessToken = typeof body.tempAccessToken === 'string' ? body.tempAccessToken : '';
  const tempRefreshToken = typeof body.tempRefreshToken === 'string' ? body.tempRefreshToken : '';

  if (!factorId || !challengeId || !code || !tempAccessToken || !tempRefreshToken) {
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const client = createUserSupabaseClient();
  await client.auth.setSession({ access_token: tempAccessToken, refresh_token: tempRefreshToken });

  const { data, error } = await client.auth.mfa.verify({ factorId, challengeId, code });
  if (error || !data?.access_token) {
    return Response.json({ error: 'INVALID_CODE' }, { status: 401 });
  }

  // Re-verify that the now-AAL2 token still belongs to a staff member.
  const claims = await verifyAccessToken(data.access_token);
  if (claims.role !== 'admin' && claims.role !== 'owner') {
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  setSessionCookies(response.cookies, {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  });
  return response;
}
