import { EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookies } from '@/lib/auth/cookies';
import { getSupabaseAuth } from '@/lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL('/login?error=missing_token', request.url));
  }

  const { data, error } = await getSupabaseAuth().auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error || !data.session) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
  }

  const response = NextResponse.redirect(new URL('/dashboard', request.url));
  setSessionCookies(response.cookies, data.session);
  return response;
}
