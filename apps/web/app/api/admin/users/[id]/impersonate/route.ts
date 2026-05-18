import { apiAuthErrorResponse, requireApiStaff } from '@/lib/auth/guards';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiStaff();
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(id);
    if (userError) throw userError;
    const email = userData.user?.email;
    if (!email) return Response.json({ error: 'USER_HAS_NO_EMAIL' }, { status: 400 });

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (error) throw error;

    return Response.json({ actionLink: data.properties?.action_link ?? null });
  } catch (err) {
    return apiAuthErrorResponse(err);
  }
}
