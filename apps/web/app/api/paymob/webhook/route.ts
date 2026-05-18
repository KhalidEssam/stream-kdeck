import { NextRequest } from 'next/server';
import { verifyPaymobHmac } from '@/lib/paymob-hmac';
import { processPaymobTransactionPayload } from '@/lib/paymob-processing';

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

  try {
    const result = await processPaymobTransactionPayload(payload);
    return Response.json({ ok: true, status: result.status });
  } catch (err) {
    console.error('[web] Paymob webhook provisioning failed', err);
    const message = err instanceof Error ? err.message : 'PROVISIONING_FAILED';
    const status = message === 'INVALID_TRANSACTION' || message === 'MISSING_PROVISIONING_DATA' ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
