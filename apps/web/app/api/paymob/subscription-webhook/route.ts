import { NextRequest } from 'next/server';
import {
  deriveSubscriptionStatus,
  extractPaymobOrderId,
  extractSubscriptionId,
  getPaymobTransaction,
} from '@/lib/paymob-callback';
import { verifyPaymobHmac } from '@/lib/paymob-hmac';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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

  const paymobSubscriptionId = extractSubscriptionId(payload, transaction);
  const paymobOrderId = extractPaymobOrderId(transaction);
  if (!paymobSubscriptionId && !paymobOrderId) {
    return Response.json({ error: 'MISSING_SUBSCRIPTION_REFERENCE' }, { status: 400 });
  }

  const status = deriveSubscriptionStatus(payload, transaction);
  const supabase = getSupabaseAdmin();
  const update = {
    status,
    ...(status === 'active'
      ? { credits_remaining: 500, credits_reset_at: nextMonthlyReset().toISOString() }
      : {}),
  };

  const query = paymobSubscriptionId
    ? supabase.from('subscriptions').update(update).eq('paymob_subscription_id', paymobSubscriptionId)
    : supabase.from('subscriptions').update(update).eq('paymob_order_id', paymobOrderId);

  const { error } = await query;
  if (error) {
    console.error('[web] Paymob subscription webhook update failed', error);
    return Response.json({ error: 'SUBSCRIPTION_UPDATE_FAILED' }, { status: 500 });
  }

  return Response.json({ ok: true, status });
}

function nextMonthlyReset(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
