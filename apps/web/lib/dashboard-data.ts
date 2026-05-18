import { deriveLicenseKey } from './licenses';
import { getPlanConfig, isPlanId, PlanId } from './plans';
import { getSupabaseAdmin } from './supabase-admin';

export interface CustomerDashboard {
  email: string | null;
  license: CustomerLicense | null;
  subscription: CustomerSubscription | null;
  recentUsage: CustomerUsage[];
  licenseKey: string | null;
  credits: {
    total: number;
    used: number;
    remaining: number;
    label: string;
  };
}

export interface CustomerLicense {
  id: string;
  status: string;
  planId: PlanId;
  monthlyAiCredits: number;
  creditsUsed: number;
  paymobOrderId: string | null;
  deviceFingerprint: string | null;
  deviceName: string | null;
  activatedAt: string | null;
  createdAt: string;
}

export interface CustomerSubscription {
  id: string;
  status: string;
  plan: string;
  creditsRemaining: number;
  paymobSubscriptionId: string | null;
  paymobOrderId: string | null;
  currentPeriodEnd: string | null;
  creditsResetAt: string | null;
  createdAt: string;
}

export interface CustomerUsage {
  id: string;
  usedAt: string;
  provider: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

export async function getCustomerDashboard(userId: string, email: string | null): Promise<CustomerDashboard> {
  const supabase = getSupabaseAdmin();

  const [licenseResult, subscriptionResult, usageResult] = await Promise.all([
    supabase
      .from('licenses')
      .select('id, status, plan_id, monthly_ai_credits, credits_used, paymob_order_id, device_fingerprint, device_name, activated_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('subscriptions')
      .select('id, status, plan, credits_remaining, paymob_subscription_id, paymob_order_id, current_period_end, credits_reset_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('ai_usage_log')
      .select('id, used_at, provider, tokens_in, tokens_out')
      .eq('user_id', userId)
      .order('used_at', { ascending: false })
      .limit(8),
  ]);

  if (licenseResult.error) throw licenseResult.error;
  if (subscriptionResult.error) throw subscriptionResult.error;
  if (usageResult.error) throw usageResult.error;

  const license = mapLicense(licenseResult.data);
  const subscription = mapSubscription(subscriptionResult.data);
  const licenseKey =
    email && license?.paymobOrderId
      ? deriveLicenseKey({ email, plan: license.planId, paymobOrderId: license.paymobOrderId })
      : null;

  return {
    email,
    license,
    subscription,
    recentUsage: (usageResult.data ?? []).map((row) => ({
      id: String(row.id),
      usedAt: String(row.used_at),
      provider: typeof row.provider === 'string' ? row.provider : null,
      tokensIn: typeof row.tokens_in === 'number' ? row.tokens_in : null,
      tokensOut: typeof row.tokens_out === 'number' ? row.tokens_out : null,
    })),
    licenseKey,
    credits: await getCreditSummary(license, subscription),
  };
}

async function getCreditSummary(
  license: CustomerLicense | null,
  subscription: CustomerSubscription | null,
): Promise<CustomerDashboard['credits']> {
  if (subscription?.status === 'active') {
    const plan = await getPlanConfig('ai_pro_monthly');
    return {
      total: plan.monthlyAiCredits,
      used: Math.max(0, plan.monthlyAiCredits - subscription.creditsRemaining),
      remaining: subscription.creditsRemaining,
      label: 'AI Pro credits',
    };
  }

  if (!license) {
    return { total: 0, used: 0, remaining: 0, label: 'AI credits' };
  }

  const remaining = Math.max(0, license.monthlyAiCredits - license.creditsUsed);
  return {
    total: license.monthlyAiCredits,
    used: license.creditsUsed,
    remaining,
    label: 'Desktop credits',
  };
}

function mapLicense(row: Record<string, unknown> | null): CustomerLicense | null {
  if (!row) return null;
  const planId = isPlanId(row.plan_id) ? row.plan_id : 'desktop_license';
  return {
    id: String(row.id),
    status: String(row.status),
    planId,
    monthlyAiCredits: Number(row.monthly_ai_credits) || 0,
    creditsUsed: Number(row.credits_used) || 0,
    paymobOrderId: typeof row.paymob_order_id === 'string' ? row.paymob_order_id : null,
    deviceFingerprint: typeof row.device_fingerprint === 'string' ? row.device_fingerprint : null,
    deviceName: typeof row.device_name === 'string' ? row.device_name : null,
    activatedAt: typeof row.activated_at === 'string' ? row.activated_at : null,
    createdAt: String(row.created_at),
  };
}

function mapSubscription(row: Record<string, unknown> | null): CustomerSubscription | null {
  if (!row) return null;
  return {
    id: String(row.id),
    status: String(row.status),
    plan: String(row.plan),
    creditsRemaining: Number(row.credits_remaining) || 0,
    paymobSubscriptionId: typeof row.paymob_subscription_id === 'string' ? row.paymob_subscription_id : null,
    paymobOrderId: typeof row.paymob_order_id === 'string' ? row.paymob_order_id : null,
    currentPeriodEnd: typeof row.current_period_end === 'string' ? row.current_period_end : null,
    creditsResetAt: typeof row.credits_reset_at === 'string' ? row.credits_reset_at : null,
    createdAt: String(row.created_at),
  };
}
