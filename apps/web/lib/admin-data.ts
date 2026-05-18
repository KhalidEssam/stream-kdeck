import { getPlatformConfigInt } from './platform-config';
import { getSupabaseAdmin } from './supabase-admin';

export interface AdminStats {
  totalLicenses: number;
  activeLicenses: number;
  activeSubscriptions: number;
  estimatedRevenueCents: number;
  recentLicenses: AdminLicenseRow[];
  recentSubscriptions: AdminSubscriptionRow[];
}

export interface AdminLicenseRow {
  id: string;
  userId: string;
  email: string | null;
  status: string;
  planId: string;
  monthlyAiCredits: number;
  creditsUsed: number;
  deviceName: string | null;
  paymobOrderId: string | null;
  createdAt: string;
}

export interface AdminSubscriptionRow {
  id: string;
  userId: string;
  email: string | null;
  status: string;
  plan: string;
  creditsRemaining: number;
  paymobSubscriptionId: string | null;
  paymobOrderId: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  role: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
}

export async function getAdminStats(): Promise<AdminStats> {
  const [licenses, subscriptions, licensePrice, monthlyPrice] = await Promise.all([
    listLicenses(),
    listSubscriptions(),
    getPlatformConfigInt('license_amount_cents'),
    getPlatformConfigInt('ai_pro_monthly_amount_cents'),
  ]);

  const activeSubscriptions = subscriptions.filter((row) => row.status === 'active').length;
  return {
    totalLicenses: licenses.length,
    activeLicenses: licenses.filter((row) => row.status === 'active').length,
    activeSubscriptions,
    estimatedRevenueCents: licenses.length * licensePrice + activeSubscriptions * monthlyPrice,
    recentLicenses: licenses.slice(0, 6),
    recentSubscriptions: subscriptions.slice(0, 6),
  };
}

export async function listLicenses(): Promise<AdminLicenseRow[]> {
  const supabase = getSupabaseAdmin();
  const [{ data, error }, users] = await Promise.all([
    supabase
      .from('licenses')
      .select('id, user_id, status, plan_id, monthly_ai_credits, credits_used, device_name, paymob_order_id, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    listAuthUsersMap(),
  ]);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    email: users.get(String(row.user_id))?.email ?? null,
    status: String(row.status),
    planId: String(row.plan_id ?? 'desktop_license'),
    monthlyAiCredits: Number(row.monthly_ai_credits) || 0,
    creditsUsed: Number(row.credits_used) || 0,
    deviceName: typeof row.device_name === 'string' ? row.device_name : null,
    paymobOrderId: typeof row.paymob_order_id === 'string' ? row.paymob_order_id : null,
    createdAt: String(row.created_at),
  }));
}

export async function getLicense(id: string): Promise<AdminLicenseRow | null> {
  const rows = await listLicenses();
  return rows.find((row) => row.id === id) ?? null;
}

export async function listSubscriptions(): Promise<AdminSubscriptionRow[]> {
  const supabase = getSupabaseAdmin();
  const [{ data, error }, users] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('id, user_id, status, plan, credits_remaining, paymob_subscription_id, paymob_order_id, current_period_end, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    listAuthUsersMap(),
  ]);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    email: users.get(String(row.user_id))?.email ?? null,
    status: String(row.status),
    plan: String(row.plan),
    creditsRemaining: Number(row.credits_remaining) || 0,
    paymobSubscriptionId: typeof row.paymob_subscription_id === 'string' ? row.paymob_subscription_id : null,
    paymobOrderId: typeof row.paymob_order_id === 'string' ? row.paymob_order_id : null,
    currentPeriodEnd: typeof row.current_period_end === 'string' ? row.current_period_end : null,
    createdAt: String(row.created_at),
  }));
}

export async function listUsers(): Promise<AdminUserRow[]> {
  const users = Array.from((await listAuthUsersMap()).values());
  return users.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getUser(id: string): Promise<AdminUserRow | null> {
  return (await listAuthUsersMap()).get(id) ?? null;
}

async function listAuthUsersMap(): Promise<Map<string, AdminUserRow>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  return new Map(
    data.users.map((user) => [
      user.id,
      {
        id: user.id,
        email: user.email ?? null,
        role: readRole(user.app_metadata),
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
      },
    ]),
  );
}

function readRole(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const role = (value as Record<string, unknown>).role;
  return typeof role === 'string' ? role : null;
}
