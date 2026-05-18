# SaaS Licensing — Backend (Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Supabase database tables, JWT custom claims hook, monthly credit reset cron, and the license activation Edge Function that the desktop agent calls after a user pastes their license key.

**Architecture:** Three PostgreSQL tables with RLS policies. A PostgreSQL function hooks into Supabase Auth to embed `licensed`, `ai_pro`, and `credits_remaining` into every JWT. A Deno Edge Function (`/licenses/activate`) validates the key hash, registers the device fingerprint, and returns a magic-link `hashed_token` the agent exchanges for a session. Two pg_cron jobs reset monthly credit counters on the 1st of each month.

**Tech Stack:** Supabase CLI, PostgreSQL 15+, pg_cron extension, Deno (Edge Functions), TypeScript

**Pre-requisites:**
- Supabase project already created in the dashboard
- `supabase` CLI installed: `npm install -g supabase`
- Logged in: `supabase login`
- Project linked to this repo: `supabase link --project-ref <your-project-ref>` (run from repo root)
- pg_cron extension enabled in the Supabase dashboard (Database → Extensions → pg_cron)

---

### Task B1: Add new WebSocket message types to shared schema

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Modify: `apps/mobile/src/types/schema.ts`

- [ ] **Step 1: Add 4 new interfaces and update both union types in `packages/shared/src/schema.ts`**

Replace the `AgentMessage` and `MobileMessage` unions at the bottom of the file. Add the four new interfaces above the unions:

```typescript
// --- new interfaces (add before the AgentMessage union) ---

export interface LicenseStatusMessage {
  type: 'LICENSE_STATUS';
  licensed: boolean;
  aiPro: boolean;
  creditsRemaining: number;
}

export interface AiQuotaExceededMessage {
  type: 'AI_QUOTA_EXCEEDED';
  reason: 'credits_exhausted';
}

export interface OpenActivationDialogMessage {
  type: 'OPEN_ACTIVATION_DIALOG';
}

export interface GetLicenseStatusMessage {
  type: 'GET_LICENSE_STATUS';
}

// --- replace the existing AgentMessage union ---
export type AgentMessage =
  | ActionResultMessage
  | ConnectedMessage
  | DeckConfigMessage
  | SearchAppsResultMessage
  | ValidatePathResultMessage
  | LicenseStatusMessage
  | AiQuotaExceededMessage;

// --- replace the existing MobileMessage union ---
export type MobileMessage =
  | ButtonTapMessage
  | AddTileMessage
  | RemoveTileMessage
  | SetTilePinnedMessage
  | SearchAppsMessage
  | ValidatePathMessage
  | OpenActivationDialogMessage
  | GetLicenseStatusMessage;
```

- [ ] **Step 2: Apply the identical change to `apps/mobile/src/types/schema.ts`**

This file is a mirror of the shared package. Apply exactly the same additions and union replacements as Step 1.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd packages/shared && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schema.ts apps/mobile/src/types/schema.ts
git commit -m "feat: add LICENSE_STATUS, AI_QUOTA_EXCEEDED, OPEN_ACTIVATION_DIALOG schema types"
```

---

### Task B2: Supabase migrations — three tables

**Files:**
- Create: `supabase/migrations/20260518000001_licenses.sql`
- Create: `supabase/migrations/20260518000002_subscriptions.sql`
- Create: `supabase/migrations/20260518000003_ai_usage_log.sql`

- [ ] **Step 1: Initialize Supabase directory (skip if already exists)**

```bash
supabase init
```

Expected: creates `supabase/` directory with `config.toml`. If directory already exists, this is a no-op.

- [ ] **Step 2: Create the licenses migration**

Create `supabase/migrations/20260518000001_licenses.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.licenses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash           text UNIQUE NOT NULL,
  status             text NOT NULL DEFAULT 'unused'
                       CHECK (status IN ('unused', 'active', 'revoked')),
  monthly_ai_credits int  NOT NULL DEFAULT 50,
  credits_used       int  NOT NULL DEFAULT 0,
  credits_reset_at   timestamptz,
  paymob_order_id    text UNIQUE,
  device_fingerprint text,
  device_name        text,
  activated_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read their own license
CREATE POLICY "users_select_own_license"
  ON public.licenses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Atomic credit increment (called after each AI action)
CREATE OR REPLACE FUNCTION public.increment_license_credits_used()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.licenses
  SET credits_used = credits_used + 1
  WHERE user_id = auth.uid()
    AND status = 'active'
    AND credits_used < monthly_ai_credits;
$$;
```

- [ ] **Step 3: Create the subscriptions migration**

Create `supabase/migrations/20260518000002_subscriptions.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paymob_subscription_id  text UNIQUE,
  paymob_order_id         text UNIQUE,
  plan                    text NOT NULL DEFAULT 'ai_pro'
                            CHECK (plan IN ('ai_pro')),
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'cancelled', 'past_due')),
  credits_remaining       int  NOT NULL DEFAULT 500,
  credits_reset_at        timestamptz,
  current_period_end      timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Atomic credit decrement (called after each AI action for Pro users)
CREATE OR REPLACE FUNCTION public.decrement_subscription_credits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.subscriptions
  SET credits_remaining = GREATEST(0, credits_remaining - 1)
  WHERE user_id = auth.uid()
    AND status = 'active';
$$;
```

- [ ] **Step 4: Create the ai_usage_log migration**

Create `supabase/migrations/20260518000003_ai_usage_log.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_at    timestamptz NOT NULL DEFAULT now(),
  tokens_in  int,
  tokens_out int,
  provider   text
);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_usage"
  ON public.ai_usage_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_usage"
  ON public.ai_usage_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Index for per-user usage queries
CREATE INDEX ai_usage_log_user_used_at ON public.ai_usage_log(user_id, used_at DESC);
```

- [ ] **Step 5: Push migrations to Supabase**

```bash
supabase db push
```

Expected output: each migration applied in order, no errors.

- [ ] **Step 6: Verify tables exist**

In Supabase dashboard → Table Editor, confirm `licenses`, `subscriptions`, and `ai_usage_log` are present with the correct columns.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add licenses, subscriptions, ai_usage_log migrations with RLS"
```

---

### Task B3: JWT custom claims hook

**Files:**
- Create: `supabase/migrations/20260518000004_jwt_hook.sql`

The hook is a PostgreSQL function that Supabase calls whenever it issues a JWT. It reads the user's license and subscription status and embeds `licensed`, `ai_pro`, and `credits_remaining` into the token claims.

- [ ] **Step 1: Write the hook migration**

Create `supabase/migrations/20260518000004_jwt_hook.sql`:

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid;
  v_license       record;
  v_subscription  record;
  v_licensed      boolean := false;
  v_ai_pro        boolean := false;
  v_credits       int     := 0;
  claims          jsonb;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;
  claims    := event -> 'claims';

  -- Check for active license
  SELECT monthly_ai_credits, credits_used
  INTO v_license
  FROM public.licenses
  WHERE user_id = v_user_id AND status = 'active'
  LIMIT 1;

  IF v_license IS NOT NULL THEN
    v_licensed := true;
    v_credits  := v_license.monthly_ai_credits - v_license.credits_used;
  END IF;

  -- Check for active AI Pro subscription (overrides base credits)
  SELECT credits_remaining
  INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = v_user_id AND status = 'active'
  LIMIT 1;

  IF v_subscription IS NOT NULL THEN
    v_ai_pro  := true;
    v_credits := v_subscription.credits_remaining;
  END IF;

  -- Embed claims
  claims := jsonb_set(claims, '{licensed}',         to_jsonb(v_licensed));
  claims := jsonb_set(claims, '{ai_pro}',            to_jsonb(v_ai_pro));
  claims := jsonb_set(claims, '{credits_remaining}', to_jsonb(v_credits));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
```

- [ ] **Step 2: Push migration**

```bash
supabase db push
```

- [ ] **Step 3: Register the hook in Supabase dashboard**

Go to: **Dashboard → Authentication → Hooks → Customize Access Token (JWT) Claims**

Set the hook to: `public.custom_access_token_hook`

This cannot be done via CLI — it is a dashboard-only step.

- [ ] **Step 4: Test the hook**

In the Supabase SQL editor, create a test user, insert a license row, then call the hook manually:

```sql
-- Create a test user (get the UUID from auth.users after creating via dashboard)
-- Then insert a test license:
INSERT INTO public.licenses (user_id, key_hash, status, monthly_ai_credits, credits_used)
VALUES ('<test-user-uuid>', 'testhash', 'active', 50, 10);

-- Call the hook directly to verify output:
SELECT public.custom_access_token_hook(
  jsonb_build_object(
    'user_id', '<test-user-uuid>',
    'claims',  '{}'::jsonb
  )
);
```

Expected: returns `{"claims": {"licensed": true, "ai_pro": false, "credits_remaining": 40}}`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260518000004_jwt_hook.sql
git commit -m "feat: add JWT custom claims hook for licensed/ai_pro/credits_remaining"
```

---

### Task B4: Monthly credit reset (pg_cron)

**Files:**
- Create: `supabase/migrations/20260518000005_credit_reset_cron.sql`

- [ ] **Step 1: Verify pg_cron is enabled**

In Supabase dashboard → Database → Extensions, confirm `pg_cron` is enabled. If not, enable it (toggle on).

- [ ] **Step 2: Write the cron migration**

Create `supabase/migrations/20260518000005_credit_reset_cron.sql`:

```sql
-- Run at midnight UTC on the 1st of every month

-- Reset base license credit usage
SELECT cron.schedule(
  'monthly-license-credit-reset',
  '0 0 1 * *',
  $$
    UPDATE public.licenses
    SET
      credits_used     = 0,
      credits_reset_at = date_trunc('month', now()) + interval '1 month'
    WHERE status = 'active'
      AND (credits_reset_at IS NULL OR credits_reset_at <= now());
  $$
);

-- Reset AI Pro subscription credits
SELECT cron.schedule(
  'monthly-subscription-credit-reset',
  '0 0 1 * *',
  $$
    UPDATE public.subscriptions
    SET
      credits_remaining = 500,
      credits_reset_at  = date_trunc('month', now()) + interval '1 month'
    WHERE status = 'active'
      AND (credits_reset_at IS NULL OR credits_reset_at <= now());
  $$
);
```

- [ ] **Step 3: Push migration**

```bash
supabase db push
```

- [ ] **Step 4: Verify cron jobs exist**

```sql
SELECT jobname, schedule, command FROM cron.job;
```

Expected: two rows — `monthly-license-credit-reset` and `monthly-subscription-credit-reset`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260518000005_credit_reset_cron.sql
git commit -m "feat: add pg_cron monthly credit reset for licenses and subscriptions"
```

---

### Task B5: Edge Function — /licenses/activate

**Files:**
- Create: `supabase/functions/licenses-activate/index.ts`

This function receives `{ key, deviceFingerprint, deviceName }`, validates the key hash, registers the device, and returns a `hashed_token` that the agent exchanges for a Supabase Auth session via `verifyOtp`.

- [ ] **Step 1: Create the Edge Function**

```bash
supabase functions new licenses-activate
```

Expected: creates `supabase/functions/licenses-activate/index.ts`.

- [ ] **Step 2: Write the function**

Replace the contents of `supabase/functions/licenses-activate/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sha256hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.toLowerCase().trim())
  const hashBuf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { key?: string; deviceFingerprint?: string; deviceName?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'INVALID_BODY' }, { status: 400, headers: corsHeaders })
  }

  const { key, deviceFingerprint, deviceName } = body
  if (!key || !deviceFingerprint) {
    return Response.json({ error: 'INVALID_KEY' }, { status: 400, headers: corsHeaders })
  }

  const keyHash = await sha256hex(key)

  const { data: license, error: licenseError } = await supabase
    .from('licenses')
    .select('id, user_id, status, device_fingerprint')
    .eq('key_hash', keyHash)
    .single()

  if (licenseError || !license) {
    return Response.json({ error: 'INVALID_KEY' }, { status: 400, headers: corsHeaders })
  }

  if (license.status === 'revoked') {
    return Response.json({ error: 'REVOKED' }, { status: 403, headers: corsHeaders })
  }

  if (license.status === 'active' && license.device_fingerprint !== deviceFingerprint) {
    return Response.json({ error: 'DEVICE_MISMATCH' }, { status: 409, headers: corsHeaders })
  }

  // Register or re-confirm the device
  const now = new Date()
  const nextReset = new Date(now)
  nextReset.setMonth(nextReset.getMonth() + 1)
  nextReset.setDate(1)
  nextReset.setHours(0, 0, 0, 0)

  await supabase
    .from('licenses')
    .update({
      status:             'active',
      device_fingerprint: deviceFingerprint,
      device_name:        deviceName ?? null,
      activated_at:       now.toISOString(),
      credits_reset_at:   nextReset.toISOString(),
    })
    .eq('id', license.id)

  // Get user email to generate magic link
  const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(license.user_id)
  if (userError || !user?.email) {
    return Response.json({ error: 'USER_NOT_FOUND' }, { status: 500, headers: corsHeaders })
  }

  // Generate a magic link — hashed_token is used by agent to create a session
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type:  'magiclink',
    email: user.email,
  })
  if (linkError || !linkData?.properties?.hashed_token) {
    return Response.json({ error: 'SESSION_GENERATION_FAILED' }, { status: 500, headers: corsHeaders })
  }

  return Response.json(
    { hashed_token: linkData.properties.hashed_token },
    { status: 200, headers: corsHeaders },
  )
})
```

- [ ] **Step 3: Deploy the function**

```bash
supabase functions deploy licenses-activate --no-verify-jwt
```

`--no-verify-jwt` because the agent calls this without an existing Supabase session (it's the activation step).

- [ ] **Step 4: Smoke-test with curl**

First, manually insert a test license in the Supabase dashboard:

```sql
INSERT INTO public.licenses (user_id, key_hash, status)
VALUES (
  '<a-real-user-uuid-from-auth-users>',
  lower(encode(sha256('test-key-1234'::bytea), 'hex')),
  'unused'
);
```

Then call the function:

```bash
curl -X POST \
  'https://<project-ref>.supabase.co/functions/v1/licenses-activate' \
  -H 'Content-Type: application/json' \
  -d '{"key":"test-key-1234","deviceFingerprint":"abc123","deviceName":"TEST-PC"}'
```

Expected: `{"hashed_token":"<some-long-token-string>"}` with HTTP 200.

Call again with a different fingerprint:

```bash
curl -X POST \
  'https://<project-ref>.supabase.co/functions/v1/licenses-activate' \
  -H 'Content-Type: application/json' \
  -d '{"key":"test-key-1234","deviceFingerprint":"different-fp","deviceName":"OTHER-PC"}'
```

Expected: `{"error":"DEVICE_MISMATCH"}` with HTTP 409.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/licenses-activate/
git commit -m "feat: add licenses-activate Edge Function with device fingerprint registration"
```
