import { NextResponse } from 'next/server';
import { ApiAuthError } from '../auth/guards';
import { getCurrentSession } from '../auth/session';
import { verifyAccessToken } from '../auth/jwt';
import { getUserLicenseByUserId } from '../licenses';

export interface IntegrationApiSession {
  userId: string;
  accessToken: string;
  source: 'agent' | 'web';
}

export class IntegrationApiError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationApiError';
  }
}

export async function requireIntegrationApiSession(request: Request): Promise<IntegrationApiSession> {
  const bearer = readBearerToken(request);
  if (bearer) {
    const verified = await verifyAccessToken(bearer);
    const isLicensed =
      verified.licensed ||
      verified.role === 'admin' ||
      verified.role === 'owner' ||
      !!(await getUserLicenseByUserId(verified.sub));

    if (!isLicensed) {
      throw new IntegrationApiError(403, 'FORBIDDEN', 'Active KDeck license required.');
    }

    return { userId: verified.sub, accessToken: bearer, source: 'agent' };
  }

  const session = await getCurrentSession();
  if (!session) {
    throw new IntegrationApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
  }

  const isLicensed =
    session.user.licensed ||
    session.user.role === 'admin' ||
    session.user.role === 'owner' ||
    !!(await getUserLicenseByUserId(session.user.sub));

  if (!isLicensed) {
    throw new IntegrationApiError(403, 'FORBIDDEN', 'Active KDeck license required.');
  }

  return {
    userId: session.user.sub,
    accessToken: session.accessToken,
    source: 'web',
  };
}

export function integrationApiErrorResponse(err: unknown): NextResponse {
  if (err instanceof IntegrationApiError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }

  if (err instanceof ApiAuthError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }

  return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
}

function readBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}
