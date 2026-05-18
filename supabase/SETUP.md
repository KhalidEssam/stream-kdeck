# Supabase Manual Setup Steps

These steps cannot be automated via migrations and must be done once in the
Supabase Dashboard after the migrations have been applied.

---

## 1. Register the custom JWT hook (CRITICAL)

Without this step every JWT lacks `staff_role`, `licensed`, `ai_pro`, and
`credits_remaining` claims. Staff login will fail (role is null → 403) and
the customer dashboard will always show "not licensed."

1. Open the project in the Supabase Dashboard.
2. Go to **Authentication → Hooks**.
3. Click **Add hook** next to **"Customize Access Token (JWT)"**.
4. Choose **Postgres function** and select `public.custom_access_token_hook`.
5. Save.

To create the first owner account after wiring the hook:

```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role":"owner"}'::jsonb
WHERE email = 'your-owner@example.com';
```

The next sign-in for that user will produce a JWT with `staff_role: "owner"`.

---

## 2. Enable the pg_cron extension (required for credit resets)

1. Go to **Database → Extensions**.
2. Search for `pg_cron` and enable it.

The `20260518000005_credit_reset_cron.sql` migration creates a nightly cron
job that resets credits. It will silently fail to register if pg_cron is not
enabled before the migration runs. Re-run the migration after enabling it.

---

## 3. Environment variables checklist

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Project Settings → API → anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role key |
| `SUPABASE_JWT_SECRET` | Project Settings → API → JWT Secret → Reveal |
| `LICENSE_KEY_SECRET` | Generate: `openssl rand -hex 32` |
