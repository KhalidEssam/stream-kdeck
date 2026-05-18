import { createRemoteJWKSet, decodeProtectedHeader, errors, jwtVerify, JWTPayload } from 'jose';
import { getEnv } from '../env';

export type StaffRole = 'admin' | 'owner';

export interface VerifiedAccessToken {
  sub: string;
  email: string | null;
  role: StaffRole | null;
  licensed: boolean;
  aiPro: boolean;
  creditsRemaining: number;
  exp: number | null;
}

export class AccessTokenExpiredError extends Error {
  constructor() {
    super('Access token expired.');
    this.name = 'AccessTokenExpiredError';
  }
}

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
  try {
    const { payload } = await verifySupabaseJwt(token);
    return mapJwtPayload(payload);
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      throw new AccessTokenExpiredError();
    }
    throw err;
  }
}

async function verifySupabaseJwt(token: string): Promise<{ payload: JWTPayload }> {
  const header = decodeProtectedHeader(token);

  if (header.alg === 'HS256') {
    const secret = new TextEncoder().encode(getEnv('SUPABASE_JWT_SECRET'));
    return jwtVerify(token, secret, { algorithms: ['HS256'] });
  }

  if (header.alg === 'ES256' || header.alg === 'RS256') {
    return jwtVerify(token, getSupabaseJwks(), { algorithms: ['ES256', 'RS256'] });
  }

  throw new Error(`Unsupported Supabase JWT algorithm: ${header.alg ?? 'unknown'}`);
}

function getSupabaseJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(
      new URL('/auth/v1/.well-known/jwks.json', getEnv('SUPABASE_URL')),
    );
  }

  return remoteJwks;
}

function mapJwtPayload(payload: JWTPayload): VerifiedAccessToken {
  const role = readRole(payload);
  const credits = Number(payload.credits_remaining);

  return {
    sub: assertSubject(payload.sub),
    email: typeof payload.email === 'string' ? payload.email : null,
    role,
    licensed: payload.licensed === true,
    aiPro: payload.ai_pro === true,
    creditsRemaining: Number.isFinite(credits) ? credits : 0,
    exp: typeof payload.exp === 'number' ? payload.exp : null,
  };
}

function readRole(payload: JWTPayload): StaffRole | null {
  const staffRole = payload.staff_role;
  if (staffRole === 'admin' || staffRole === 'owner') {
    return staffRole;
  }

  const appMetadata = payload.app_metadata;
  if (isRecord(appMetadata)) {
    const role = appMetadata.role;
    if (role === 'admin' || role === 'owner') {
      return role;
    }
  }

  return null;
}

function assertSubject(sub: string | undefined): string {
  if (!sub) {
    throw new Error('Supabase access token is missing a subject.');
  }
  return sub;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
