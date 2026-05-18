export const ACCESS_TOKEN_COOKIE = 'sb-access-token';
export const REFRESH_TOKEN_COOKIE = 'sb-refresh-token';

interface CookieWriter {
  set: (name: string, value: string, options: SessionCookieOptions) => void;
}

interface SessionCookieOptions {
  httpOnly?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
  path?: string;
  maxAge?: number;
}

const baseCookieOptions: SessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export function setSessionCookies(
  writer: CookieWriter,
  session: { access_token: string; refresh_token?: string | null; expires_in?: number | null },
): void {
  writer.set(ACCESS_TOKEN_COOKIE, session.access_token, {
    ...baseCookieOptions,
    maxAge: session.expires_in ?? 60 * 15,
  });

  if (session.refresh_token) {
    writer.set(REFRESH_TOKEN_COOKIE, session.refresh_token, {
      ...baseCookieOptions,
      maxAge: 60 * 60 * 24 * 30,
    });
  }
}

export function clearSessionCookies(writer: CookieWriter): void {
  writer.set(ACCESS_TOKEN_COOKIE, '', { ...baseCookieOptions, maxAge: 0 });
  writer.set(REFRESH_TOKEN_COOKIE, '', { ...baseCookieOptions, maxAge: 0 });
}
