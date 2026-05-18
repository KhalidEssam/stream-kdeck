import { CurrentSession, getCurrentSession } from './session';

export class ApiAuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
    this.name = 'ApiAuthError';
  }
}

export async function requireApiSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) {
    throw new ApiAuthError(401, 'UNAUTHENTICATED', 'Sign in required.');
  }
  return session;
}

export async function requireApiStaff(): Promise<CurrentSession> {
  const session = await requireApiSession();
  if (session.user.role !== 'admin' && session.user.role !== 'owner') {
    throw new ApiAuthError(403, 'FORBIDDEN', 'Staff access required.');
  }
  return session;
}

export async function requireApiOwner(): Promise<CurrentSession> {
  const session = await requireApiStaff();
  if (session.user.role !== 'owner') {
    throw new ApiAuthError(403, 'FORBIDDEN', 'Owner access required.');
  }
  return session;
}

export function apiAuthErrorResponse(err: unknown): Response {
  if (err instanceof ApiAuthError) {
    return Response.json({ error: err.code, message: err.message }, { status: err.status });
  }

  return Response.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
}
