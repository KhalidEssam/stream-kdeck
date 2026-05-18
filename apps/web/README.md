# KDeck Web

Next.js App Router website and serverless API layer for the SaaS licensing cycle.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Fill the Paymob, Supabase service-role, and `LICENSE_KEY_SECRET` values.
3. Run from the repo root:

```bash
npm run web
```

`PAYMOB_CARD_INTEGRATION_ID` must be copied from Paymob Dashboard under
Developers -> Payment Integrations. It must belong to the same Paymob
account/mode as `PAYMOB_SECRET_KEY`; a test key with a live integration id, or
the sample value from `.env.example`, will make Paymob return a 404.

## Serverless routes

- `POST /api/paymob/create-order`
  - Creates a Paymob payment intention from `{ "plan": "desktop_license", "email": "you@example.com" }`.
  - For AI Pro plans, checks Supabase `subscriptions` first and refuses duplicate active/past-due subscriptions for the same email.
  - Returns a hosted checkout URL.

- `POST /api/paymob/webhook?hmac=...`
  - Verifies Paymob HMAC-SHA512.
  - Provisions the Supabase Auth user.
  - Inserts the `licenses` row.
  - Sends the deterministic license key by email.

- `GET /api/paymob/return?...&hmac=...`
  - Browser return URL for Paymob hosted checkout.
  - Verifies Paymob HMAC-SHA512.
  - Provisions idempotently, then redirects to a clean success/failure page.
  - Useful during local/ngrok testing; production should still rely on the webhook
    as the source of truth.

- `POST /api/paymob/subscription-webhook?hmac=...`
  - Verifies Paymob HMAC-SHA512.
  - Updates existing `subscriptions` rows for renewal/cancel/past-due events.

The webhook derives the same license key for webhook retries using `LICENSE_KEY_SECRET`,
Paymob order id, email, and plan, while storing only `SHA-256(licenseKey)` in Supabase.
