import { inferPlanFromAmount, isPlanId, PlanId } from './plans';

export interface PaymobTransaction {
  amount_cents?: number | string;
  id?: number | string;
  order?: unknown;
  success?: boolean | string;
  pending?: boolean | string;
  is_refunded?: boolean | string;
  is_voided?: boolean | string;
  [key: string]: unknown;
}

export function getPaymobTransaction(payload: unknown): PaymobTransaction | null {
  const value = isRecord(payload) && isRecord(payload.obj) ? payload.obj : payload;
  return isRecord(value) ? (value as PaymobTransaction) : null;
}

export function isSuccessfulPaymobTransaction(transaction: PaymobTransaction): boolean {
  return (
    toBoolean(transaction.success) &&
    !toBoolean(transaction.pending) &&
    !toBoolean(transaction.is_refunded) &&
    !toBoolean(transaction.is_voided)
  );
}

export function extractPaymobOrderId(transaction: PaymobTransaction): string | null {
  const candidates = [
    getPath(transaction, 'order.id'),
    transaction.order,
    getPath(transaction, 'order.merchant_order_id'),
    transaction.id,
  ];

  return firstString(candidates);
}

export function extractCustomerEmail(payload: unknown, transaction: PaymobTransaction): string | null {
  const candidates = [
    getPath(transaction, 'extras.email'),
    getPath(transaction, 'data.extras.email'),
    getPath(transaction, 'order.extras.email'),
    getPath(transaction, 'billing_data.email'),
    getPath(transaction, 'customer.email'),
    getPath(transaction, 'order.shipping_data.email'),
    getPath(payload, 'extras.email'),
    getPath(payload, 'email'),
  ];

  return firstString(candidates)?.toLowerCase() ?? null;
}

export function extractPlanId(payload: unknown, transaction: PaymobTransaction): PlanId | null {
  const directCandidates = [
    getPath(transaction, 'extras.plan'),
    getPath(transaction, 'data.extras.plan'),
    getPath(transaction, 'order.extras.plan'),
    getPath(payload, 'extras.plan'),
    getPath(payload, 'plan'),
  ];
  const direct = directCandidates.find(isPlanId);
  if (direct) return direct;

  const references = [
    getPath(transaction, 'special_reference'),
    getPath(transaction, 'merchant_order_id'),
    getPath(transaction, 'order.merchant_order_id'),
    getPath(payload, 'special_reference'),
    getPath(payload, 'merchant_order_id'),
  ];
  const fromReference = firstString(references);
  if (fromReference) {
    const match = fromReference.match(/cs_(desktop_license|ai_pro_monthly|ai_pro_yearly)_/);
    if (match && isPlanId(match[1])) return match[1];
  }

  return inferPlanFromAmount(transaction.amount_cents);
}

export function extractSubscriptionId(payload: unknown, transaction: PaymobTransaction): string | null {
  return firstString([
    getPath(transaction, 'subscription_id'),
    getPath(transaction, 'subscription.id'),
    getPath(transaction, 'data.subscription_id'),
    getPath(payload, 'subscription_id'),
    getPath(payload, 'obj.subscription_id'),
  ]);
}

export function deriveSubscriptionStatus(payload: unknown, transaction: PaymobTransaction): 'active' | 'cancelled' | 'past_due' {
  const raw = firstString([
    getPath(payload, 'event'),
    getPath(payload, 'type'),
    getPath(transaction, 'subscription.status'),
    getPath(transaction, 'status'),
  ])?.toLowerCase();

  if (raw?.includes('cancel') || raw?.includes('deactivat')) return 'cancelled';
  if (raw?.includes('past_due') || raw?.includes('failed') || raw?.includes('declined')) return 'past_due';
  return isSuccessfulPaymobTransaction(transaction) ? 'active' : 'past_due';
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function getPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
