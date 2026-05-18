import { getEnv, getOptionalEnv } from './env';

export async function sendLicenseEmail(input: {
  to: string;
  licenseKey: string;
  planName: string;
}): Promise<void> {
  const apiKey = getOptionalEnv('RESEND_API_KEY');
  const from = getEnv('EMAIL_FROM', 'KDeck <licenses@example.com>');
  const subject = 'Your KDeck license key';
  const text = [
    'Thanks for buying KDeck.',
    '',
    `License key: ${input.licenseKey}`,
    `Plan: ${input.planName}`,
    '',
    'Open the desktop agent and paste this key in the activation dialog.',
  ].join('\n');

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY is required in production to deliver license keys.');
    }
    console.log(`[web] Dev license email for ${input.to}: ${input.licenseKey}`);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject,
      text,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h1>Your KDeck license</h1>
          <p>Thanks for buying KDeck.</p>
          <p><strong>License key:</strong></p>
          <p style="font-size:20px;font-weight:700;letter-spacing:1px">${escapeHtml(input.licenseKey)}</p>
          <p><strong>Plan:</strong> ${escapeHtml(input.planName)}</p>
          <p>Open the desktop agent and paste this key in the activation dialog.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend email failed (${response.status}): ${(await response.text()).slice(0, 240)}`);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char];
  });
}
