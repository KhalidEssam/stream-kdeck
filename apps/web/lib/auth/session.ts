import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseAuth } from '../supabase-auth';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from './cookies';
import { AccessTokenExpiredError, StaffRole, VerifiedAccessToken, verifyAccessToken } from './jwt';

export interface CurrentSession {
  accessToken: string;
  refreshToken: string | null;
  user: VerifiedAccessToken;
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;
type CookieWriter = Parameters<typeof setSessionCookies>[0];

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value ?? null;

  if (!accessToken) {
    return null;
  }

  try {
    return {
      accessToken,
      refreshToken,
      user: await verifyAccessToken(accessToken),
    };
  } catch (err) {
    if (err instanceof AccessTokenExpiredError && refreshToken) {
      return refreshSession(refreshToken, store);
    }

    tryClearSessionCookies(store);
    return null;
  }
}

export async function requireSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

export async function requireStaff(): Promise<CurrentSession & { user: VerifiedAccessToken & { role: StaffRole } }> {
  const session = await getCurrentSession();
  if (!session) {
    redirect('/admin/login');
  }

  if (session.user.role !== 'admin' && session.user.role !== 'owner') {
    redirect('/forbidden');
  }

  return session as CurrentSession & { user: VerifiedAccessToken & { role: StaffRole } };
}

export async function requireOwner(): Promise<CurrentSession & { user: VerifiedAccessToken & { role: 'owner' } }> {
  const session = await requireStaff();
  if (session.user.role !== 'owner') {
    redirect('/forbidden');
  }

  return session as CurrentSession & { user: VerifiedAccessToken & { role: 'owner' } };
}

async function refreshSession(refreshToken: string, store: CookieStore): Promise<CurrentSession | null> {
  const supabase = getSupabaseAuth();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session?.access_token) {
    tryClearSessionCookies(store);
    return null;
  }

  trySetSessionCookies(store, data.session);

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token ?? refreshToken,
    user: await verifyAccessToken(data.session.access_token),
  };
}

function trySetSessionCookies(store: CookieStore, session: { access_token: string; refresh_token?: string | null; expires_in?: number | null }): void {
  try {
    setSessionCookies(store as unknown as CookieWriter, session);
  } catch {
    // Server Components can read cookies but cannot always write refreshed tokens.
  }
}

function tryClearSessionCookies(store: CookieStore): void {
  try {
    clearSessionCookies(store as unknown as CookieWriter);
  } catch {
    // Server Components can read cookies but cannot always clear them.
  }
}
