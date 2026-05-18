import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookies } from '@/lib/auth/cookies';
import { verifyAccessToken } from '@/lib/auth/jwt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      access_token?: unknown;
      refresh_token?: unknown;
      expires_in?: unknown;
    };

    const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : '';
    const expiresIn =
      typeof body.expires_in === 'number'
        ? body.expires_in
        : typeof body.expires_in === 'string'
          ? Number.parseInt(body.expires_in, 10)
          : undefined;

    if (!accessToken || !refreshToken) {
      return Response.json({ error: 'MISSING_SESSION_TOKENS' }, { status: 400 });
    }

    await verifyAccessToken(accessToken);

    const response = NextResponse.json({ ok: true });
    setSessionCookies(response.cookies, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Number.isFinite(expiresIn) ? expiresIn : undefined,
    });
    return response;
  } catch (err) {
    console.error('[web] Session callback failed', err);
    return Response.json({ error: 'INVALID_SESSION' }, { status: 401 });
  }
}
