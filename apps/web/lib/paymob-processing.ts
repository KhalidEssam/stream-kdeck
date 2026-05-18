import {
  extractCustomerEmail,
  extractPaymobOrderId,
  extractPlanId,
  extractSubscriptionId,
  getPaymobTransaction,
  isSuccessfulPaymobTransaction,
} from './paymob-callback';
import { provisionPaidOrder } from './licenses';
import { PlanId } from './plans';

export interface PaymobProcessingResult {
  status: 'created' | 'already_processed' | 'ignored_unsuccessful_transaction';
  paymobOrderId?: string;
}

export async function processPaymobTransactionPayload(
  payload: unknown,
  fallback?: { email?: string | null; plan?: PlanId | null },
): Promise<PaymobProcessingResult> {
  const transaction = getPaymobTransaction(payload);
  if (!transaction) {
    throw new Error('INVALID_TRANSACTION');
  }

  if (!isSuccessfulPaymobTransaction(transaction)) {
    return { status: 'ignored_unsuccessful_transaction' };
  }

  const email = fallback?.email ?? extractCustomerEmail(payload, transaction);
  const plan = fallback?.plan ?? extractPlanId(payload, transaction);
  const paymobOrderId = extractPaymobOrderId(transaction);
  if (!email || !plan || !paymobOrderId) {
    throw new Error('MISSING_PROVISIONING_DATA');
  }

  const result = await provisionPaidOrder({
    email,
    plan,
    paymobOrderId,
    paymobTransactionId: transaction.id ? String(transaction.id) : null,
    paymobSubscriptionId: extractSubscriptionId(payload, transaction),
  });

  return { status: result.status, paymobOrderId };
}
