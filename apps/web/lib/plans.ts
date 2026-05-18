import { getEnv } from './env';

export type PlanId = 'desktop_license' | 'ai_pro_monthly' | 'ai_pro_yearly';

export interface PlanConfig {
  id: PlanId;
  name: string;
  amountCents: number;
  monthlyAiCredits: number;
  includesAiPro: boolean;
  subscriptionPeriodMonths: number | null;
}

const PLAN_ENV: Record<PlanId, { name: string; amountEnv: string; fallback: string; aiPro: boolean; period: number | null }> = {
  desktop_license: {
    name: 'Control Surface Desktop License',
    amountEnv: 'PAYMOB_LICENSE_AMOUNT_CENTS',
    fallback: '1900',
    aiPro: false,
    period: null,
  },
  ai_pro_monthly: {
    name: 'Control Surface AI Pro Monthly',
    amountEnv: 'PAYMOB_AI_PRO_MONTHLY_AMOUNT_CENTS',
    fallback: '800',
    aiPro: true,
    period: 1,
  },
  ai_pro_yearly: {
    name: 'Control Surface AI Pro Yearly',
    amountEnv: 'PAYMOB_AI_PRO_YEARLY_AMOUNT_CENTS',
    fallback: '5900',
    aiPro: true,
    period: 12,
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in PLAN_ENV;
}

export function getPlanConfig(plan: PlanId): PlanConfig {
  const raw = PLAN_ENV[plan];
  const amountCents = Number.parseInt(getEnv(raw.amountEnv, raw.fallback), 10);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error(`${raw.amountEnv} must be a positive integer amount in cents.`);
  }

  return {
    id: plan,
    name: raw.name,
    amountCents,
    monthlyAiCredits: 50,
    includesAiPro: raw.aiPro,
    subscriptionPeriodMonths: raw.period,
  };
}

export function inferPlanFromAmount(amountCents: unknown): PlanId | null {
  const parsed = Number(amountCents);
  if (!Number.isFinite(parsed)) return null;

  const planIds: PlanId[] = ['desktop_license', 'ai_pro_monthly', 'ai_pro_yearly'];
  return planIds.find((plan) => getPlanConfig(plan).amountCents === parsed) ?? null;
}
