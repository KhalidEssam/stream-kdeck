# OAuth Cloud Plugin Framework Implementation Plan

> For agentic workers: implement task-by-task. Keep commits separate by stage. Do not add Twitch/Spotify/YouTube provider tools before the framework tasks pass.

**Goal:** Build the cloud connector framework required for OAuth/API-key plugins, then prove it with a narrow Twitch first slice.

**Architecture:** OAuth state, token exchange, token refresh, token storage, disconnect, and cloud provider API calls live in the Next.js web backend. The desktop agent remains the deck execution coordinator, but delegates `executionMode = cloud` actions to the web backend. The mobile app renders OAuth connection UX and opens provider auth URLs, but never stores provider tokens.

**Tech Stack:** Next.js App Router, Supabase SQL/RLS, NestJS desktop agent, React Native mobile, shared TypeScript schema.

**Out of scope:** Full Twitch catalog, Spotify implementation, YouTube Live implementation, multi-account cloud connections, third-party plugin SDK.

---

## Files

| File | Action | Purpose |
|---|---|---|
| `docs/superpowers/specs/2026-05-25-oauth-cloud-plugin-framework-design.md` | Reference | Architecture and security decisions |
| `supabase/migrations/20260525000002_oauth_cloud_framework.sql` | Create | OAuth state, encrypted token, and optional action-run tables |
| `packages/shared/src/schema.ts` | Modify | Add OAuth connection WebSocket messages and richer connection status fields |
| `apps/mobile/src/types/schema.ts` | Modify | Mirror shared schema until type generation is unified |
| `apps/web/lib/integrations/session.ts` | Create | API session helper accepting bearer token or dashboard cookies |
| `apps/web/lib/integrations/oauth/providers.ts` | Create | OAuth provider registry |
| `apps/web/lib/integrations/oauth/crypto.ts` | Create | State hashing and token encryption helpers |
| `apps/web/lib/integrations/oauth/state.ts` | Create | OAuth state create/consume helpers |
| `apps/web/lib/integrations/oauth/tokens.ts` | Create | Token upsert, decrypt, refresh orchestration |
| `apps/web/lib/integrations/oauth/refresh.ts` | Create | Provider refresh logic |
| `apps/web/lib/integrations/catalog.ts` | Create | Server-side plugin/tool lookup helper used by all API routes |
| `apps/web/lib/integrations/cloud/executor.ts` | Create | Cloud tool validation and dispatch |
| `apps/web/lib/integrations/cloud/providers/twitch.ts` | Create later | First provider adapter |
| `apps/web/app/api/integrations/[slug]/oauth/start/route.ts` | Create | Start OAuth flow |
| `apps/web/app/api/integrations/[slug]/oauth/callback/route.ts` | Create | OAuth callback |
| `apps/web/app/api/integrations/[slug]/connection/route.ts` | Create | Read connection status |
| `apps/web/app/api/integrations/[slug]/disconnect/route.ts` | Create | Disconnect/revoke cloud connection |
| `apps/web/app/api/integrations/actions/execute/route.ts` | Create | Execute cloud tool |
| `apps/agent/src/integrations/cloud-integration-client.service.ts` | Create | Agent proxy to web cloud executor |
| `apps/agent/src/command/command.service.ts` | Modify | Branch cloud tools to `CloudIntegrationClient` |
| `apps/agent/src/integrations/integrations.module.ts` | Modify | Register `CloudIntegrationClient` |
| `apps/agent/src/websocket/ws.gateway.ts` | Modify | Start OAuth/status/disconnect proxy messages |
| `apps/mobile/src/screens/PluginConnectionScreen.tsx` | Modify | Add `oauth2` connector UI |
| `supabase/migrations/20260525000003_twitch_cloud_plugin_seed.sql` | Create later | Twitch internal/beta plugin proof catalog |

---

## Task 1: Database Foundation

**Files:**
- Create `supabase/migrations/20260525000002_oauth_cloud_framework.sql`

```sql
-- supabase/migrations/20260525000002_oauth_cloud_framework.sql

-- Short-lived OAuth state records (server-role only, consumed exactly once).
CREATE TABLE IF NOT EXISTS public.integration_oauth_states (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash              text UNIQUE NOT NULL,
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plugin_id               uuid NOT NULL REFERENCES public.integration_plugins(id) ON DELETE CASCADE,
  provider                text NOT NULL,
  requested_scopes        text[] NOT NULL DEFAULT array[]::text[],
  code_verifier_ciphertext text,
  redirect_uri            text NOT NULL,
  return_url              text,
  device_id               text,
  expires_at              timestamptz NOT NULL,
  consumed_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_oauth_states_expires_idx
  ON public.integration_oauth_states(expires_at);

ALTER TABLE public.integration_oauth_states ENABLE ROW LEVEL SECURITY;
-- No user-facing policies: all access goes through service-role API routes.

-- Encrypted token storage (service-role only — tokens never leave the web backend).
CREATE TABLE IF NOT EXISTS public.user_cloud_connection_tokens (
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plugin_id                 uuid NOT NULL REFERENCES public.integration_plugins(id) ON DELETE CASCADE,
  provider                  text NOT NULL,
  provider_account_id       text,
  provider_account_name     text,
  token_type                text,
  scopes                    text[] NOT NULL DEFAULT array[]::text[],
  access_token_ciphertext   text NOT NULL,
  refresh_token_ciphertext  text,
  expires_at                timestamptz,
  refresh_token_expires_at  timestamptz,
  refresh_lock_until        timestamptz,
  last_refreshed_at         timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plugin_id)
);

CREATE INDEX IF NOT EXISTS user_cloud_connection_tokens_user_plugin_idx
  ON public.user_cloud_connection_tokens(user_id, plugin_id);

ALTER TABLE public.user_cloud_connection_tokens ENABLE ROW LEVEL SECURITY;
-- No user-facing policies.

-- Optional audit log for cloud tool executions (service-role write, no user read in MVP).
CREATE TABLE IF NOT EXISTS public.integration_action_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plugin_id           uuid NOT NULL REFERENCES public.integration_plugins(id) ON DELETE CASCADE,
  tool_id             uuid REFERENCES public.integration_tools(id) ON DELETE SET NULL,
  action_id           text NOT NULL,
  execution_mode      text NOT NULL DEFAULT 'cloud',
  status              text NOT NULL CHECK (status IN ('success', 'error')),
  provider_request_id text,
  safe_result         jsonb NOT NULL DEFAULT '{}',
  error_code          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_action_runs_user_plugin_idx
  ON public.integration_action_runs(user_id, plugin_id, created_at DESC);

ALTER TABLE public.integration_action_runs ENABLE ROW LEVEL SECURITY;
-- No user-facing policies in MVP.

-- Atomic OAuth state consumption: returns the row only if unexpired and not yet consumed.
CREATE OR REPLACE FUNCTION public.consume_integration_oauth_state(p_state_hash text)
RETURNS public.integration_oauth_states
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.integration_oauth_states;
BEGIN
  UPDATE public.integration_oauth_states
  SET consumed_at = now()
  WHERE state_hash = p_state_hash
    AND expires_at > now()
    AND consumed_at IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_state';
  END IF;

  RETURN v_row;
END;
$$;

-- Token refresh lock: claims the lock and returns true only when not already locked.
CREATE OR REPLACE FUNCTION public.claim_token_refresh_lock(
  p_user_id  uuid,
  p_plugin_id uuid,
  p_lock_seconds int DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.user_cloud_connection_tokens
  SET refresh_lock_until = now() + (p_lock_seconds || ' seconds')::interval
  WHERE user_id = p_user_id
    AND plugin_id = p_plugin_id
    AND (refresh_lock_until IS NULL OR refresh_lock_until < now());

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;
```

Acceptance criteria:

- No tokens or PKCE verifier values are stored in `user_cloud_connections.metadata`.
- Migration is idempotent with `IF NOT EXISTS` / `CREATE OR REPLACE`.
- Secret tables have RLS enabled with no user-readable policies.
- `user_cloud_connections` (existing) remains the only user-visible cloud connection state.
- `consume_integration_oauth_state` marks a state consumed exactly once.
- `claim_token_refresh_lock` is atomic so two parallel taps cannot double-refresh.

Suggested commit:

```bash
git add supabase/migrations/20260525000002_oauth_cloud_framework.sql
git commit -m "feat(plugins): add oauth cloud connection tables"
```

---

## Task 2: Web API Session Helper

**Files:**
- Create `apps/web/lib/integrations/session.ts`

```ts
// apps/web/lib/integrations/session.ts
import { NextResponse } from 'next/server';
import { verifyAccessToken } from '../auth/jwt';
import { getCurrentSession } from '../auth/session';
import { getUserLicenseByUserId } from '../licenses';

export interface IntegrationApiSession {
  userId: string;
  accessToken: string;
  source: 'agent' | 'web';
}

export class IntegrationApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function integrationApiError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function requireIntegrationApiSession(
  request: Request,
): Promise<IntegrationApiSession> {
  const authHeader = request.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const verified = await verifyAccessToken(token);
    const isLicensed =
      verified.licensed ||
      verified.role === 'admin' ||
      verified.role === 'owner' ||
      !!(await getUserLicenseByUserId(verified.sub));

    if (!isLicensed) {
      throw new IntegrationApiError(403, 'Active KDeck license required');
    }

    return { userId: verified.sub, accessToken: token, source: 'agent' };
  }

  // Cookie fallback for dashboard-initiated flows.
  const session = await getCurrentSession();
  if (!session) {
    throw new IntegrationApiError(401, 'Authentication required');
  }

  const isLicensed =
    session.user.licensed ||
    session.user.role === 'admin' ||
    session.user.role === 'owner' ||
    !!(await getUserLicenseByUserId(session.user.sub));

  if (!isLicensed) {
    throw new IntegrationApiError(403, 'Active KDeck license required');
  }

  return { userId: session.user.sub, accessToken: session.accessToken, source: 'web' };
}
```

Acceptance criteria:

- Agent bearer calls authenticate without dashboard cookies.
- Dashboard cookie calls still work.
- Unlicensed users get `403`.
- Missing token gets `401`.

Suggested commit:

```bash
git add apps/web/lib/integrations/session.ts
git commit -m "feat(web): add integration api session helper"
```

---

## Task 3: OAuth Provider Registry And Crypto Helpers

**Files:**
- Create `apps/web/lib/integrations/oauth/providers.ts`
- Create `apps/web/lib/integrations/oauth/crypto.ts`

```ts
// apps/web/lib/integrations/oauth/providers.ts
export interface OAuthProviderConfig {
  slug: 'twitch' | 'spotify' | 'youtube' | 'tiktok' | 'kick' | 'linear' | 'notion' | 'slack' | 'github';
  authUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  usesPkce: boolean;
  clientIdEnv: string;
  clientSecretEnv?: string;
  defaultScopes: string[];
  scopeSeparator: 'space' | 'comma';
  profileRequest?: { url: string; method: 'GET' | 'POST' };
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  twitch: {
    slug: 'twitch',
    authUrl: 'https://id.twitch.tv/oauth2/authorize',
    tokenUrl: 'https://id.twitch.tv/oauth2/token',
    revokeUrl: 'https://id.twitch.tv/oauth2/revoke',
    usesPkce: false,
    clientIdEnv: 'TWITCH_CLIENT_ID',
    clientSecretEnv: 'TWITCH_CLIENT_SECRET',
    defaultScopes: ['clips:edit', 'channel:manage:broadcast', 'user:write:chat'],
    scopeSeparator: 'space',
    profileRequest: { url: 'https://api.twitch.tv/helix/users', method: 'GET' },
  },
  spotify: {
    slug: 'spotify',
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    usesPkce: true,
    clientIdEnv: 'SPOTIFY_CLIENT_ID',
    clientSecretEnv: 'SPOTIFY_CLIENT_SECRET',
    defaultScopes: [
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'user-library-modify',
    ],
    scopeSeparator: 'space',
    profileRequest: { url: 'https://api.spotify.com/v1/me', method: 'GET' },
  },
  youtube: {
    slug: 'youtube',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    usesPkce: true,
    clientIdEnv: 'YOUTUBE_CLIENT_ID',
    clientSecretEnv: 'YOUTUBE_CLIENT_SECRET',
    defaultScopes: ['https://www.googleapis.com/auth/youtube'],
    scopeSeparator: 'space',
    profileRequest: { url: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', method: 'GET' },
  },
  tiktok: {
    slug: 'tiktok',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    revokeUrl: 'https://open.tiktokapis.com/v2/oauth/revoke/',
    usesPkce: true,
    clientIdEnv: 'TIKTOK_CLIENT_ID',
    clientSecretEnv: 'TIKTOK_CLIENT_SECRET',
    defaultScopes: ['user.info.basic'],
    scopeSeparator: 'comma',
  },
  kick: {
    slug: 'kick',
    authUrl: 'https://id.kick.com/oauth/authorize',
    tokenUrl: 'https://id.kick.com/oauth/token',
    usesPkce: true,
    clientIdEnv: 'KICK_CLIENT_ID',
    defaultScopes: ['user:read', 'channel:read'],
    scopeSeparator: 'space',
  },
  linear: {
    slug: 'linear',
    authUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://api.linear.app/oauth/token',
    revokeUrl: 'https://api.linear.app/oauth/revoke',
    usesPkce: false,
    clientIdEnv: 'LINEAR_CLIENT_ID',
    clientSecretEnv: 'LINEAR_CLIENT_SECRET',
    defaultScopes: ['read', 'write'],
    scopeSeparator: 'comma',
    profileRequest: { url: 'https://api.linear.app/graphql', method: 'POST' },
  },
  notion: {
    slug: 'notion',
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    usesPkce: false,
    clientIdEnv: 'NOTION_CLIENT_ID',
    clientSecretEnv: 'NOTION_CLIENT_SECRET',
    defaultScopes: [],
    scopeSeparator: 'space',
  },
  slack: {
    slug: 'slack',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    revokeUrl: 'https://slack.com/api/auth.revoke',
    usesPkce: false,
    clientIdEnv: 'SLACK_CLIENT_ID',
    clientSecretEnv: 'SLACK_CLIENT_SECRET',
    defaultScopes: ['chat:write', 'channels:read'],
    scopeSeparator: 'comma',
    profileRequest: { url: 'https://slack.com/api/auth.test', method: 'POST' },
  },
  github: {
    slug: 'github',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    usesPkce: false,
    clientIdEnv: 'GITHUB_CLIENT_ID',
    clientSecretEnv: 'GITHUB_CLIENT_SECRET',
    defaultScopes: ['repo', 'read:user'],
    scopeSeparator: 'space',
    profileRequest: { url: 'https://api.github.com/user', method: 'GET' },
  },
};

export function getProvider(slug: string): OAuthProviderConfig {
  const config = OAUTH_PROVIDERS[slug];
  if (!config) throw new Error(`Unknown OAuth provider: ${slug}`);
  return config;
}

export function getProviderClientId(config: OAuthProviderConfig): string {
  const id = process.env[config.clientIdEnv];
  if (!id) throw new Error(`Missing env var ${config.clientIdEnv} for provider ${config.slug}`);
  return id;
}

export function getProviderClientSecret(config: OAuthProviderConfig): string {
  if (!config.clientSecretEnv) throw new Error(`Provider ${config.slug} has no client secret`);
  const secret = process.env[config.clientSecretEnv];
  if (!secret) throw new Error(`Missing env var ${config.clientSecretEnv} for provider ${config.slug}`);
  return secret;
}
```

```ts
// apps/web/lib/integrations/oauth/crypto.ts
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY is not set');
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  return buf;
}

export function hashOAuthState(rawState: string): string {
  return createHash('sha256').update(rawState).digest('hex');
}

export function generateRawState(): string {
  return randomBytes(32).toString('hex');
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: hex(iv) + '.' + hex(tag) + '.' + hex(ciphertext)
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
}

export function decryptSecret(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split('.');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}
```

Acceptance criteria:

- Missing provider env vars (`TWITCH_CLIENT_ID` etc.) throw at OAuth start time, not at module import.
- `OAUTH_TOKEN_ENCRYPTION_KEY` missing throws at encrypt/decrypt call time.
- No helper logs token or key values.
- `encryptSecret` / `decryptSecret` round-trip correctly.

Suggested commit:

```bash
git add apps/web/lib/integrations/oauth/providers.ts apps/web/lib/integrations/oauth/crypto.ts
git commit -m "feat(web): add oauth provider registry and crypto helpers"
```

---

## Task 3b: Web Catalog Helper

**Files:**
- Create `apps/web/lib/integrations/catalog.ts`

All API routes that receive a `[slug]` param need to load and validate the plugin and optionally a tool from Supabase. This helper centralises that lookup so routes stay thin.

```ts
// apps/web/lib/integrations/catalog.ts
import { getSupabaseAdmin } from '../supabase-admin';

export interface CatalogPlugin {
  id: string;
  slug: string;
  connectorType: string | null;
  requiresConnector: boolean;
  status: string;
}

export interface CatalogTool {
  id: string;
  pluginId: string;
  actionId: string;
  executionMode: string;
  paramsSchema: Record<string, unknown>;
  requiresConfirmation: boolean;
  status: string;
}

export async function getPluginBySlug(slug: string): Promise<CatalogPlugin | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('integration_plugins')
    .select('id, slug, connector_type, requires_connector, status')
    .eq('slug', slug)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    slug: data.slug,
    connectorType: data.connector_type,
    requiresConnector: data.requires_connector,
    status: data.status,
  };
}

export async function getPluginById(pluginId: string): Promise<CatalogPlugin | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('integration_plugins')
    .select('id, slug, connector_type, requires_connector, status')
    .eq('id', pluginId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    slug: data.slug,
    connectorType: data.connector_type,
    requiresConnector: data.requires_connector,
    status: data.status,
  };
}

export async function getToolByActionId(pluginId: string, actionId: string): Promise<CatalogTool | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('integration_tools')
    .select('id, plugin_id, action_id, execution_mode, params_schema, requires_confirmation, status')
    .eq('plugin_id', pluginId)
    .eq('action_id', actionId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    pluginId: data.plugin_id,
    actionId: data.action_id,
    executionMode: data.execution_mode,
    paramsSchema: data.params_schema ?? {},
    requiresConfirmation: data.requires_confirmation,
    status: data.status,
  };
}

export async function isPluginInstalled(userId: string, pluginId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('user_plugin_installs')
    .select('plugin_id')
    .eq('user_id', userId)
    .eq('plugin_id', pluginId)
    .eq('status', 'installed')
    .is('deleted_at', null)
    .single();
  return !!data;
}
```

Suggested commit:

```bash
git add apps/web/lib/integrations/catalog.ts
git commit -m "feat(web): add server-side integration catalog helper"
```

---

## Task 4: OAuth Start And Callback Routes

**Files:**
- Create `apps/web/lib/integrations/oauth/state.ts`
- Create `apps/web/lib/integrations/oauth/tokens.ts`
- Create `apps/web/app/api/integrations/[slug]/oauth/start/route.ts`
- Create `apps/web/app/api/integrations/[slug]/oauth/callback/route.ts`

Start route behavior:

1. Authenticate via `requireIntegrationApiSession`.
2. Load plugin by slug.
3. Require `connector_type = 'oauth2'`.
4. Require installed plugin.
5. Create random state and PKCE verifier/challenge.
6. Store hashed state with encrypted verifier.
7. Return `{ authorizeUrl, expiresAt }`.

Callback behavior:

1. Validate `code` and `state`.
2. Consume unexpired state exactly once.
3. Exchange code with provider token endpoint.
4. Fetch provider account label if configured.
5. Store encrypted tokens in `user_cloud_connection_tokens`.
6. Upsert `user_cloud_connections` with `status = 'connected'`.
7. Redirect to success page or app return URL.

Acceptance criteria:

- State replay fails.
- Expired state fails.
- Wrong slug/provider state fails.
- Successful callback stores encrypted tokens and non-secret metadata.
- Failed callback does not erase a previously connected account unless explicitly reconnecting.

Suggested commit:

```bash
git add apps/web/lib/integrations/oauth/state.ts apps/web/lib/integrations/oauth/tokens.ts apps/web/app/api/integrations/[slug]/oauth/start/route.ts apps/web/app/api/integrations/[slug]/oauth/callback/route.ts
git commit -m "feat(web): add oauth start and callback routes"
```

---

## Task 5: Connection Status And Disconnect API

**Files:**
- Create `apps/web/app/api/integrations/[slug]/connection/route.ts`
- Create `apps/web/app/api/integrations/[slug]/disconnect/route.ts`

Connection route:

- Returns only `status`, `displayName`, `metadata`, `scopes`, and expiry summary.
- Never returns encrypted token rows or token material.

Disconnect route:

- Authenticates user.
- Revokes provider token if provider supports revocation.
- Deletes `user_cloud_connection_tokens` row.
- Upserts `user_cloud_connections.status = 'not_configured'`.

Acceptance criteria:

- Mobile can poll status after OAuth browser flow.
- Disconnect is idempotent.
- Provider revoke failure is recorded but does not leave KDeck token row active.

Suggested commit:

```bash
git add apps/web/app/api/integrations/[slug]/connection/route.ts apps/web/app/api/integrations/[slug]/disconnect/route.ts
git commit -m "feat(web): add cloud connection status and disconnect api"
```

---

## Task 6: Cloud Action Executor

**Files:**
- Create `apps/web/lib/integrations/cloud/executor.ts`
- Create `apps/web/lib/integrations/oauth/refresh.ts`
- Create `apps/web/app/api/integrations/actions/execute/route.ts`

Executor responsibilities:

1. Authenticate user.
2. Validate plugin install state.
3. Validate tool exists and `execution_mode = 'cloud'`.
4. Validate params against `params_schema`.
5. Check required scopes.
6. Require confirmation for public/destructive actions.
7. Refresh token if needed.
8. Dispatch to provider adapter.
9. Insert `integration_action_runs` audit row.
10. Return a safe `CommandResult` shape.

Acceptance criteria:

- Agent gets a familiar `{ success, output?, error? }` response.
- Expired tokens refresh on demand.
- Refresh failure marks connection `expired`.
- Missing scopes return a reconnect-required error.
- Provider adapters cannot bypass session/plugin/tool validation.

Suggested commit:

```bash
git add apps/web/lib/integrations/cloud/executor.ts apps/web/lib/integrations/oauth/refresh.ts apps/web/app/api/integrations/actions/execute/route.ts
git commit -m "feat(web): add cloud integration action executor"
```

---

## Task 7: Agent Cloud Bridge

**Files:**
- Create `apps/agent/src/integrations/cloud-integration-client.service.ts`
- Modify `apps/agent/src/command/command.service.ts`
- Modify `apps/agent/src/integrations/integrations.module.ts`

```ts
// apps/agent/src/integrations/cloud-integration-client.service.ts
import { Injectable } from '@nestjs/common';
import { LicenseService } from '../license/license.service';
import { CommandResult } from '../command/command.service';

@Injectable()
export class CloudIntegrationClientService {
  private readonly baseUrl: string;

  constructor(private readonly licenseService: LicenseService) {
    this.baseUrl = process.env.KDECK_WEB_URL ?? 'https://app.kdeck.io';
  }

  async execute(
    pluginId: string,
    toolId: string,
    actionId: string,
    params: Record<string, unknown>,
    confirmed?: boolean,
  ): Promise<CommandResult> {
    const token = await this.licenseService.getAccessToken();
    if (!token) {
      return { success: false, error: 'Not signed in — open KDeck and sign in to use cloud tools.' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/integrations/actions/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pluginId, toolId, actionId, params, confirmed }),
      });

      const json = await response.json() as { success: boolean; output?: string; error?: string };

      if (!response.ok) {
        return { success: false, error: (json as { error?: string }).error ?? `Cloud action failed (${response.status})` };
      }

      return json;
    } catch (err) {
      return {
        success: false,
        error: `Cloud action unreachable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
```

In `apps/agent/src/command/command.service.ts`, replace the `INTEGRATION_ACTION` case. The current code (lines 173-179) is:

```ts
case 'INTEGRATION_ACTION': {
  const plugin = this.pluginCatalog.getPlugins().find((p) => p.id === action.pluginId);
  const tool = plugin?.tools.find((t) => t.id === action.toolId);
  return this.integrationRouter.dispatch(
    action.actionId,
    action.params,
    tool?.paramsSchema as Record<string, unknown> | undefined,
  );
}
```

Replace with:

```ts
case 'INTEGRATION_ACTION': {
  const plugin = this.pluginCatalog.getPlugins().find((p) => p.id === action.pluginId);
  const tool = plugin?.tools.find((t) => t.id === action.toolId);

  if (!tool) {
    return { success: false, error: 'Plugin tool not found — re-add the tile from the Plugin Library' };
  }

  if (tool.executionMode === 'cloud') {
    return this.cloudClient.execute(
      action.pluginId,
      action.toolId,
      action.actionId,
      action.params,
      (action as { confirmed?: boolean }).confirmed,
    );
  }

  return this.integrationRouter.dispatch(
    action.actionId,
    action.params,
    tool.paramsSchema as Record<string, unknown> | undefined,
  );
}
```

Also add `private readonly cloudClient: CloudIntegrationClientService` to the `CommandService` constructor and import it.

In `integrations.module.ts`, add `CloudIntegrationClientService` to `providers` and `exports`.

Acceptance criteria:

- Existing OBS local tools (executionMode = 'agent') keep working unchanged.
- A cloud tool with no web reachability returns a readable network error.
- Cloud tool with expired KDeck session returns a sign-in prompt.
- Run history records action result but no provider secrets.

Suggested commit:

```bash
git add apps/agent/src/integrations/cloud-integration-client.service.ts apps/agent/src/command/command.service.ts apps/agent/src/integrations/integrations.module.ts
git commit -m "feat(agent): delegate cloud integration tools to web backend"
```

---

## Task 8: Mobile And Agent OAuth Connection UX

**Files:**
- Modify `packages/shared/src/schema.ts`
- Modify `apps/mobile/src/types/schema.ts`
- Modify `apps/agent/src/websocket/ws.gateway.ts`
- Modify `apps/mobile/src/services/websocket.service.ts`
- Modify `apps/mobile/src/screens/PluginConnectionScreen.tsx`

Add messages:

```ts
interface StartPluginOAuthMessage {
  type: 'START_PLUGIN_OAUTH';
  pluginId: string;
}

interface PluginOAuthStartMessage {
  type: 'PLUGIN_OAUTH_START';
  pluginId: string;
  authorizeUrl: string;
  expiresAt: string;
}

interface GetPluginConnectionStatusMessage {
  type: 'GET_PLUGIN_CONNECTION_STATUS';
  pluginId: string;
}

interface DisconnectPluginMessage {
  type: 'DISCONNECT_PLUGIN';
  pluginId: string;
}
```

Mobile behavior:

- `connectorType = oauth2` renders a "Connect account" button.
- On tap, mobile sends `START_PLUGIN_OAUTH`.
- On `PLUGIN_OAUTH_START`, mobile opens `authorizeUrl`.
- After opening URL, mobile polls `GET_PLUGIN_CONNECTION_STATUS` for a short window.
- Connected/expired/error states show appropriate CTA.

Agent behavior:

- Proxies start/status/disconnect to web backend.
- Sends existing `PLUGIN_CONNECTION_STATUS` with richer non-secret fields.

Acceptance criteria:

- OBS/local connector UI still works.
- OAuth connector can open a real provider URL.
- Mobile can recover if user closes browser without finishing OAuth.
- Connection screen never displays raw provider tokens.

Suggested commit:

```bash
git add packages/shared/src/schema.ts apps/mobile/src/types/schema.ts apps/agent/src/websocket/ws.gateway.ts apps/mobile/src/services/websocket.service.ts apps/mobile/src/screens/PluginConnectionScreen.tsx
git commit -m "feat(mobile): add oauth plugin connection flow"
```

---

## Task 9: Twitch First Slice

**Files:**
- Create `apps/web/lib/integrations/cloud/providers/twitch.ts`
- Create `supabase/migrations/20260525000003_twitch_cloud_plugin_seed.sql`
- Add focused tests for Twitch adapter and executor

Seed plugin:

- slug `twitch`
- connector type `oauth2`
- category `streaming`
- status `internal` first, then `beta` after QA
- `requires_connector = true`

Initial tools:

| Tool | Action ID | Params | Confirmation |
|---|---|---|---|
| Create Clip | `twitch.clip.create` | `{ broadcasterId?: string, hasDelay?: boolean }` | false |
| Create Stream Marker | `twitch.marker.create` | `{ description?: string }` | false |
| Update Stream Info | `twitch.channel.update` | `{ title?: string, gameId?: string }` | true |
| Send Chat Message | `twitch.chat.send` | `{ message: string }` | true |

Acceptance criteria:

- OAuth connect obtains needed Twitch scopes.
- Create Clip returns an edit/view URL.
- Marker errors are readable when channel is not live or VOD storage is unavailable.
- Chat/update actions require confirmation.
- Tool execution works from a deck tile and from a workflow step.

Suggested commit:

```bash
git add apps/web/lib/integrations/cloud/providers/twitch.ts supabase/migrations/20260525000003_twitch_cloud_plugin_seed.sql
git commit -m "feat(plugins): add twitch cloud integration first slice"
```

---

## Verification Checklist

- `npx tsc --noEmit` in `apps/web`
- `npx tsc --noEmit -p tsconfig.json` in `apps/agent`
- `npx tsc --noEmit` in `apps/mobile`
- Focused web route tests for OAuth start/callback/execute
- Focused agent tests for cloud execution branch
- Manual OAuth connect with provider sandbox/dev app
- Manual disconnect/reconnect
- Manual expired-token refresh path
- Manual mobile browser cancellation path
- Confirm no token-like strings appear in logs, run history, or mobile WebSocket messages

---

## Provider Documentation Notes

- Twitch requires user OAuth scopes for creator actions such as clips and stream markers.
- Spotify playback APIs require OAuth and some player controls only work for Spotify Premium accounts.
- YouTube Live requires OAuth and an eligible YouTube channel; service accounts are not supported for YouTube Live user actions.
- Slack OAuth installs an app into a workspace and bot scopes/user scopes need careful UX separation.
- Linear and Notion both have refresh-token OAuth flows that fit this framework.
- Kick uses OAuth 2.1 with PKCE and a separate OAuth host, so it is a good later validation case.
- TikTok Login Kit is OAuth-based, but live tooling needs a separate provider-specific spec after API access is confirmed.
