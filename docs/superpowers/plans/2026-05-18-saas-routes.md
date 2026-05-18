# SaaS Routes Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not start coding until this plan is reviewed.

**Goal:** Extend `apps/web` from a purchase checkout into a SaaS web app with customer auth, customer dashboard, staff admin panel, owner-only platform config, and route/API authorization.

**Architecture:** Next.js App Router pages and Route Handlers, Supabase Auth for customer/staff sessions, Supabase service-role access for server-side admin queries, Paymob checkout for upgrades, Resend for license-key delivery. Protected page routes use a Next 16 `proxy.ts` JWT gate. Protected APIs independently verify session/role server-side before running business logic.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Auth/Postgres, Paymob, Resend, TypeScript.

**Run checks with:**
```bash
npm run typecheck -w web
npm run build -w web
```

---

## Spec Review Notes

- **Use `proxy.ts`, not `middleware.ts`.** This project uses Next.js 16.2, where request interception should be implemented with `proxy.ts`.
- **Extend the existing Supabase JWT hook.** Supabase can only run one custom access-token hook, and this repo already has `public.custom_access_token_hook` for `licensed`, `ai_pro`, and `credits_remaining`. The role claim must be added to that function instead of creating a separate hook.
- **License-key resend needs deterministic inputs.** Raw license keys are intentionally not stored. To support `/dashboard/license` and `/api/dashboard/resend-key`, store `plan_id` on `licenses` so the deterministic key can be re-derived from `paymob_order_id + email + plan_id`.
- **Revenue summary is estimated at MVP.** There is no payment ledger table in the current spec. Admin revenue summary should be derived from licenses/subscriptions and configured prices. A full payment ledger remains future work unless the spec is expanded.
- **Customer accounts currently have random passwords.** Existing provisioning uses `auth.admin.createUser` with a random password. Customer UI will remain magic-link only; implementation should avoid exposing password login to customers and can later migrate provisioning to passwordless user creation if Supabase permits it cleanly.
- **Soft delete MVP behavior:** Revoke license, cancel subscription, and mark auth user metadata as deleted. Physical deletion and full data erasure are out of scope unless a compliance requirement is added.

---

## File Map

**Supabase migrations:**
- Create `supabase/migrations/20260518000006_platform_config_and_license_plan.sql`
- Create `supabase/migrations/20260518000007_auth_role_claims.sql`

**Web auth/session helpers:**
- Create `apps/web/lib/auth/cookies.ts`
- Create `apps/web/lib/auth/jwt.ts`
- Create `apps/web/lib/auth/session.ts`
- Create `apps/web/lib/auth/guards.ts`
- Create `apps/web/lib/supabase-auth.ts`
- Modify `apps/web/.env.example`
- Modify `apps/web/package.json`

**Web protected routing:**
- Create `apps/web/proxy.ts`
- Create `apps/web/app/forbidden/page.tsx`
- Create `apps/web/app/login/page.tsx`
- Create `apps/web/app/auth/confirm/route.ts`
- Create `apps/web/app/api/auth/magic-link/route.ts`
- Create `apps/web/app/admin/login/page.tsx`
- Create `apps/web/app/api/auth/admin-login/route.ts`
- Create `apps/web/app/api/auth/logout/route.ts`

**Platform config:**
- Create `apps/web/lib/platform-config.ts`
- Modify `apps/web/lib/plans.ts`
- Modify `apps/web/lib/licenses.ts`
- Modify `apps/web/lib/paymob.ts`
- Modify `apps/web/lib/paymob-processing.ts`

**Customer portal:**
- Create `apps/web/app/dashboard/layout.tsx`
- Create `apps/web/app/dashboard/page.tsx`
- Create `apps/web/app/dashboard/license/page.tsx`
- Create `apps/web/app/dashboard/upgrade/page.tsx`
- Create `apps/web/app/dashboard/billing/page.tsx`
- Create `apps/web/app/dashboard/account/page.tsx`
- Create `apps/web/app/api/dashboard/resend-key/route.ts`
- Create `apps/web/app/api/dashboard/cancel-subscription/route.ts`
- Create `apps/web/app/api/dashboard/account/route.ts`

**Admin/owner portal:**
- Create `apps/web/app/admin/layout.tsx`
- Create `apps/web/app/admin/page.tsx`
- Create `apps/web/app/admin/licenses/page.tsx`
- Create `apps/web/app/admin/licenses/[id]/page.tsx`
- Create `apps/web/app/admin/users/page.tsx`
- Create `apps/web/app/admin/users/[id]/page.tsx`
- Create `apps/web/app/admin/subscriptions/page.tsx`
- Create `apps/web/app/admin/platform/page.tsx`
- Create `apps/web/app/api/admin/stats/route.ts`
- Create `apps/web/app/api/admin/licenses/[id]/route.ts`
- Create `apps/web/app/api/admin/users/[id]/impersonate/route.ts`
- Create `apps/web/app/api/admin/platform/route.ts`

---

## Task R1: Add Auth Dependencies And Env

**Files:**
- Modify `apps/web/package.json`
- Modify `apps/web/.env.example`

- [ ] Step 1: Install JWT verification support.

```bash
npm install jose -w web
```

- [ ] Step 2: Add web auth env placeholders.

Add to `apps/web/.env.example`:
```env
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

- [ ] Step 3: Verify install.

```bash
npm run typecheck -w web
```

- [ ] Step 4: Commit.

```bash
git add apps/web/package.json package-lock.json apps/web/.env.example
git commit -m "chore(web): add auth env and jwt dependency"
```

---

## Task R2: Supabase Data Migrations

**Files:**
- Create `supabase/migrations/20260518000006_platform_config_and_license_plan.sql`
- Create `supabase/migrations/20260518000007_auth_role_claims.sql`

- [ ] Step 1: Add platform config and license plan metadata.

Migration `20260518000006_platform_config_and_license_plan.sql`:
- Create `public.platform_config (key text primary key, value text not null, updated_at timestamptz default now())`.
- Seed:
  - `license_amount_cents = 1900`
  - `ai_pro_monthly_amount_cents = 800`
  - `ai_pro_yearly_amount_cents = 5900`
  - `desktop_monthly_ai_credits = 50`
  - `ai_pro_monthly_credits = 500`
  - `free_tier_credits = 0`
- Add `licenses.plan_id text not null default 'desktop_license'`.
- Backfill existing `licenses.plan_id = 'desktop_license'`.
- Add a check constraint for allowed plan ids.

- [ ] Step 2: Update monthly reset cron to read platform config.

Modify `20260518000005_credit_reset_cron.sql` or add a new migration if the existing migration has already shipped remotely:
- License reset uses `desktop_monthly_ai_credits` only for future row creation. Existing `licenses.monthly_ai_credits` remains the source of truth per license.
- Subscription reset sets `credits_remaining` from `platform_config.ai_pro_monthly_credits`.

- [ ] Step 3: Extend the existing JWT hook for staff roles.

Migration `20260518000007_auth_role_claims.sql` replaces `public.custom_access_token_hook` and keeps existing license claims. Add:
- Read role from `auth.users.raw_app_meta_data ->> 'role'`.
- Accept only `admin` or `owner`; otherwise role is omitted/null.
- Add claim at `{role}` and also under `{app_metadata, role}` if needed by the route guard.
- Preserve `licensed`, `ai_pro`, `credits_remaining`.

- [ ] Step 4: Document manual staff setup.

Add SQL comment or README note:
```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"owner"}'::jsonb
where email = 'owner@example.com';
```

- [ ] Step 5: Push migrations.

```bash
npx supabase db push
```

- [ ] Step 6: Commit.

```bash
git add supabase/migrations/
git commit -m "feat(supabase): add platform config and staff role claims"
```

---

## Task R3: Session, JWT, And Guard Helpers

**Files:**
- Create `apps/web/lib/supabase-auth.ts`
- Create `apps/web/lib/auth/cookies.ts`
- Create `apps/web/lib/auth/jwt.ts`
- Create `apps/web/lib/auth/session.ts`
- Create `apps/web/lib/auth/guards.ts`

- [ ] Step 1: Create a lazy Supabase Auth client.

`lib/supabase-auth.ts`:
- Uses `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- Disables persistSession/autoRefresh at module level.
- Never initializes at import time.

- [ ] Step 2: Define session cookies.

`lib/auth/cookies.ts`:
- Cookie names: `sb-access-token`, `sb-refresh-token`.
- HTTP-only, SameSite=Lax, Secure in production.
- Helpers: `setSessionCookies`, `clearSessionCookies`.

- [ ] Step 3: Verify access tokens locally.

`lib/auth/jwt.ts`:
- Uses `jose` and `SUPABASE_JWT_SECRET`.
- Exposes `verifyAccessToken(token)` returning `{ sub, email, role, licensed, aiPro, creditsRemaining, exp }`.
- Does not call Supabase or Postgres.

- [ ] Step 4: Build session helpers.

`lib/auth/session.ts`:
- Reads cookies.
- Verifies access token.
- If expired and refresh token exists, calls Supabase Auth refresh and resets cookies.
- Exposes `getCurrentSession`, `requireSession`, `requireStaff`, `requireOwner`.

- [ ] Step 5: Build API guards.

`lib/auth/guards.ts`:
- `requireApiSession()`
- `requireApiStaff()`
- `requireApiOwner()`
- Returns typed errors for 401/403 route responses.

- [ ] Step 6: Typecheck and commit.

```bash
npm run typecheck -w web
git add apps/web/lib/auth apps/web/lib/supabase-auth.ts
git commit -m "feat(web): add session and role guard helpers"
```

---

## Task R4: Protected Route Proxy

**Files:**
- Create `apps/web/proxy.ts`
- Create `apps/web/app/forbidden/page.tsx`

- [ ] Step 1: Create `proxy.ts`.

Rules:
- `/dashboard/:path*` requires any verified session.
- `/admin/login` remains public.
- `/admin/platform` requires `role === 'owner'`.
- `/admin/:path*` requires `role === 'admin' || role === 'owner'`.
- Unauthenticated dashboard users redirect to `/login`.
- Unauthenticated admin users redirect to `/admin/login`.
- Authenticated non-staff users hitting admin pages redirect to `/forbidden`.

- [ ] Step 2: Add a simple 403 page at `/forbidden`.

- [ ] Step 3: Avoid API-only reliance.

Do not use proxy as the only protection for `/api/admin/*`; route handlers still call guard helpers.

- [ ] Step 4: Verify.

```bash
npm run typecheck -w web
npm run build -w web
```

- [ ] Step 5: Commit.

```bash
git add apps/web/proxy.ts apps/web/app/forbidden
git commit -m "feat(web): add protected route proxy"
```

---

## Task R5: Login And Auth Confirm Flows

**Files:**
- Create `apps/web/app/login/page.tsx`
- Create `apps/web/app/auth/confirm/route.ts`
- Create `apps/web/app/api/auth/magic-link/route.ts`
- Create `apps/web/app/admin/login/page.tsx`
- Create `apps/web/app/api/auth/admin-login/route.ts`
- Create `apps/web/app/api/auth/logout/route.ts`

- [ ] Step 1: Customer login page.

`/login`:
- Email-only form.
- Posts to `/api/auth/magic-link`.
- Shows sent/error state.

- [ ] Step 2: Magic-link API.

`POST /api/auth/magic-link`:
- Validate email.
- Call Supabase `signInWithOtp`.
- Set `emailRedirectTo = ${siteUrl}/auth/confirm`.
- Do not reveal whether an account exists.

- [ ] Step 3: OTP confirm route.

`GET /auth/confirm`:
- Reads `token_hash` and `type`.
- Calls `verifyOtp`.
- Sets session cookies.
- Redirects customers to `/dashboard`.

- [ ] Step 4: Admin login page and API.

`/admin/login`:
- Email/password form.

`POST /api/auth/admin-login`:
- Calls `signInWithPassword`.
- Verifies JWT role is admin/owner before setting cookies.
- Clears session and returns 403 if role is missing.

- [ ] Step 5: Logout API.

`POST /api/auth/logout`:
- Clears session cookies.
- Redirects based on optional `next`.

- [ ] Step 6: Verify and commit.

```bash
npm run typecheck -w web
npm run build -w web
git add apps/web/app/login apps/web/app/auth apps/web/app/api/auth apps/web/app/admin/login
git commit -m "feat(web): add customer and staff auth flows"
```

---

## Task R6: Platform Config Service And Dynamic Plans

**Files:**
- Create `apps/web/lib/platform-config.ts`
- Modify `apps/web/lib/plans.ts`
- Modify `apps/web/lib/licenses.ts`
- Modify `apps/web/lib/paymob.ts`
- Modify `apps/web/lib/paymob-processing.ts`
- Modify `apps/web/lib/subscriptions.ts`

- [ ] Step 1: Create platform config service.

`lib/platform-config.ts`:
- `getPlatformConfig()`
- `getPlatformNumber(key)`
- `updatePlatformConfig(changes)`
- Validates positive integer strings for price/credit keys.

- [ ] Step 2: Make plan helpers async.

Update `getPlanConfig(plan)` to read price and credit values from `platform_config`.

- [ ] Step 3: Update order creation and provisioning.

All call sites await dynamic plan config:
- Paymob amount.
- License `monthly_ai_credits`.
- Subscription `credits_remaining`.
- Duplicate subscription checks.
- Paymob return/webhook plan inference.

- [ ] Step 4: Preserve env fallback only for local bootstrap.

If `platform_config` is missing, fail loudly except in a documented local-dev fallback path.

- [ ] Step 5: Verify and commit.

```bash
npm run typecheck -w web
npm run build -w web
git add apps/web/lib
git commit -m "feat(web): load plans from platform config"
```

---

## Task R7: Customer Dashboard Pages

**Files:**
- Create `apps/web/app/dashboard/layout.tsx`
- Create `apps/web/app/dashboard/page.tsx`
- Create `apps/web/app/dashboard/license/page.tsx`
- Create `apps/web/app/dashboard/upgrade/page.tsx`
- Create `apps/web/app/dashboard/billing/page.tsx`
- Create `apps/web/app/dashboard/account/page.tsx`
- Create `apps/web/lib/dashboard-data.ts`

- [ ] Step 1: Dashboard data helper.

`lib/dashboard-data.ts`:
- `getCustomerDashboard(userId)`
- Loads license, subscription, and recent AI usage.
- Uses service role server-side after session has been verified.

- [ ] Step 2: Shared dashboard layout.

Add navigation tabs:
- Overview
- License
- Upgrade
- Billing
- Account

- [ ] Step 3: Overview page.

Show:
- License status.
- AI credit usage bar.
- AI Pro status.
- Current device name/fingerprint if active.

- [ ] Step 4: License page.

Show:
- Masked license key derived from `paymob_order_id + user email + plan_id`.
- Copy button that reveals/copies only after a user action.
- Re-send key button.
- Basic receipt/download action as MVP text receipt unless Paymob receipt URL is available.

- [ ] Step 5: Upgrade page.

Show plan comparison and call the existing Paymob create-order endpoint for AI Pro plans.

- [ ] Step 6: Billing page.

Show subscription status, renewal date, Paymob subscription/order ids, cancel button.

- [ ] Step 7: Account page.

Show email and danger-zone actions. Email change can be planned as re-auth-only MVP if Supabase email update is not implemented in this pass.

- [ ] Step 8: Verify and commit.

```bash
npm run typecheck -w web
npm run build -w web
git add apps/web/app/dashboard apps/web/lib/dashboard-data.ts
git commit -m "feat(web): add customer dashboard pages"
```

---

## Task R8: Customer Dashboard APIs

**Files:**
- Create `apps/web/app/api/dashboard/resend-key/route.ts`
- Create `apps/web/app/api/dashboard/cancel-subscription/route.ts`
- Create `apps/web/app/api/dashboard/account/route.ts`
- Create `apps/web/lib/paymob-subscriptions.ts`

- [ ] Step 1: Resend key API.

`POST /api/dashboard/resend-key`:
- `requireApiSession`.
- Load user's license.
- Re-derive license key.
- Send via `sendLicenseEmail`.
- Return generic success.

- [ ] Step 2: Paymob subscription helper.

`lib/paymob-subscriptions.ts`:
- `cancelPaymobSubscription(subscriptionId)`.
- Uses env-configured Paymob cancel endpoint or documented Paymob API path.
- Safe no-op if no Paymob subscription id exists; DB still updates.

- [ ] Step 3: Cancel subscription API.

`POST /api/dashboard/cancel-subscription`:
- `requireApiSession`.
- Find active/past_due subscription.
- Call Paymob cancel helper if possible.
- Set `subscriptions.status = 'cancelled'`.

- [ ] Step 4: Account delete API.

`DELETE /api/dashboard/account`:
- `requireApiSession`.
- Revoke license.
- Cancel subscription.
- Update auth user metadata with `deleted_at`.
- Clear session cookies.

- [ ] Step 5: Verify and commit.

```bash
npm run typecheck -w web
npm run build -w web
git add apps/web/app/api/dashboard apps/web/lib/paymob-subscriptions.ts
git commit -m "feat(web): add customer dashboard APIs"
```

---

## Task R9: Admin Shell And Overview

**Files:**
- Create `apps/web/app/admin/layout.tsx`
- Create `apps/web/app/admin/page.tsx`
- Create `apps/web/lib/admin-data.ts`
- Create `apps/web/app/api/admin/stats/route.ts`

- [ ] Step 1: Admin layout.

Navigation:
- Overview
- Licenses
- Users
- Subscriptions
- Platform (visible only to owner)

- [ ] Step 2: Admin data helper.

`lib/admin-data.ts`:
- Aggregate total licenses, active licenses, active subscriptions.
- Estimate revenue from current platform config and counts.
- Recent activity from recent license/subscription rows.

- [ ] Step 3: Overview page.

Server component using `requireStaff`.

- [ ] Step 4: Stats API.

`GET /api/admin/stats`:
- `requireApiStaff`.
- Return same aggregate JSON for future client widgets.

- [ ] Step 5: Verify and commit.

```bash
npm run typecheck -w web
npm run build -w web
git add apps/web/app/admin apps/web/app/api/admin/stats apps/web/lib/admin-data.ts
git commit -m "feat(web): add admin shell and stats"
```

---

## Task R10: Admin License, User, And Subscription Management

**Files:**
- Create `apps/web/app/admin/licenses/page.tsx`
- Create `apps/web/app/admin/licenses/[id]/page.tsx`
- Create `apps/web/app/admin/users/page.tsx`
- Create `apps/web/app/admin/users/[id]/page.tsx`
- Create `apps/web/app/admin/subscriptions/page.tsx`
- Create `apps/web/app/api/admin/licenses/[id]/route.ts`
- Create `apps/web/app/api/admin/users/[id]/impersonate/route.ts`

- [ ] Step 1: Licenses list page.

Filter by:
- status
- plan
- email query

Show:
- email
- status
- plan id
- device name
- credits used/remaining
- created date

- [ ] Step 2: License detail page.

Actions:
- revoke
- reset credits
- change plan/credits

Activation history MVP:
- show current device fingerprint/name and activated_at.

- [ ] Step 3: License PATCH API.

`PATCH /api/admin/licenses/[id]`:
- `requireApiStaff`.
- Validate action.
- Update license/subscription safely.

- [ ] Step 4: Users list/detail.

Use `auth.admin.listUsers` plus license/subscription joins.

- [ ] Step 5: Impersonation API.

`POST /api/admin/users/[id]/impersonate`:
- `requireApiStaff`.
- Generate magic link for target user.
- Return URL for support use.
- Never automatically set staff browser cookies to target user.

- [ ] Step 6: Subscriptions page.

Show:
- active/cancelled/past_due
- renewal date
- Paymob ids
- user email

- [ ] Step 7: Verify and commit.

```bash
npm run typecheck -w web
npm run build -w web
git add apps/web/app/admin apps/web/app/api/admin
git commit -m "feat(web): add admin management routes"
```

---

## Task R11: Owner Platform Config Page And API

**Files:**
- Create `apps/web/app/admin/platform/page.tsx`
- Create `apps/web/app/api/admin/platform/route.ts`

- [ ] Step 1: Owner page.

`/admin/platform`:
- `requireOwner`.
- Render all config rows with labels and descriptions.
- Positive integer inputs for price/credit values.

- [ ] Step 2: Platform API.

`GET /api/admin/platform`:
- `requireApiOwner`.
- Return config rows.

`PATCH /api/admin/platform`:
- `requireApiOwner`.
- Validate keys against allow-list.
- Validate values are positive integer strings, except `free_tier_credits` can be `0`.
- Update changed rows.

- [ ] Step 3: Verify dynamic behavior.

Manual checks:
- Change `license_amount_cents`.
- Start a new checkout.
- Confirm Paymob amount uses updated value.

- [ ] Step 4: Verify and commit.

```bash
npm run typecheck -w web
npm run build -w web
git add apps/web/app/admin/platform apps/web/app/api/admin/platform
git commit -m "feat(web): add owner platform config"
```

---

## Task R12: Final Verification

- [ ] Step 1: Run web static checks.

```bash
npm run typecheck -w web
npm run build -w web
```

- [ ] Step 2: Run existing workspace tests.

```bash
npm test
```

- [ ] Step 3: Manual auth smoke tests.

Customer:
- `/login` sends magic link.
- `/auth/confirm` sets cookies.
- `/dashboard` loads customer data.
- `/api/dashboard/resend-key` sends/logs key.

Staff:
- `/admin/login` rejects customer account.
- `/admin/login` accepts admin/owner account.
- `/admin` loads for admin.
- `/admin/platform` returns 403 for admin and loads for owner.

Payment:
- Existing landing checkout still works.
- AI Pro duplicate subscription check returns 409.
- Paymob return route still provisions.

- [ ] Step 4: Commit any final docs or fixes.

```bash
git status --short
```

Only expected local leftovers should be `.claude/settings.local.json` and generated `*.tsbuildinfo`.

