import { getPlatformConfig, parseConfigInt } from './platform-config';

export type PlanId = 'desktop_license' | 'ai_pro_monthly' | 'ai_pro_yearly';

export interface PlanConfig {
  id: PlanId;
  name: string;
  amountCents: number;
  monthlyAiCredits: number;
  desktopMonthlyAiCredits: number;
  includesAiPro: boolean;
  subscriptionPeriodMonths: number | null;
}

const PLAN_META: Record<PlanId, { name: string; amountKey: 'license_amount_cents' | 'ai_pro_monthly_amount_cents' | 'ai_pro_yearly_amount_cents'; aiPro: boolean; period: number | null }> = {
  desktop_license: {
    name: 'Control Surface Desktop License',
    amountKey: 'license_amount_cents',
    aiPro: false,
    period: null,
  },
  ai_pro_monthly: {
    name: 'Control Surface AI Pro Monthly',
    amountKey: 'ai_pro_monthly_amount_cents',
    aiPro: true,
    period: 1,
  },
  ai_pro_yearly: {
    name: 'Control Surface AI Pro Yearly',
    amountKey: 'ai_pro_yearly_amount_cents',
    aiPro: true,
    period: 12,
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in PLAN_META;
}

export async function getPlanConfig(plan: PlanId): Promise<PlanConfig> {
  const raw = PLAN_META[plan];
  const config = await getPlatformConfig();
  const amountCents = parseConfigInt(raw.amountKey, config[raw.amountKey]);
  const desktopCredits = parseConfigInt('desktop_monthly_ai_credits', config.desktop_monthly_ai_credits);
  const aiProCredits = parseConfigInt('ai_pro_monthly_credits', config.ai_pro_monthly_credits);

  return {
    id: plan,
    name: raw.name,
    amountCents,
    monthlyAiCredits: raw.aiPro ? aiProCredits : desktopCredits,
    desktopMonthlyAiCredits: desktopCredits,
    includesAiPro: raw.aiPro,
    subscriptionPeriodMonths: raw.period,
  };
}

export async function getPlanConfigs(): Promise<PlanConfig[]> {
  return Promise.all((Object.keys(PLAN_META) as PlanId[]).map((plan) => getPlanConfig(plan)));
}

export async function inferPlanFromAmount(amountCents: unknown): Promise<PlanId | null> {
  const parsed = Number(amountCents);
  if (!Number.isFinite(parsed)) return null;

  const planIds: PlanId[] = ['desktop_license', 'ai_pro_monthly', 'ai_pro_yearly'];
  const configs = await getPlanConfigs();
  return planIds.find((plan) => configs.find((config) => config.id === plan)?.amountCents === parsed) ?? null;
}
