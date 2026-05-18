import crypto from 'crypto';
import { getEnv, getOptionalEnv, getSiteUrl } from './env';
import { getPlanConfig, PlanId } from './plans';

export interface PaymobCheckoutSession {
  reference: string;
  clientSecret: string;
  checkoutUrl: string;
}

interface PaymobIntentionResponse {
  id?: string | number;
  client_secret?: string;
  clientSecret?: string;
  [key: string]: unknown;
}

export async function createPaymobCheckoutSession(input: {
  plan: PlanId;
  email: string;
}): Promise<PaymobCheckoutSession> {
  const siteUrl = getSiteUrl();
  const plan = getPlanConfig(input.plan);
  const reference = createReference(input.plan);
  const currency = getEnv('PAYMOB_CURRENCY', 'USD');
  const integrationIds = getPaymentMethodIds();

  const payload = {
    amount: plan.amountCents,
    currency,
    payment_methods: integrationIds,
    special_reference: reference,
    merchant_order_id: reference,
    notification_url: `${siteUrl}/api/paymob/webhook`,
    redirection_url: `${siteUrl}/checkout/success?order=${encodeURIComponent(reference)}`,
    extras: {
      plan: input.plan,
      email: input.email,
      reference,
    },
    billing_data: {
      first_name: 'Control',
      last_name: 'Surface',
      email: input.email,
      phone_number: '+10000000000',
      apartment: 'NA',
      floor: 'NA',
      street: 'NA',
      building: 'NA',
      shipping_method: 'NA',
      postal_code: '00000',
      city: 'NA',
      country: 'NA',
      state: 'NA',
    },
    customer: {
      first_name: 'Control',
      last_name: 'Surface',
      email: input.email,
    },
    items: [
      {
        name: plan.name,
        amount: plan.amountCents,
        description: plan.name,
        quantity: 1,
      },
    ],
  };

  const baseUrl = getEnv('PAYMOB_BASE_URL', 'https://accept.paymob.com').replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/v1/intention/`, {
    method: 'POST',
    headers: {
      Authorization: `${getEnv('PAYMOB_AUTH_SCHEME', 'Token')} ${getEnv('PAYMOB_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  const data = safeJsonParse<PaymobIntentionResponse>(responseText);
  if (!response.ok) {
    throw new Error(`Paymob intention failed (${response.status}): ${responseText.slice(0, 240)}`);
  }

  const clientSecret = data?.client_secret ?? data?.clientSecret;
  if (!clientSecret) {
    throw new Error('Paymob intention response did not include client_secret.');
  }

  return {
    reference,
    clientSecret,
    checkoutUrl: buildCheckoutUrl(clientSecret),
  };
}

export function buildCheckoutUrl(clientSecret: string): string {
  const publicKey = getEnv('NEXT_PUBLIC_PAYMOB_PUBLIC_KEY');
  const template =
    getOptionalEnv('PAYMOB_CHECKOUT_URL_TEMPLATE') ??
    'https://accept.paymob.com/unifiedcheckout/?publicKey={publicKey}&clientSecret={clientSecret}';

  return template
    .replace('{publicKey}', encodeURIComponent(publicKey))
    .replace('{clientSecret}', encodeURIComponent(clientSecret));
}

function createReference(plan: PlanId): string {
  return `cs_${plan}_${crypto.randomUUID()}`;
}

function getPaymentMethodIds(): number[] {
  const raw = getEnv('PAYMOB_CARD_INTEGRATION_ID');
  return raw
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
