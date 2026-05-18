import { getPlanConfig, PlanId } from './plans';
import { getSupabaseAdmin } from './supabase-admin';
import { findAuthUserByEmail } from './supabase-users';

export interface ExistingSubscriptionCheck {
  exists: boolean;
  status?: 'active' | 'past_due';
}

export async function checkExistingSubscriptionForCheckout(input: {
  email: string;
  plan: PlanId;
}): Promise<ExistingSubscriptionCheck> {
  const plan = getPlanConfig(input.plan);
  if (!plan.includesAiPro) {
    return { exists: false };
  }

  const user = await findAuthUserByEmail(input.email);
  if (!user) {
    return { exists: false };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .in('status', ['active', 'past_due'])
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    return { exists: false };
  }

  return { exists: true, status: data.status as 'active' | 'past_due' };
}
