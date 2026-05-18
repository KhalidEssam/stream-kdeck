# Control Surface Web

Next.js App Router website and serverless API layer for the SaaS licensing cycle.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Fill the Paymob, Supabase service-role, and `LICENSE_KEY_SECRET` values.
3. Run from the repo root:

```bash
npm run web
```

## Serverless routes

- `POST /api/paymob/create-order`
  - Creates a Paymob payment intention from `{ "plan": "desktop_license", "email": "you@example.com" }`.
  - Returns a hosted checkout URL.

- `POST /api/paymob/webhook?hmac=...`
  - Verifies Paymob HMAC-SHA512.
  - Provisions the Supabase Auth user.
  - Inserts the `licenses` row.
  - Sends the deterministic license key by email.

- `POST /api/paymob/subscription-webhook?hmac=...`
  - Verifies Paymob HMAC-SHA512.
  - Updates existing `subscriptions` rows for renewal/cancel/past-due events.

The webhook derives the same license key for webhook retries using `LICENSE_KEY_SECRET`,
Paymob order id, email, and plan, while storing only `SHA-256(licenseKey)` in Supabase.
