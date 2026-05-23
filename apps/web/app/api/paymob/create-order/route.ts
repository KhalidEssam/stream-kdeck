import { NextRequest } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireApiSession } from '@/lib/auth/guards';
import { createPaymobCheckoutSession } from '@/lib/paymob';
import { isPlanId, getPlanConfig } from '@/lib/plans';
import { checkExistingSubscriptionForCheckout } from '@/lib/subscriptions';
import { getUserLicenseByUserId } from '@/lib/licenses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession();
    const body = (await request.json()) as { plan?: unknown };
    if (!isPlanId(body.plan)) {
      return Response.json({ error: 'INVALID_PLAN' }, { status: 400 });
    }

    const email = session.user.email?.trim().toLowerCase() ?? '';
    if (!isValidEmail(email)) {
      return Response.json({ error: 'ACCOUNT_EMAIL_REQUIRED' }, { status: 400 });
    }

    const existingSubscription = await checkExistingSubscriptionForCheckout({
      email,
      plan: body.plan,
    });
    if (existingSubscription.exists) {
      return Response.json(
        {
          error:
            existingSubscription.status === 'past_due'
              ? 'This email already has a past-due AI Pro subscription. Please resolve the existing subscription before starting a new checkout.'
              : 'This email already has an active AI Pro subscription.',
        },
        { status: 409 },
      );
    }

    const planConfig = await getPlanConfig(body.plan);
    const existingLicense = await getUserLicenseByUserId(session.user.sub);
    if (!planConfig.includesAiPro && existingLicense) {
      return Response.json(
        { error: 'This account already has a desktop license.' },
        { status: 409 },
      );
    }

    let bundleDesktopLicense = true;
    if (planConfig.includesAiPro) {
      bundleDesktopLicense = existingLicense === null;
    }

    const checkoutSession = await createPaymobCheckoutSession({ plan: body.plan, email, bundleDesktopLicense });
    return Response.json(checkoutSession);
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return apiAuthErrorResponse(err);
    }

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
