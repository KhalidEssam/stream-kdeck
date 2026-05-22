import crypto from 'crypto';
import { getEnv } from './env';
import { sendLicenseEmail } from './mail';
import { getPlanConfig, PlanId } from './plans';
import { getSupabaseAdmin } from './supabase-admin';
import { findAuthUserByEmail } from './supabase-users';

interface ProvisionInput {
  email: string;
  plan: PlanId;
  paymobOrderId: string;
  paymobTransactionId?: string | null;
  paymobSubscriptionId?: string | null;
}

export async function getUserLicenseByEmail(
  email: string,
): Promise<{ paymobOrderId: string; planId: PlanId } | null> {
  const user = await findAuthUserByEmail(email);
  if (!user) return null;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('licenses')
    .select('paymob_order_id, plan_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data || typeof data.paymob_order_id !== 'string') return null;
  return {
    paymobOrderId: data.paymob_order_id,
    planId: (data.plan_id ?? 'desktop_license') as PlanId,
  };
}

export async function provisionPaidOrder(input: ProvisionInput): Promise<{ status: 'created' | 'already_processed' }> {
  const supabase = getSupabaseAdmin();
  const plan = await getPlanConfig(input.plan);

  // Idempotency: order already produced a license row
  const { data: existingByOrder, error: existingError } = await supabase
    .from('licenses')
    .select('id, user_id')
    .eq('paymob_order_id', input.paymobOrderId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existingByOrder) {
    if (plan.includesAiPro) {
      await ensureSubscription({
        userId: existingByOrder.user_id,
        plan: input.plan,
        paymobOrderId: input.paymobOrderId,
        paymobSubscriptionId: input.paymobSubscriptionId,
      });
    }
    const licenseKey = deriveLicenseKey(input);
    await sendLicenseEmail({ to: input.email, licenseKey, planName: plan.name });
    return { status: 'already_processed' };
  }

  // Idempotency for upgrade orders (no license row expected): check subscriptions table
  if (plan.includesAiPro) {
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('paymob_order_id', input.paymobOrderId)
      .maybeSingle();
    if (existingSub) return { status: 'already_processed' };
  }

  const userId = await ensureUser(input.email, input.plan);

  // Check if user already has a license — if so this is an upgrade, not a first purchase
  const { data: existingLicenseRow } = await supabase
    .from('licenses')
    .select('paymob_order_id, plan_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const isUpgrade = plan.includesAiPro && !!existingLicenseRow;

  if (isUpgrade && existingLicenseRow) {
    // Only add the subscription; do not create a second license record
    await ensureSubscription({
      userId,
      plan: input.plan,
      paymobOrderId: input.paymobOrderId,
      paymobSubscriptionId: input.paymobSubscriptionId,
    });
    // Email the user their original key so they know it still works
    const originalKey = deriveLicenseKey({
      email: input.email,
      plan: existingLicenseRow.plan_id as PlanId,
      paymobOrderId: existingLicenseRow.paymob_order_id as string,
    });
    await sendLicenseEmail({ to: input.email, licenseKey: originalKey, planName: plan.name });
    return { status: 'created' };
  }

  // First-time purchase: create license
  const licenseKey = deriveLicenseKey(input);
  const keyHash = hashLicenseKey(licenseKey);
  const nextReset = nextMonthlyReset();

  const { error: licenseError } = await supabase.from('licenses').insert({
    user_id: userId,
    key_hash: keyHash,
    status: 'unused',
    monthly_ai_credits: plan.desktopMonthlyAiCredits,
    plan_id: input.plan,
    credits_used: 0,
    credits_reset_at: nextReset.toISOString(),
    paymob_order_id: input.paymobOrderId,
  });
  if (licenseError) throw licenseError;

  if (plan.includesAiPro) {
    await ensureSubscription({
      userId,
      plan: input.plan,
      paymobOrderId: input.paymobOrderId,
      paymobSubscriptionId: input.paymobSubscriptionId,
    });
  }

  await sendLicenseEmail({ to: input.email, licenseKey, planName: plan.name });
  return { status: 'created' };
}

async function ensureSubscription(input: {
  userId: string;
  plan: PlanId;
  paymobOrderId: string;
  paymobSubscriptionId?: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const plan = await getPlanConfig(input.plan);
  if (!plan.includesAiPro) return;

  const currentPeriodEnd = addMonths(new Date(), plan.subscriptionPeriodMonths ?? 1);
  const { error } = await supabase.from('subscriptions').upsert(
    {
      user_id: input.userId,
      paymob_subscription_id: input.paymobSubscriptionId,
      paymob_order_id: input.paymobOrderId,
      plan: 'ai_pro',
      status: 'active',
      credits_remaining: plan.monthlyAiCredits,
      credits_reset_at: nextMonthlyReset().toISOString(),
      current_period_end: currentPeriodEnd.toISOString(),
    },
    { onConflict: 'paymob_order_id' },
  );
  if (error) throw error;
}

async function ensureUser(email: string, plan: PlanId): Promise<string> {
  const supabase = getSupabaseAdmin();
  const password = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      source: 'paymob',
      initial_plan: plan,
      password_set: false,
    },
  });

  if (!error && data.user) return data.user.id;

  const existing = await findAuthUserByEmail(email);
  if (existing) return existing.id;

  throw error ?? new Error(`Could not create Supabase user for ${email}.`);
}

export function deriveLicenseKey(input: Pick<ProvisionInput, 'email' | 'plan' | 'paymobOrderId'>): string {
  const digest = crypto
    .createHmac('sha256', getEnv('LICENSE_KEY_SECRET'))
    .update(`${input.paymobOrderId}:${input.email.toLowerCase()}:${input.plan}`)
    .digest('hex')
    .toUpperCase();
  const chunks = digest.slice(0, 20).match(/.{1,4}/g) ?? [];
  return `CS-${chunks.join('-')}`;
}

function hashLicenseKey(licenseKey: string): string {
  return crypto.createHash('sha256').update(licenseKey.toLowerCase().trim()).digest('hex');
}

function nextMonthlyReset(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}
