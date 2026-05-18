import { NextRequest } from 'next/server';
import {
  extractCustomerEmail,
  extractPaymobOrderId,
  extractPlanId,
  extractSubscriptionId,
  getPaymobTransaction,
  isSuccessfulPaymobTransaction,
} from '@/lib/paymob-callback';
import { verifyPaymobHmac } from '@/lib/paymob-hmac';
import { provisionPaidOrder } from '@/lib/licenses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const receivedHmac =
    request.nextUrl.searchParams.get('hmac') ??
    (isRecord(payload) && typeof payload.hmac === 'string' ? payload.hmac : null);
  if (!verifyPaymobHmac(payload, receivedHmac)) {
    return Response.json({ error: 'INVALID_HMAC' }, { status: 401 });
  }

  const transaction = getPaymobTransaction(payload);
  if (!transaction) {
    return Response.json({ error: 'INVALID_TRANSACTION' }, { status: 400 });
  }

  if (!isSuccessfulPaymobTransaction(transaction)) {
    return Response.json({ ok: true, status: 'ignored_unsuccessful_transaction' });
  }

  const email = extractCustomerEmail(payload, transaction);
  const plan = extractPlanId(payload, transaction);
  const paymobOrderId = extractPaymobOrderId(transaction);
  if (!email || !plan || !paymobOrderId) {
    return Response.json(
      { error: 'MISSING_PROVISIONING_DATA', email: !!email, plan: !!plan, paymobOrderId: !!paymobOrderId },
      { status: 400 },
    );
  }

  try {
    const result = await provisionPaidOrder({
      email,
      plan,
      paymobOrderId,
      paymobTransactionId: transaction.id ? String(transaction.id) : null,
      paymobSubscriptionId: extractSubscriptionId(payload, transaction),
    });
    return Response.json({ ok: true, status: result.status });
  } catch (err) {
    console.error('[web] Paymob webhook provisioning failed', err);
    return Response.json({ error: 'PROVISIONING_FAILED' }, { status: 500 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
