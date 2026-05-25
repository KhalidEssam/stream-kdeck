# OAuth Cloud Plugin Framework - Design Spec

**Date:** 2026-05-25
**Status:** Approved

---

## Overview

The Plugin Library already has the right vocabulary for cloud integrations:

- `integration_plugins.connector_type` supports `oauth2` and `api-key`.
- `integration_tools.execution_mode` supports `cloud`.
- `user_cloud_connections` exists as the account-wide connection state table.
- Mobile, agent, and shared schema already understand generic integration plugins and tools.

What is missing is the trusted cloud execution layer:

- OAuth start/callback routes.
- OAuth state and PKCE storage.
- Encrypted token storage.
- Token refresh and disconnect behavior.
- A server-side cloud action executor.
- Mobile/agent connection UX for `oauth2` plugins.

This framework must ship before Twitch, Spotify, YouTube Live, TikTok Live, Kick, Slack, GitHub, Linear, or Notion tools become reliable product features.

---

## Product Goal

Let a licensed KDeck user install a cloud plugin, connect the external account once, and run cloud API tools from deck tiles or workflows without exposing provider tokens to the mobile app or desktop agent.

Example target flow:

1. User installs Twitch plugin.
2. Mobile shows "Connect Twitch".
3. Mobile asks the agent for an OAuth URL.
4. Agent asks the web backend to create an OAuth state using the user's licensed Supabase session.
5. Mobile opens the provider authorization URL.
6. Provider redirects to the KDeck web callback route.
7. Web backend validates state/PKCE, stores encrypted tokens, and marks `user_cloud_connections` as `connected`.
8. Mobile polls or receives status and shows the connected account.
9. User taps "Create Twitch Clip".
10. Agent sees `executionMode = cloud` and sends the action to the web cloud executor.
11. Web backend refreshes tokens if needed, calls the provider API, and returns a safe result.

---

## Non-Goals

- Do not implement every cloud plugin inside this framework pass.
- Do not store OAuth tokens in `user_cloud_connections.metadata`.
- Do not send provider access tokens to the agent or mobile app.
- Do not download third-party plugin code.
- Do not support multiple accounts per plugin in the first version.
- Do not add public plugin publishing yet.

---

## Existing Architecture Reviewed

| Area | Existing file/table | Current state |
|---|---|---|
| Plugin catalog | `supabase/migrations/20260521000013_plugins.sql` | Catalog, tools, installs, cloud/device connection state exist |
| Plugin seed | `supabase/migrations/20260521000014_plugins_seed.sql` | OBS only |
| Shared action type | `packages/shared/src/schema.ts` | `INTEGRATION_ACTION`, `connectorType`, `executionMode` exist |
| Agent catalog | `apps/agent/src/integrations/plugin-catalog.service.ts` | Loads catalog and tools |
| Agent local execution | `apps/agent/src/command/command.service.ts` | Routes every integration action to local router |
| Agent connections | `apps/agent/src/integrations/connector.service.ts` | Only local/device connection methods exist |
| Mobile connection UI | `apps/mobile/src/screens/PluginConnectionScreen.tsx` | Handles `local-websocket`, no setup, and unsupported placeholders |
| Web auth | `apps/web/lib/auth/session.ts` | Cookie-based web sessions and license gate exist |
| Web admin client | `apps/web/lib/supabase-admin.ts` | Service-role client exists |

The cleanest direction is to keep the agent as the deck execution coordinator, but make it delegate cloud tools to the web backend.

---

## Core Decisions

| Decision | Choice |
|---|---|
| OAuth flow owner | Web backend owns OAuth start, callback, token exchange, refresh, and disconnect |
| Token visibility | Tokens never leave the web backend |
| Agent role | Agent requests OAuth URLs and delegates `executionMode = cloud` actions |
| Mobile role | Mobile launches the auth URL, polls status, and renders connection state |
| Token storage | Encrypted server-side token table, separate from `user_cloud_connections` |
| Refresh strategy | On-demand refresh before action execution; scheduled health worker can come later |
| First proof plugin | Twitch, because it is creator-core and validates scopes, public actions, and cloud execution |
| Provider rollout | One provider spec at a time after the framework is stable |

---

## Data Model

`user_cloud_connections` remains the non-secret, owner-readable status row:

```sql
-- Existing table, keep non-secret only.
create table public.user_cloud_connections (
  user_id uuid not null references auth.users(id),
  plugin_id uuid not null references public.integration_plugins(id),
  status text not null check (status in ('not_configured','connected','error','expired')),
  display_name text,
  metadata jsonb not null default '{}',
  updated_at timestamptz default now(),
  primary key (user_id, plugin_id)
);
```

Add short-lived OAuth state records:

```sql
create table public.integration_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text unique not null,
  user_id uuid not null references auth.users(id),
  plugin_id uuid not null references public.integration_plugins(id),
  provider text not null,
  requested_scopes text[] not null default array[]::text[],
  code_verifier_ciphertext text,
  redirect_uri text not null,
  return_url text,
  device_id text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
```

State consumption should be atomic. Add a small Postgres RPC such as
`consume_integration_oauth_state(state_hash text)` that updates `consumed_at`
only when the state is unexpired and unconsumed, then returns the row. The
callback route should not perform a separate read followed by update.

Add encrypted token storage:

```sql
create table public.user_cloud_connection_tokens (
  user_id uuid not null references auth.users(id),
  plugin_id uuid not null references public.integration_plugins(id),
  provider text not null,
  provider_account_id text,
  provider_account_name text,
  token_type text,
  scopes text[] not null default array[]::text[],
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  refresh_lock_until timestamptz,
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, plugin_id)
);
```

Token refresh should also use a narrow lock. The MVP can use `refresh_lock_until`
with an atomic update/RPC so two fast deck taps do not refresh the same provider
token in parallel.

Add optional audit/run records for cloud tools:

```sql
create table public.integration_action_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  plugin_id uuid not null references public.integration_plugins(id),
  tool_id uuid references public.integration_tools(id),
  action_id text not null,
  execution_mode text not null default 'cloud',
  status text not null check (status in ('success','error')),
  provider_request_id text,
  safe_result jsonb not null default '{}',
  error_code text,
  created_at timestamptz not null default now()
);
```

Security rule: only `user_cloud_connections` should have owner read policies. Token/state/action-run tables should be service-role only unless a specific read API is added.

Encryption rule: prefer Supabase Vault if it is available in the deployment. Otherwise encrypt token fields in the web backend with AES-256-GCM using `OAUTH_TOKEN_ENCRYPTION_KEY`.

---

## Web Backend Architecture

Add a web integration layer under `apps/web/lib/integrations`:

```text
apps/web/lib/integrations/
  catalog.ts
  session.ts
  oauth/
    providers.ts
    state.ts
    crypto.ts
    tokens.ts
    refresh.ts
  cloud/
    executor.ts
    providers/
      twitch.ts
      spotify.ts
```

Also create `apps/web/lib/integrations/catalog.ts`. This is a lightweight server-side helper that loads a plugin row and its tools from Supabase using the service-role client. It is used by every API route that needs to validate a slug, a plugin ID, or a tool ID before executing. It is not the mobile-facing catalog — it is a server-internal lookup utility.

Add API routes:

| Route | Method | Purpose |
|---|---|---|
| `/api/integrations/[slug]/oauth/start` | `POST` | Authenticates KDeck user, creates state/PKCE, returns provider authorization URL |
| `/api/integrations/[slug]/oauth/callback` | `GET` | Validates state, exchanges code, stores tokens, marks connection connected |
| `/api/integrations/[slug]/connection` | `GET` | Returns non-secret connection status |
| `/api/integrations/[slug]/disconnect` | `POST` | Revokes token when supported, deletes encrypted token, marks disconnected |
| `/api/integrations/actions/execute` | `POST` | Executes `executionMode = cloud` tools server-side |

The `apps/web/app/api/integrations/` directory does not yet exist. It must be created as part of Task 4.

### API Session Helper

Create a `requireIntegrationApiSession(request)` helper that accepts either:

- `Authorization: Bearer <supabase-access-token>` from the desktop agent.
- Existing dashboard cookies for web dashboard initiated flows.

This avoids making the mobile app hold Supabase session tokens. The agent already owns the licensed session through `LicenseService.getAccessToken()`. The bearer path reuses `verifyAccessToken` from `apps/web/lib/auth/jwt.ts` — no new JWT logic is required.

---

## OAuth Start Flow

For mobile initiated connect:

```text
Mobile PluginConnectionScreen
  -> WebSocket START_PLUGIN_OAUTH { pluginId }
Agent
  -> POST /api/integrations/:slug/oauth/start with bearer Supabase access token
Web
  -> validates licensed user, installed plugin, connector_type = oauth2
  -> creates state + PKCE verifier
  -> returns authorizeUrl
Agent
  -> PLUGIN_OAUTH_START { pluginId, authorizeUrl, expiresAt }
Mobile
  -> Linking.openURL(authorizeUrl)
  -> begins polling GET_PLUGIN_CONNECTION_STATUS every 3 s for up to 5 min
  -> stops polling on: connected | error | expired, or when user dismisses screen
```

For dashboard initiated connect:

```text
Dashboard plugin connection page
  -> POST /api/integrations/:slug/oauth/start with cookies
  -> redirect browser to provider authorize URL
```

---

## OAuth Callback Flow

**OAuth state flow:** The start route generates a cryptographically random raw state value, sends it to the provider, and stores only `SHA-256(raw_state)` in the DB. On callback, the raw state arrives in the query string; the route hashes it again and looks up the stored hash. The raw state is never stored.

**`return_url`** in `integration_oauth_states` is an optional URL the callback route should redirect to on success or failure. For mobile-initiated flows this is a KDeck deep link (`kdeck://oauth/done`). For dashboard-initiated flows it is a web dashboard path. If absent, the callback redirects to `/integrations/connected`.

**Mobile deep link scheme:** The KDeck Expo app uses the `kdeck` scheme (`kdeck://oauth/done`). After redirect, the mobile app's Linking handler receives the URL, stops polling, and reads the final connection status from the agent.

```text
Provider callback
  -> GET /api/integrations/:slug/oauth/callback?code=...&state=...
Web
  -> hash incoming state and load unexpired state row
  -> verify plugin slug/provider match
  -> mark state consumed
  -> exchange code with provider token endpoint
  -> fetch account/profile identity where available
  -> encrypt access/refresh tokens
  -> upsert user_cloud_connection_tokens
  -> upsert user_cloud_connections status = connected
  -> redirect to a web success page or mobile deep link
Mobile
  -> polls GET_PLUGIN_CONNECTION_STATUS through agent until connected/expired/error
```

Failure states should update `user_cloud_connections.status = 'error'` only when the failure belongs to an existing connection. A canceled OAuth start should not poison a previously connected account.

---

## Cloud Action Execution

The agent currently sends every `INTEGRATION_ACTION` to `IntegrationRouterService`. Change that branch:

```text
if tool.executionMode === 'cloud':
  CloudIntegrationClient.execute(action, tool)
else:
  IntegrationRouterService.dispatch(actionId, params, paramsSchema)
```

Web cloud executor checks:

1. User is authenticated and licensed.
2. Plugin exists and is installed.
3. Tool exists, is published/beta-visible, and `execution_mode = 'cloud'`.
4. Params match `params_schema`.
5. Tool has required scopes in the encrypted token row.
6. Public-facing or destructive actions include confirmation acknowledgement.
7. Token is fresh or refresh succeeds.
8. Provider adapter returns a safe result.

The executor response should never include raw provider tokens or large provider payloads.

---

## Provider Registry

Each provider config should describe endpoints, scopes, and token behavior:

```ts
interface OAuthProviderConfig {
  slug: 'twitch' | 'spotify' | 'youtube' | 'tiktok' | 'kick' | 'linear' | 'notion' | 'slack' | 'github';
  authUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  usesPkce: boolean;
  clientIdEnv: string;
  clientSecretEnv?: string;
  defaultScopes: string[];
  scopeSeparator: 'space' | 'comma';
  profileRequest?: {
    url: string;
    method: 'GET' | 'POST';
  };
}
```

Provider-specific adapters own API calls. They should not own token storage, state validation, or KDeck auth.

---

## Plugin Priority For OAuth-Gated Cluster

| Priority | Plugin group | Framework lesson | Notes |
|---|---|---|---|
| P7 | Twitch | OAuth user token, scopes, public chat actions, streamer workflow value | First proof plugin |
| P8 | Spotify | OAuth token refresh plus provider product constraints | Playback APIs require Premium and policy review |
| P9 | GitHub / Linear / Notion / Slack | Mixed OAuth/API-key productivity connectors | GitHub App may be better than OAuth App for repo permissions |
| P10 | YouTube Live / TikTok Live / Kick | Broadest live API complexity and provider review/access constraints | Add only after Twitch pattern is stable |

---

## First Provider Specs To Write After Framework

### Twitch Plugin Spec

Initial tools:

| Tool | Action ID | Scope |
|---|---|---|
| Create Clip | `twitch.clip.create` | `clips:edit` |
| Create Stream Marker | `twitch.marker.create` | `channel:manage:broadcast` |
| Update Stream Info | `twitch.channel.update` | `channel:manage:broadcast` |
| Send Chat Message | `twitch.chat.send` | `user:write:chat` |

Rules:

- Send chat message requires confirmation by default.
- Update stream info requires confirmation when it changes category/title.
- Clip creation should return edit/view URL only.
- Stream marker should show readable errors when the channel is not live or VOD storage is disabled.

### Spotify Plugin Spec

Initial tools:

| Tool | Action ID | Scope |
|---|---|---|
| Play/Pause | `spotify.playback.toggle` | `user-read-playback-state`, `user-modify-playback-state` |
| Next Track | `spotify.playback.next` | `user-modify-playback-state` |
| Previous Track | `spotify.playback.previous` | `user-modify-playback-state` |
| Save Current Track | `spotify.library.save-current` | `user-read-currently-playing`, `user-library-modify` |

Rules:

- Playback controls must show "Spotify Premium required" when Spotify returns Premium/account errors.
- Do not stream or proxy audio through KDeck.
- Keep Spotify volume/session controls in the local KDeck Media plugin when OS media sessions are enough.

### Productivity Connectors

Recommended order:

1. Linear OAuth, because it has a clear read/write scope model and refresh tokens.
2. Notion OAuth/API-token, because users may also want internal connection tokens.
3. Slack OAuth, because workspace install and bot/user token differences require extra UX copy.
4. GitHub, preferably as a GitHub App for fine-grained repository permissions. OAuth App can be deferred unless the first tools only need user-level scopes.

### Live Platform Connectors

Recommended order:

1. YouTube Live after Twitch.
2. Kick after YouTube or when a concrete Kick tool set is chosen.
3. TikTok Live only after API access, app review, and available live endpoints are confirmed.

---

## Confirmation UX For Cloud Tools

Some tools (chat messages, stream title changes) have `requires_confirmation = true` in `integration_tools`. The confirmation flow is:

1. Mobile sends `INTEGRATION_ACTION` with `params`.
2. Agent finds the tool and sees `requiresConfirmation = true`.
3. Agent sends `INTEGRATION_ACTION_CONFIRM { actionId, pluginId, toolId, params, summary }` to mobile.
4. Mobile shows an alert/sheet. User taps Confirm or Cancel.
5. Mobile sends `INTEGRATION_ACTION_CONFIRM_RESULT { actionId, confirmed }`.
6. Agent resumes execution if confirmed, returns `{ success: false, error: 'Canceled' }` if not.

The `summary` field is a human-readable description of what the action will do (e.g. "Send chat: Hello chat!"). The cloud executor must check `requiresConfirmation` before dispatching to the provider adapter and reject the request if the agent did not pass a `confirmed: true` flag.

---

## Mobile UX

`PluginConnectionScreen` should support `oauth2`:

- Shows provider account status.
- Lists requested permission groups in user language.
- Provides "Connect", "Reconnect", and "Disconnect".
- Opens provider URL using `Linking.openURL`.
- Polls connection status after returning from browser.
- Shows expired/error states with a single "Reconnect" action.

The existing `PluginConnectionStatusMessage` in `packages/shared/src/schema.ts` already carries `{ type, pluginId, status, error }`. Extend it — do not replace it — by adding the non-secret fields the OAuth UX needs:

```ts
// Extended fields added for OAuth connectors:
interface PluginConnectionStatusMessage {
  type: 'PLUGIN_CONNECTION_STATUS';
  pluginId: string;
  status: 'not_configured' | 'connected' | 'error' | 'expired';
  displayName?: string;        // e.g. "OBS Studio" or provider account label
  providerAccountName?: string; // e.g. "MyTwitchChannel"
  scopes?: string[];           // human-readable permission group names
  error?: string;
}
```

`apps/mobile/src/types/schema.ts` must be updated to mirror the shared type (until type generation is unified).

---

## Agent Changes

Add:

- `CloudIntegrationClient`
- WebSocket messages for OAuth start/status/disconnect
- `CommandService` branch for cloud tools
- Connection status proxy for `oauth2` and `api-key`

The agent should not implement provider SDKs for cloud tools. It should only:

- Authenticate to the KDeck web backend with the current Supabase access token.
- Pass the catalog action payload.
- Return the backend result to the mobile client.

---

## Security Requirements

- Hash OAuth `state` before storing it.
- Use PKCE for providers that support or require it.
- Store PKCE verifier encrypted or as a secret-only server value.
- Short expiry for OAuth states, default 10 minutes.
- Mark states consumed exactly once.
- Validate redirect URI against provider config.
- Enforce installed plugin and user ownership before OAuth start or cloud execute.
- Encrypt access and refresh tokens at rest.
- Do not include tokens in logs, mobile messages, agent messages, or run history.
- Store only non-secret account labels/scopes/expiry metadata in `user_cloud_connections`.
- Require confirmation for tools that post publicly, change live stream metadata, moderate users, or send chat.
- Revoke provider tokens on disconnect where provider supports revocation.
- Keep action audit records safe and small.

---

## Open Questions

| Question | Proposed answer |
|---|---|
| Should cloud actions execute directly from mobile? | No for MVP. Keep agent as the deck coordinator and delegate to web. |
| Should OAuth connect require dashboard login? | No. Agent bearer token should be enough to create a start URL. Dashboard flow remains optional. |
| Should one plugin support multiple accounts? | Not in MVP. Add a `connection_id` model later for Slack multi-workspace or multiple Twitch accounts. |
| Should API-key connectors use the same token table? | Yes. Store encrypted API keys in the same secret table with `provider = plugin.slug`. |
| Should token refresh be scheduled? | On-demand first. Add a scheduled health worker only if users see frequent expired states. |

---

## Source Notes

- Twitch OAuth scopes: https://dev.twitch.tv/docs/authentication/scopes/
- Twitch clips API: https://dev.twitch.tv/docs/api/clips/
- Twitch stream markers API: https://dev.twitch.tv/docs/api/markers
- Spotify OAuth/scopes model: https://developer.spotify.com/documentation/web-api/concepts/authorization
- Spotify playback Premium constraint: https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback
- YouTube Live OAuth: https://developers.google.com/youtube/v3/live/authentication
- YouTube Live overview: https://developers.google.com/youtube/v3/live/getting-started
- Slack OAuth v2: https://docs.slack.dev/authentication/installing-with-oauth/
- GitHub OAuth Apps: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- Linear OAuth: https://linear.app/developers/oauth-2-0-authentication
- Notion authorization: https://developers.notion.com/guides/get-started/authorization
- TikTok Login Kit OAuth basis: https://developers.tiktok.com/doc/login-kit-overview/
- Kick OAuth 2.1: https://docs.kick.com/getting-started/generating-tokens-oauth2-flow
