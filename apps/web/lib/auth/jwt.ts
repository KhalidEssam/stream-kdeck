import { errors, jwtVerify, JWTPayload } from 'jose';
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

export async function verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
  try {
    const secret = new TextEncoder().encode(getEnv('SUPABASE_JWT_SECRET'));
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return mapJwtPayload(payload);
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      throw new AccessTokenExpiredError();
    }
    throw err;
  }
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
  const topLevelRole = payload.role;
  if (topLevelRole === 'admin' || topLevelRole === 'owner') {
    return topLevelRole;
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
