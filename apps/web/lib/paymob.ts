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
  const paymentMethods = getPaymentMethods();

  const payload = {
    amount: plan.amountCents,
    currency,
    payment_methods: paymentMethods,
    special_reference: reference,
    merchant_order_id: reference,
    notification_url: `${siteUrl}/api/paymob/webhook`,
    redirection_url:
      `${siteUrl}/api/paymob/return?reference=${encodeURIComponent(reference)}` +
      `&plan=${encodeURIComponent(input.plan)}` +
      `&email=${encodeURIComponent(input.email)}`,
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
    if (response.status === 404 && responseText.includes('Integration ID')) {
      throw new Error(
        'Invalid Paymob integration id. Set PAYMOB_CARD_INTEGRATION_ID in apps/web/.env.local to an enabled integration ID from Paymob Dashboard -> Developers -> Payment Integrations, using the same Paymob account/mode as PAYMOB_SECRET_KEY.',
      );
    }
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

function getPaymentMethods(): Array<number | string> {
  const raw = getEnv('PAYMOB_CARD_INTEGRATION_ID');
  if (raw.trim() === '123456' || raw.includes('your-paymob')) {
    throw new Error(
      'PAYMOB_CARD_INTEGRATION_ID is still a placeholder. Copy the card integration ID from Paymob Dashboard -> Developers -> Payment Integrations.',
    );
  }

  const values = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const numeric = Number.parseInt(part, 10);
      return String(numeric) === part ? numeric : part;
    });

  if (values.length === 0) {
    throw new Error('PAYMOB_CARD_INTEGRATION_ID must contain at least one Paymob integration ID.');
  }

  return values;
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
