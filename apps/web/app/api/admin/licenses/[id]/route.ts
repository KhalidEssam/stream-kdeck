import { NextRequest } from 'next/server';
import { apiAuthErrorResponse, requireApiStaff } from '@/lib/auth/guards';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiStaff();
    const { id } = await params;
    const body = (await request.json()) as { action?: unknown };
    const action = typeof body.action === 'string' ? body.action : '';
    const supabase = getSupabaseAdmin();

    if (action === 'revoke') {
      const { error } = await supabase.from('licenses').update({ status: 'revoked' }).eq('id', id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (action === 'reset_credits') {
      const { error } = await supabase.from('licenses').update({ credits_used: 0 }).eq('id', id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'INVALID_ACTION' }, { status: 400 });
  } catch (err) {
    return apiAuthErrorResponse(err);
  }
}
