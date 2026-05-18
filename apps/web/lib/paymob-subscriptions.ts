import { getEnv, getOptionalEnv } from './env';

export async function cancelPaymobSubscription(subscriptionId: string | null | undefined): Promise<void> {
  if (!subscriptionId) return;

  const template = getOptionalEnv('PAYMOB_SUBSCRIPTION_CANCEL_URL_TEMPLATE');
  if (!template) {
    console.warn('[web] PAYMOB_SUBSCRIPTION_CANCEL_URL_TEMPLATE not set; marking subscription cancelled locally only.');
    return;
  }

  const url = template.replace('{subscriptionId}', encodeURIComponent(subscriptionId));
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `${getEnv('PAYMOB_AUTH_SCHEME', 'Token')} ${getEnv('PAYMOB_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paymob subscription cancel failed (${response.status}): ${text.slice(0, 240)}`);
  }
}
