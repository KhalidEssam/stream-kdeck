# SaaS Licensing & Subscription System — Design Spec
**Date:** 2026-05-18
**Status:** Approved

---

## 0. Context

The Control Surface Platform currently runs without any license enforcement — anyone with access to the agent and mobile app has full functionality without purchasing. This spec defines the licensing and subscription system that gates access, tracks AI credit quotas, and drives the MRR story for investors.

Reference: core product decisions at `docs/superpowers/specs/2026-05-13-control-surface-platform-design.md` (Section 3).

---

## 1. Pricing Model

| Tier | Price | Channel | AI credits/month | What it unlocks |
|---|---|---|---|---|
| No license | — | — | 0 | Nothing (mobile shows purchase gate) |
| Desktop License | $19 one-time | Own website | 50 calls/month | Full deck + limited AI |
| AI Pro Subscription | $8/month or $59/year | Own website | 500 calls/month | Higher AI quota |

- No free functional tier at launch.
- AI features are **accessible** to all licensed users at a limited quota — not hard-locked behind AI Pro.
- AI Pro is an upsell on quota, not a feature gate.
- Payment processor: **Paymob** (primary — MENA region support).

---

## 2. Architecture Overview

Three subsystems integrate with the existing agent + mobile codebase:

**Purchase + provisioning (website)**
User visits Next.js marketing site → Paymob checkout → webhook → Supabase Edge Function creates Supabase Auth user + license record → license key emailed to user.

**Agent activation (desktop)**
User pastes license key into tray dialog → Agent sends key + device fingerprint to Supabase Edge Function → Supabase validates key, registers fingerprint, returns refresh token → Agent stores refresh token in keytar → On every startup, silently exchanges token for a JWT containing license + subscription claims.

**Mobile gating (mobile)**
On WebSocket connect, agent sends `LICENSE_STATUS` message → Mobile reacts to `licensed` / `aiPro` / `creditsRemaining` fields → Shows gate screen, credit counters, or upsell sheet accordingly.

```
Website (Next.js)     Supabase (Auth + DB)     Desktop Agent          Mobile App
      │                       │                       │                    │
 Paymob checkout ──────► webhook                      │                    │
      │              creates user + license key        │                    │
      │              emails key to user                │                    │
      │                       │                       │                    │
      │                       │◄── activate(key, fp) ─┤ tray dialog        │
      │                       │    returns refresh tk  │                    │
      │                       │                       │ stores in keytar   │
      │                       │                       │                    │
      │                       │                       │◄─── WS connect ────│
      │                       │                       │──► LICENSE_STATUS ─►│
      │                       │                       │    {licensed,aiPro} │
```

---

## 3. Data Model

All tables in Supabase PostgreSQL with Row Level Security.

### `licenses`
```sql
id                 uuid primary key default gen_random_uuid()
user_id            uuid references auth.users not null
key_hash           text unique not null        -- SHA-256 of raw key; raw key never stored
status             text not null default 'unused'  -- 'unused' | 'active' | 'revoked'
monthly_ai_credits int not null default 50     -- the monthly cap (never changes)
credits_used       int not null default 0      -- resets to 0 on the 1st of each month
credits_reset_at   timestamptz                 -- next reset date; set on activation
paymob_order_id    text unique                 -- for webhook idempotency
device_fingerprint text                        -- null until activated
device_name        text                        -- e.g. "DESKTOP-XYZ" for support
activated_at       timestamptz
created_at         timestamptz default now()
```

### `subscriptions`
```sql
id                      uuid primary key default gen_random_uuid()
user_id                 uuid references auth.users not null
paymob_subscription_id  text unique
paymob_order_id         text unique            -- for webhook idempotency
plan                    text not null           -- 'ai_pro'
status                  text not null           -- 'active' | 'cancelled' | 'past_due'
credits_remaining       int not null default 500
credits_reset_at        timestamptz
current_period_end      timestamptz
created_at              timestamptz default now()
```

### `ai_usage_log`
```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid references auth.users not null
used_at     timestamptz default now()
tokens_in   int
tokens_out  int
provider    text                                -- 'gemini' | 'deepseek' | 'claude' | etc.
```

### JWT custom claims (via Supabase JWT hook)
```json
{
  "licensed": true,
  "ai_pro": false,
  "credits_remaining": 42
}
```

**JWT hook logic for `credits_remaining`:**
- If user has an active `subscriptions` row (`status = 'active'`): use `subscriptions.credits_remaining`
- Otherwise: use `licenses.monthly_ai_credits - licenses.credits_used`
- If no active license: `licensed = false`, `credits_remaining = 0`

Agent reads these claims at startup — no extra DB call needed for per-request license checks. Claims refresh hourly on token rotation.

**Monthly credit reset:** A Supabase scheduled function (pg_cron) runs on the 1st of each month:
- Resets `licenses.credits_used = 0` for all active licenses where `credits_reset_at <= now()`
- Resets `subscriptions.credits_remaining = 500` for all active subscriptions where `credits_reset_at <= now()`
- Advances `credits_reset_at` by one month

---

## 4. Key Flows

### 4.1 Purchase flow
```
1. User visits website → clicks "Buy License" ($19) or "Buy AI Pro" ($8/mo)
2. Next.js calls Paymob API server-side:
   a. POST /api/paymob/create-order → creates order, gets order_id
   b. POST Paymob payment-key endpoint → gets payment_key
   c. Returns Paymob iframe URL to client
3. User completes payment in Paymob hosted iframe
4. Paymob fires callback to POST /api/paymob/webhook:
   a. Verify HMAC-SHA512 signature
   b. Check paymob_order_id not already processed (idempotency)
   c. Create Supabase Auth user (email from order metadata)
   d. Generate license key: crypto.randomUUID() → store SHA-256 hash
   e. Insert licenses row { user_id, key_hash, status: 'unused', monthly_ai_credits: 50 }
   f. If AI Pro: also insert subscriptions row
   g. Send transactional email: "Your license key: XXXX-XXXX-XXXX-XXXX"
```

### 4.2 Agent activation flow
```
1. Agent starts → checks keytar for refresh token → none found
2. Auto-opens activation dialog (small Electron BrowserWindow)
3. User pastes key → clicks Activate
4. Agent calls Supabase Edge Function POST /licenses/activate:
   Body: { key, deviceFingerprint, deviceName }
   a. SHA-256(key) → find license row
   b. Check status === 'unused'
   c. Set status='active', device_fingerprint, device_name, activated_at
   d. Return Supabase refresh token for that user's account
5. Agent stores refresh token in keytar → closes dialog
6. Agent exchanges refresh token for JWT → reads claims
7. On every subsequent startup: silently exchange token → no dialog shown
```

### 4.3 Mobile gating flow
```
1. Mobile connects via WebSocket
2. Agent immediately sends:
   { type: "LICENSE_STATUS", licensed, aiPro, creditsRemaining }
3. Mobile reacts:
   - licensed: false
     → show LicenseGateScreen (buy link + "Activate on Desktop" button)
   - licensed: true, creditsRemaining: 0
     → full deck shown; AI tile tap → upsell bottom sheet to AI Pro
   - licensed: true, creditsRemaining > 0
     → full deck, AI tiles show credit counter badge
4. "Activate on Desktop" button sends:
   { type: "OPEN_ACTIVATION_DIALOG" } → agent opens dialog on desktop
```

### 4.4 AI quota flow
```
1. Mobile taps AI tile → sends BUTTON_TAP to agent
2. Agent reads JWT claims: creditsRemaining > 0?
3. If 0 → sends { type: "AI_QUOTA_EXCEEDED", reason: 'credits_exhausted' }
4. If ok:
   a. Runs AI call via AiRouterService
   b. On completion: decrement credits in Supabase
      - Base license: increment licenses.credits_used by 1
      - AI Pro: decrement subscriptions.credits_remaining by 1
   c. Append ai_usage_log row
5. JWT refreshes hourly → credits_remaining claim stays current
```

---

## 5. New WebSocket Message Types

Added to the shared schema (`packages/shared/src/schema.ts`):

**Agent → Mobile:**
```typescript
{ type: 'LICENSE_STATUS'; licensed: boolean; aiPro: boolean; creditsRemaining: number }
{ type: 'AI_QUOTA_EXCEEDED'; reason: 'credits_exhausted' | 'no_subscription' }
```

**Mobile → Agent:**
```typescript
{ type: 'OPEN_ACTIVATION_DIALOG' }
{ type: 'GET_LICENSE_STATUS' }
```

---

## 6. Component Breakdown

### Desktop Agent — new `LicenseModule`

| File | Responsibility |
|---|---|
| `license/device-fingerprint.service.ts` | SHA-256 of MAC address + hostname. Deterministic across reboots. |
| `license/license.service.ts` | Stores/retrieves refresh token from keytar. Exchanges for JWT on startup. Exposes `isLicensed()`, `isAiPro()`, `creditsRemaining()`. |
| `license/activation-dialog.service.ts` | Opens Electron `BrowserWindow` (small modal HTML form). Handles key submission → calls Edge Function → stores refresh token → closes. |
| `license/license.module.ts` | NestJS module wiring. |

### Desktop Agent — existing file changes

| File | Change |
|---|---|
| `ws.gateway.ts` | Send `LICENSE_STATUS` on every new WebSocket connection. Handle `OPEN_ACTIVATION_DIALOG` → call `ActivationDialogService.open()`. Handle `GET_LICENSE_STATUS` → re-send status. |
| `command.service.ts` | Before `AI_CLIPBOARD` execution: call `licenseService.creditsRemaining()` → return `AI_QUOTA_EXCEEDED` if 0. |
| `ai-router.service.ts` | After successful AI call: decrement credits in Supabase + append `ai_usage_log`. |
| `app.module.ts` | Register `LicenseModule`. |

### Mobile App — new screens

| File | Responsibility |
|---|---|
| `screens/AuthScreen.tsx` | Supabase Auth email/password login + signup. Shown before WebSocket connection is attempted. |
| `screens/LicenseGateScreen.tsx` | Shown when agent sends `licensed: false`. Buy link + "Activate on Desktop" button. |

### Mobile App — existing file changes

| File | Change |
|---|---|
| `services/websocket.service.ts` | Handle `LICENSE_STATUS` and `AI_QUOTA_EXCEEDED` message types. Add `onLicenseStatus` callback. |
| `screens/DeckScreen.tsx` | Listen for `LICENSE_STATUS` on connect. Conditionally render `LicenseGateScreen`. |
| `components/AppTile.tsx` | AI tiles show `credits_remaining` counter badge. Tap at 0 credits → upsell bottom sheet instead of action. |

### Website (Next.js/Vercel) — new API routes

| Route | Responsibility |
|---|---|
| `POST /api/paymob/create-order` | Server-side: create Paymob order + payment key. Return iframe URL. |
| `POST /api/paymob/webhook` | Verify HMAC-SHA512 → create Supabase Auth user → generate + email license key. Idempotent by `paymob_order_id`. |
| `POST /api/paymob/subscription-webhook` | Handle recurring billing events (deactivation, renewal) → update `subscriptions.status` + reset credits. |

### Supabase

| Artifact | Responsibility |
|---|---|
| Edge Function `POST /licenses/activate` | Validate key hash, check `status === 'unused'`, register device fingerprint, return refresh token. |
| Edge Function `POST /licenses/transfer` | Support-only: clear `device_fingerprint`, reset `status` to `'unused'`. Requires service role key. |
| JWT hook | Embed `licensed`, `ai_pro`, `credits_remaining` into every issued JWT. |
| Migration 001 | Create `licenses` table + RLS policies. |
| Migration 002 | Create `subscriptions` table + RLS policies. |
| Migration 003 | Create `ai_usage_log` table + RLS policies. |

---

## 7. Error Handling & Edge Cases

### License activation errors

| Scenario | Edge Function response | Agent dialog behavior |
|---|---|---|
| Key already active on different device | `DEVICE_MISMATCH` | "This key is registered to another machine. Contact support to transfer." |
| Invalid / malformed key | `INVALID_KEY` | Inline error, dialog stays open |
| Key revoked | `REVOKED` | "License revoked. Contact support." |
| Network unreachable | Timeout | "Check your connection and try again." |

### Offline after activation
JWT claims cached locally (in keytar alongside refresh token). Agent uses cached claims for up to 24 hours. AI credit decrements are queued locally and flushed when connectivity returns. After 3 failed flush retries, AI features are soft-disabled with a "Sync failed" indicator sent to mobile via `LICENSE_STATUS`.

### JWT refresh token expired or revoked
Agent attempts re-exchange on startup → fails → clears keytar → re-opens activation dialog → mobile receives `LICENSE_STATUS { licensed: false }`.

### Hardware fingerprint changes (OS reinstall, motherboard swap)
Activation fails with `DEVICE_MISMATCH`. Manual support operation: support clears `device_fingerprint` and resets `status` to `'unused'` via the transfer Edge Function. No self-serve device transfer at MVP.

### AI Pro subscription lapses
Paymob `subscription.deactivated` webhook → `subscriptions.status = 'cancelled'` → next JWT refresh sets `ai_pro: false`, `credits_remaining` falls back to `licenses.monthly_ai_credits` (50). No mid-session interruption.

### Paymob webhook duplicate delivery
Edge Function checks `paymob_order_id` existence before creating any records. Idempotent.

---

## 8. Intentionally Deferred (post-MVP)

- Self-serve device transfer (no support ticket needed)
- Multiple device licenses (e.g. home + work desktop)
- Team/org licensing
- BYOK bypass of AI quota (noted in core spec, wired up later)
- In-app credit top-up without subscription
- Lifetime deal provisioning flow (manual for first 500 early adopters)
