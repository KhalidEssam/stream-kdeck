import { NextRequest } from 'next/server';
import { createPaymobCheckoutSession } from '@/lib/paymob';
import { isPlanId } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { plan?: unknown; email?: unknown };
    if (!isPlanId(body.plan)) {
      return Response.json({ error: 'INVALID_PLAN' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) {
      return Response.json({ error: 'INVALID_EMAIL' }, { status: 400 });
    }

    const session = await createPaymobCheckoutSession({ plan: body.plan, email });
    return Response.json(session);
  } catch (err) {
    console.error('[web] Paymob create-order failed', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'CREATE_ORDER_FAILED' },
      { status: 500 },
    );
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
