import { NextRequest, NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/env';
import { paymobPayloadFromSearchParams } from '@/lib/paymob-query';
import { verifyPaymobHmac } from '@/lib/paymob-hmac';
import { processPaymobTransactionPayload } from '@/lib/paymob-processing';
import { isPlanId } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const siteUrl = getSiteUrl();
  const params = request.nextUrl.searchParams;
  const payload = paymobPayloadFromSearchParams(params);
  const hmac = params.get('hmac');

  if (!verifyPaymobHmac(payload, hmac)) {
    return NextResponse.redirect(`${siteUrl}/checkout/failure?reason=invalid_hmac`);
  }

  const plan = params.get('plan');
  const email = params.get('email');

  try {
    const result = await processPaymobTransactionPayload(payload, {
      email,
      plan: isPlanId(plan) ? plan : null,
    });

    const statusPath =
      result.status === 'ignored_unsuccessful_transaction'
        ? '/checkout/failure?reason=payment_not_successful'
        : `/checkout/success?order=${encodeURIComponent(result.paymobOrderId ?? '')}&provisioned=${result.status}`;

    return NextResponse.redirect(`${siteUrl}${statusPath}`);
  } catch (err) {
    console.error('[web] Paymob return provisioning failed', err);
    return NextResponse.redirect(`${siteUrl}/checkout/failure?reason=provisioning_failed`);
  }
}
