# SaaS Routes Design — Control Surface Web App

**Date:** 2026-05-18
**Status:** Approved

## Overview

Extend the Next.js web app from a purchase-only landing page into a full production SaaS platform. Adds a customer self-service portal, a two-tier staff panel (admin + owner), and a database-driven platform config system. No additional infrastructure — all within the existing Next.js + Supabase + Paymob stack.

---

## 1. Auth & Roles

### Two sign-in flows, one Supabase project

**Customers** — magic link only.
- `/login` — email field, submits to Supabase `signInWithOtp`
- `/auth/confirm` — handles `token_hash` OTP verification, redirects to `/dashboard`
- No password ever stored for customers

**Admin / Owner** — email + password.
- `/admin/login` — standard email + password form, Supabase `signInWithPassword`
- Accounts pre-created manually; customers never see this route
- A Postgres function fires on every sign-in via a Supabase auth hook and stamps `role: 'admin' | 'owner'` into the JWT `app_metadata`
- Supabase access token TTL set to **15 minutes** so role changes propagate within one refresh cycle

### Next.js middleware (JWT-only, no DB call per request)

Reads the `sb-access-token` cookie and checks JWT claims:

| Path prefix | Requirement |
|---|---|
| `/dashboard/*` | Any valid Supabase session |
| `/admin/*` | JWT claim `role === 'admin'` or `'owner'` |
| `/admin/platform` | JWT claim `role === 'owner'` only |

Unauthenticated requests redirect to `/login` (customers) or `/admin/login` (staff). A customer hitting `/admin/*` gets a 403 page — not a redirect to login.

### API defense-in-depth

All `/api/admin/*` routes re-verify the JWT claim server-side regardless of middleware, preventing token forgery from reaching business logic.

---

## 2. Customer Portal

All routes under `/dashboard/*`. Requires any valid Supabase session.

After magic link confirms, the session `user_id` is used to look up the customer's row in `licenses` (and `subscriptions` if applicable). No password stored; re-auth for sensitive actions (cancel, delete) sends a fresh magic link.

### Pages

| Route | Purpose |
|---|---|
| `/dashboard` | Overview: license status, AI credit usage bar, subscription status |
| `/dashboard/license` | Show license key (masked by default), copy button, download-receipt link, re-send key to email |
| `/dashboard/upgrade` | Upgrade from Desktop License → AI Pro; plan comparison table, triggers Paymob `create-order` |
| `/dashboard/billing` | Active subscription: plan, next renewal date, cancel button |
| `/dashboard/account` | Change email (magic link re-auth), danger zone: delete account |

### API routes

| Route | Method | Action |
|---|---|---|
| `/api/dashboard/resend-key` | POST | Look up license by `user_id`, re-send via Resend |
| `/api/dashboard/cancel-subscription` | POST | Call Paymob cancel API, set `subscriptions.status = 'cancelled'` |
| `/api/dashboard/account` | DELETE | Soft-delete user, revoke license, cancel subscription |

---

## 3. Admin Panel

All routes under `/admin/*`. Requires JWT claim `role === 'admin'` or `'owner'`. Accessed via `/admin/login` (email + password).

### Pages

| Route | Purpose |
|---|---|
| `/admin` | Dashboard: total licenses sold, active subscriptions, revenue summary, recent activity feed |
| `/admin/licenses` | Table of all licenses — status, plan, device, credits used/remaining, created date. Filterable by status/plan. |
| `/admin/licenses/[id]` | Single license: revoke, reset credits, change plan, view activation history |
| `/admin/users` | Table of all auth users — email, plan, signup date, last seen |
| `/admin/users/[id]` | Single user: linked license, subscription, impersonate (generate magic link for support) |
| `/admin/subscriptions` | Table of active/cancelled subscriptions, renewal dates, Paymob subscription IDs |

### API routes

| Route | Method | Action |
|---|---|---|
| `/api/admin/licenses/[id]` | PATCH | Revoke, reset credits, or change plan |
| `/api/admin/users/[id]/impersonate` | POST | Generate magic link for the user (support tool) |
| `/api/admin/stats` | GET | Aggregate counts for the overview dashboard |

---

## 4. Platform Owner Dashboard

Route `/admin/platform`. Requires JWT claim `role === 'owner'` only. Admins hitting this route get a 403.

### platform_config table

Replaces hardcoded env vars for prices and credit limits. Schema:

```sql
create table platform_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);
```

Seed rows:

| key | initial value | meaning |
|---|---|---|
| `license_amount_cents` | `1900` | Desktop license price |
| `ai_pro_monthly_amount_cents` | `800` | AI Pro monthly price |
| `ai_pro_yearly_amount_cents` | `5900` | AI Pro yearly price |
| `desktop_monthly_ai_credits` | `50` | Credits for desktop-only plan |
| `ai_pro_monthly_credits` | `500` | Credits for AI Pro plan |
| `free_tier_credits` | `0` | Credits for free tier (future) |

The `/admin/platform` page renders a labeled settings form. On save, changed rows are written via `PATCH /api/admin/platform` using the service role key. Changes take effect on the next order creation or credit reset — no redeploy needed.

`lib/plans.ts` and `lib/licenses.ts` are updated to read from `platform_config` at request time instead of `process.env`.

### API routes

| Route | Method | Action |
|---|---|---|
| `/api/admin/platform` | GET | Return all config rows |
| `/api/admin/platform` | PATCH | Update one or more rows; server validates values are positive integers |

---

## 5. Data Model Changes

- **`platform_config`** — new table (see above)
- **`licenses`** — no schema change; `monthly_ai_credits` column already exists and will be populated from `platform_config` at order time
- **`subscriptions`** — no schema change; `credits_remaining` populated from `platform_config` at order time
- **Supabase auth hook** — new Postgres function to stamp `role` into JWT `app_metadata` on sign-in

---

## 6. Route Map Summary

```
/                          Landing page (existing)
/login                     Customer magic link
/auth/confirm              OTP callback
/admin/login               Staff email+password

/dashboard                 Customer overview
/dashboard/license         Key management
/dashboard/upgrade         Plan upgrade
/dashboard/billing         Subscription management
/dashboard/account         Account settings

/admin                     Admin overview
/admin/licenses            License table
/admin/licenses/[id]       License detail + actions
/admin/users               User table
/admin/users/[id]          User detail + impersonate
/admin/subscriptions       Subscription table
/admin/platform            Owner-only: platform config

/api/dashboard/*           Customer API routes
/api/admin/*               Staff API routes (role-checked)
```

---

## 7. Out of Scope

- Mobile app changes
- Paymob webhook changes (existing handlers unchanged)
- Email template redesign
- Multi-currency support
- Audit log UI (data exists in DB but no UI page in this spec)
