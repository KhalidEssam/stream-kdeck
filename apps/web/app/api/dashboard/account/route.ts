import { NextResponse } from 'next/server';
import { apiAuthErrorResponse, requireApiSession } from '@/lib/auth/guards';
import { clearSessionCookies } from '@/lib/auth/cookies';
import { cancelPaymobSubscription } from '@/lib/paymob-subscriptions';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE() {
  try {
    const session = await requireApiSession();
    const supabase = getSupabaseAdmin();

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('id, paymob_subscription_id')
      .eq('user_id', session.user.sub)
      .in('status', ['active', 'past_due']);
    if (subscriptionError) throw subscriptionError;

    for (const subscription of subscriptions ?? []) {
      await cancelPaymobSubscription(subscription.paymob_subscription_id);
    }

    const now = new Date().toISOString();
    const [licenseUpdate, subscriptionUpdate, userUpdate] = await Promise.all([
      supabase.from('licenses').update({ status: 'revoked' }).eq('user_id', session.user.sub),
      supabase.from('subscriptions').update({ status: 'cancelled' }).eq('user_id', session.user.sub),
      supabase.auth.admin.updateUserById(session.user.sub, {
        user_metadata: { deleted_at: now },
      }),
    ]);

    if (licenseUpdate.error) throw licenseUpdate.error;
    if (subscriptionUpdate.error) throw subscriptionUpdate.error;
    if (userUpdate.error) throw userUpdate.error;

    const response = NextResponse.json({ ok: true });
    clearSessionCookies(response.cookies);
    return response;
  } catch (err) {
    if (err instanceof Error) console.error('[web] Account delete failed', err);
    return apiAuthErrorResponse(err);
  }
}
