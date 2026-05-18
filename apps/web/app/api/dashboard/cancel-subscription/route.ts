import { apiAuthErrorResponse, requireApiSession } from '@/lib/auth/guards';
import { cancelPaymobSubscription } from '@/lib/paymob-subscriptions';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await requireApiSession();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id, paymob_subscription_id')
      .eq('user_id', session.user.sub)
      .in('status', ['active', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    if (data) {
      await cancelPaymobSubscription(data.paymob_subscription_id);
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', data.id);
      if (updateError) throw updateError;
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error) console.error('[web] Cancel subscription failed', err);
    return apiAuthErrorResponse(err);
  }
}
