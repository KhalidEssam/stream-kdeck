import crypto from 'crypto';
import { getEnv } from './env';
import { sendLicenseEmail } from './mail';
import { getPlanConfig, PlanId } from './plans';
import { getSupabaseAdmin } from './supabase-admin';

interface ProvisionInput {
  email: string;
  plan: PlanId;
  paymobOrderId: string;
  paymobTransactionId?: string | null;
  paymobSubscriptionId?: string | null;
}

export async function provisionPaidOrder(input: ProvisionInput): Promise<{ status: 'created' | 'already_processed' }> {
  const supabase = getSupabaseAdmin();
  const plan = getPlanConfig(input.plan);
  const licenseKey = deriveLicenseKey(input);
  const keyHash = hashLicenseKey(licenseKey);

  const { data: existing, error: existingError } = await supabase
    .from('licenses')
    .select('id, user_id')
    .eq('paymob_order_id', input.paymobOrderId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    if (plan.includesAiPro) {
      await ensureSubscription({
        userId: existing.user_id,
        plan: input.plan,
        paymobOrderId: input.paymobOrderId,
        paymobSubscriptionId: input.paymobSubscriptionId,
      });
    }
    await sendLicenseEmail({ to: input.email, licenseKey, planName: plan.name });
    return { status: 'already_processed' };
  }

  const userId = await ensureUser(input.email, input.plan);
  const nextReset = nextMonthlyReset();

  const { error: licenseError } = await supabase.from('licenses').insert({
    user_id: userId,
    key_hash: keyHash,
    status: 'unused',
    monthly_ai_credits: plan.monthlyAiCredits,
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
  const plan = getPlanConfig(input.plan);
  if (!plan.includesAiPro) return;

  const currentPeriodEnd = addMonths(new Date(), plan.subscriptionPeriodMonths ?? 1);
  const { error } = await supabase.from('subscriptions').upsert(
    {
      user_id: input.userId,
      paymob_subscription_id: input.paymobSubscriptionId,
      paymob_order_id: input.paymobOrderId,
      plan: 'ai_pro',
      status: 'active',
      credits_remaining: 500,
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
    },
  });

  if (!error && data.user) return data.user.id;

  const existing = await findUserByEmail(email);
  if (existing) return existing.id;

  throw error ?? new Error(`Could not create Supabase user for ${email}.`);
}

async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  const supabase = getSupabaseAdmin();
  const normalized = email.toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (found) return { id: found.id };
    if (data.users.length < 1000) break;
  }

  return null;
}

function deriveLicenseKey(input: ProvisionInput): string {
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
