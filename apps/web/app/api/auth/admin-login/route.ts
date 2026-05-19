import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookies } from '@/lib/auth/cookies';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { createUserSupabaseClient } from '@/lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: unknown; password?: unknown };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!isValidEmail(email) || !password) {
    return Response.json({ error: 'INVALID_CREDENTIALS' }, { status: 400 });
  }

  const anonClient = createUserSupabaseClient();
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return Response.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
  }

  const claims = await verifyAccessToken(data.session.access_token);
  if (claims.role !== 'admin' && claims.role !== 'owner') {
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // Check if TOTP MFA is enrolled — if so, require a second factor before granting cookies.
  const { data: factorsData } = await anonClient.auth.mfa.listFactors();
  const totpFactor = factorsData?.totp?.find((f) => f.status === 'verified');

  if (totpFactor) {
    const { data: challengeData, error: challengeError } = await anonClient.auth.mfa.challenge({
      factorId: totpFactor.id,
    });
    if (challengeError || !challengeData) {
      return Response.json({ error: 'MFA_CHALLENGE_FAILED' }, { status: 500 });
    }
    return Response.json({
      mfaRequired: true,
      factorId: totpFactor.id,
      challengeId: challengeData.id,
      // AAL1 tokens — used only by the MFA verify step, never stored as cookies.
      tempAccessToken: data.session.access_token,
      tempRefreshToken: data.session.refresh_token,
    });
  }

  // No MFA enrolled — grant session with a warning flag so the UI can prompt enrollment.
  const response = NextResponse.json({ ok: true, mfaWarning: true });
  setSessionCookies(response.cookies, data.session);
  return response;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
