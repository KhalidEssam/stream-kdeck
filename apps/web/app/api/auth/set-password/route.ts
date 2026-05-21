import { NextResponse } from 'next/server';
import { apiAuthErrorResponse, requireApiSession } from '@/lib/auth/guards';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await requireApiSession();
    const body = (await request.json()) as { password?: unknown };
    const password = typeof body.password === 'string' ? body.password : '';

    if (password.length < 8) {
      return Response.json({ error: 'WEAK_PASSWORD' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(session.user.sub);
    if (userError || !userData.user) {
      return Response.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
    }

    const { error } = await supabase.auth.admin.updateUserById(session.user.sub, {
      password,
      user_metadata: {
        ...(userData.user.user_metadata ?? {}),
        password_set: true,
      },
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error) console.error('[web] Set password failed', err);
    return apiAuthErrorResponse(err);
  }
}
