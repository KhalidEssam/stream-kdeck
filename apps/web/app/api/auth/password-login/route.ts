import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookies } from '@/lib/auth/cookies';
import { createUserSupabaseClient } from '@/lib/supabase-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { findAuthUserByEmail } from '@/lib/supabase-users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: unknown; password?: unknown };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!isValidEmail(email) || password.length === 0) {
    return Response.json({ error: 'INVALID_CREDENTIALS' }, { status: 400 });
  }

  const existing = await findAuthUserByEmail(email);
  if (!existing) {
    return Response.json({ error: 'NO_ACCOUNT' }, { status: 404 });
  }

  const client = createUserSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    return Response.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
  }

  await markPasswordSet(data.user.id, data.user.user_metadata);

  const response = NextResponse.json({ ok: true });
  setSessionCookies(response.cookies, data.session);
  return response;
}

async function markPasswordSet(userId: string, userMetadata: Record<string, unknown> | null): Promise<void> {
  try {
    await getSupabaseAdmin().auth.admin.updateUserById(userId, {
      user_metadata: {
        ...(userMetadata ?? {}),
        password_set: true,
      },
    });
  } catch (err) {
    console.warn('[web] Could not mark password_set after password login', err);
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
