# Plugin Library - Design Spec

**Date:** 2026-05-21  
**Status:** Draft — revised after critique session  

---

## Overview

Add a first-class **Plugin Library** for app integrations. A plugin represents one app or service integration, such as OBS Studio, Twitch, YouTube Live, Philips Hue, Elgato Key Light, Discord, or Spotify. Each plugin contains a set of tools that perform specific functions for that app.

Users do not receive every integration tool by default. They browse the Plugin Library, install the plugins that match their interests and daily workflows, connect accounts or local services when required, then choose which tools to add to their deck or workflows.

This turns KDeck from a fixed set of buttons into an expandable control surface.

---

## Product Concept

The library should feel like a curated app store for control-surface capabilities, not a developer-only plugin directory.

For example:

| Plugin | Example tools |
|---|---|
| OBS Studio | Start stream, stop stream, switch scene, toggle source, start recording, save replay buffer |
| Twitch | Create clip, add stream marker, send chat message, update title/category, toggle slow mode |
| Smart Lighting | Toggle lights, set brightness, set color temperature, activate scene |
| Discord | Mute/deafen, join voice channel, set status, send message |
| YouTube Live | Start scheduled broadcast, send chat message, moderate chat, show viewer count |
| Spotify | Play/pause, next track, save track, switch playlist |

The important UX principle is:

> Installing a plugin unlocks capabilities. It does not automatically fill the user's deck.

After install, users can:
- Add individual tools to a deck
- Use tools inside workflows
- Add suggested starter tiles
- Configure accounts, devices, or local endpoints
- Disable or uninstall the plugin

---

## Goals

- Create a scalable structure for app integrations before implementing individual integrations.
- Let users install only the plugins they care about.
- Keep the default deck focused and uncluttered.
- Support local integrations, cloud API integrations, smart-home integrations, and AI-assisted tools under one model.
- Provide a clear path for every new tested integration to land in the Plugin Library.
- Preserve safety by using typed actions and reviewed plugin manifests, not arbitrary user-downloaded code in the MVP.

---

## Non-Goals

- No public third-party plugin SDK in the first version.
- No arbitrary remote code execution inside the agent.
- No paid plugin marketplace in the first version.
- No automatic deck population after install, except for an explicit "Add starter tools" CTA.
- No community publishing until there is enough user base and moderation capacity.

---

## Terminology

| Term | Meaning |
|---|---|
| Plugin | An app/service integration package, e.g. OBS Studio or Twitch |
| Tool | One action, state reader, trigger, or workflow step exposed by a plugin |
| Connector | The auth/config layer for a plugin, e.g. OAuth, API key, OBS WebSocket password, device discovery |
| Starter tools | Recommended tools shown after install, but added only when the user confirms |
| Installed plugin | A plugin the user installed and enabled for their account |
| Enabled tool | A tool available to add to decks/workflows because its plugin is installed |
| Tile | A user-facing deck button that points to a tool/action |
| State badge | Live status shown on a tile, e.g. "Streaming", current scene, muted, viewer count |
| Recipe | A ready-made workflow preset made from multiple tools, e.g. "Go Live" |
| Connection profile | A named set of local connection settings for a device context, e.g. "Home Studio", "Travel Kit" |

---

## Plugin Categories

Initial categories:

| Category | Examples | Product value |
|---|---|---|
| Streaming | OBS, Twitch, YouTube Live, Kick, TikTok Live | Creator acquisition and Stream Deck parity |
| Smart Lighting | Elgato Key Light, Philips Hue, Nanoleaf, LIFX | Strong demo value and creator utility |
| Audio | KDeck mixer, soundboard, Wave Link-style controls | Deep daily-use utility |
| Communication | Discord, Slack, Zoom, Teams | Productivity and creator coordination |
| Productivity | Notion, Linear, GitHub, Google Calendar | Developer/power-user workflows |
| Social | X, LinkedIn, Instagram helpers | Mostly AI copy/workflow value; direct API risk varies |
| Gaming | Steam, Epic, game launchers, replay tools | Gamer/streamer daily workflows |
| AI | AI tool packs, prompt workflows, BYOK providers | Existing KDeck differentiation |

---

## User Experience

### Library Entry Point

Add a new top-level **Plugins** area in the mobile app. It should be reachable from:

- Main tab/navigation
- Add Tile screen
- Settings sheet
- Empty states, e.g. "Install OBS plugin to add stream controls"

### Plugin Library Screen

The library shows:

- Search
- Category filters
- Installed / available filter
- Labs toggle (off by default) to surface beta plugins
- Plugin cards with name, icon, short description, install status, and required connection type
- Recommended collections such as "Streamer Starter Kit", "Developer Desk", "Smart Home Studio"

Plugin card states:

| State | UI behavior |
|---|---|
| Available | Shows Install |
| Installing | Progress/loading state |
| Installed, not configured | Shows Connect or Configure |
| Installed and ready | Shows Open / Add Tools |
| Requires agent update | Shows "Requires KDeck agent 1.X or newer" with update CTA |
| Deprecated | Shows warning and replacement suggestion |
| Unsupported on platform | Visible but disabled with explanation |

Note: there is no "Update plugin" state. Plugin manifests update silently from the catalog. When new execution code requires a newer agent, the card shows "Requires agent update" derived from `min_agent_capability`.

### Plugin Detail Screen

Each plugin detail screen shows:

- Plugin name, icon, publisher, version
- What it controls
- Required permissions or connections
- Supported platforms
- Tools list
- Starter recipes
- Privacy/safety note
- Install / Connect / Add Tools CTA

### Install Flow

1. User taps Install.
2. App writes a row to `user_plugin_installs` with `status = 'installed'`.
3. Agent receives or fetches updated installed plugin list.
4. If the plugin needs configuration, user is guided through setup.
5. Tools become visible in Add Tile and Workflow Builder.
6. User chooses individual tools to add.

Nothing is downloaded to the device. Plugin execution code ships inside the agent binary. Install is an account-side enable action.

### Uninstall Flow

1. User taps Uninstall.
2. Row in `user_plugin_installs` is soft-deleted: `status = 'uninstalled'`, `deleted_at = now()`.
3. Row is retained for a TTL window (default 30 days) to support undo.
4. After TTL, row is purged by a scheduled job.
5. Tools from this plugin disappear from Add Tile and Workflow Builder.
6. Existing tiles using tools from this plugin show a degraded state.

### Tool Selection Flow

After a plugin is installed:

- Add Tile → Plugins → installed plugin → list of tools
- User selects one tool
- If the tool requires parameters, show a configuration sheet
- Save creates a tile with an `INTEGRATION_ACTION`

Example OBS tool configuration:

| Tool | Required params |
|---|---|
| Switch Scene | `sceneName` |
| Toggle Source | `sceneName`, `sourceName` |
| Start Stream | none |
| Set Transition | `transitionName` |

---

## Architecture Principle

The MVP should use **catalog-gated built-in plugins**.

This means:

- Plugin manifests and tool metadata live in Supabase.
- Users install/enable plugins from the library.
- Execution code for first-party plugins ships inside the Electron/Nest agent.
- The mobile app and agent use the remote catalog to decide what is visible and enabled.
- No third-party code is downloaded and executed at runtime.

This gives the product the UX of a plugin library while keeping security, testing, and support manageable.

Later phases can add a true third-party SDK.

---

## Execution Model

Tools have execution modes:

| Mode | Runs where | Examples |
|---|---|---|
| Agent local | Desktop agent | OBS WebSocket, app control, local audio, clipboard, keystrokes |
| Mobile local | Mobile app | Open URL, local sharing, simple webhooks |
| Cloud API | Web/Edge/backend | OAuth token refresh, Twitch API, YouTube API |

Cross-environment actions (e.g. OBS scene switch + Twitch title update) are modelled as multi-step workflows, not as a single tool with a hybrid mode. Each step declares its own execution mode. The router stays single-mode.

Mobile-mode tools are thin wrappers. A single `executeMobileTool(actionId, params)` switch handles all cases. There is no mobile-side router in the MVP. If mobile tools grow complex enough to justify isolation, the switch becomes a router at that point.

Every tool should declare:

- Required execution mode
- Required connector
- Required platform
- Input params
- Output/result type
- Whether it can be used in workflows
- Whether it can show live state
- Whether it requires confirmation

---

## Connector Types

`connector_type` is an enum. Valid values:

| Value | Meaning |
|---|---|
| `oauth2` | Full OAuth redirect flow (Twitch, YouTube, Google) |
| `api-key` | User pastes a static API key (Notion, Linear) |
| `local-websocket` | Host + port + optional password (OBS WebSocket) |
| `local-http` | Host + port + optional auth (some lighting APIs) |
| `mdns-discovery` | Auto-discover device on local network (Hue Bridge, Elgato) |
| `none` | No connection needed (clipboard, URL launcher) |

This enum is enforced in both the DB check constraint and the shared TypeScript types so the mobile connection UI and agent `ConnectorService` branch on the same values.

---

## Data Model

### Catalog Tables

```sql
create table integration_plugins (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  category text not null,
  icon text not null,
  color text,
  publisher text not null default 'KDeck',
  version text not null default '1.0.0',
  status text not null check (status in ('draft','internal','beta','published','deprecated','disabled')),
  min_agent_capability int not null default 1,
  min_mobile_capability int not null default 1,
  supported_platforms text[] not null default array['win32','darwin'],
  requires_connector boolean not null default false,
  connector_type text check (connector_type in ('oauth2','api-key','local-websocket','local-http','mdns-discovery','none')),
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table integration_tools (
  id uuid primary key default gen_random_uuid(),
  plugin_id uuid not null references integration_plugins(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  icon text,
  color text,
  action_id text not null,
  execution_mode text not null check (execution_mode in ('agent','mobile','cloud')),
  params_schema jsonb not null default '{}'::jsonb,
  result_schema jsonb not null default '{}'::jsonb,
  supports_workflows boolean not null default true,
  supports_state boolean not null default false,
  requires_confirmation boolean not null default false,
  min_agent_capability int not null default 1,
  sort_order int not null default 0,
  status text not null check (status in ('draft','internal','beta','published','deprecated','disabled')),
  unique(plugin_id, slug)
);
```

`min_agent_capability` is a monotonic integer tied to the agent minor version. Capability 14 = agent 1.4.x. The "Requires agent update" card label derives from this: `"Requires KDeck agent 1.${min_agent_capability} or newer"`.

Manifest updates (description, sort order, new tools) are fetched silently from Supabase. They do not bump `min_agent_capability`. Only changes that require new agent execution code bump the capability.

### Recipes Catalog

```sql
create table integration_recipes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  icon text,
  required_plugin_slugs text[] not null default array[]::text[],
  workflow_snapshot jsonb not null,
  status text not null check (status in ('draft','internal','beta','published','deprecated','disabled')),
  sort_order int not null default 0,
  created_at timestamptz default now()
);
```

A recipe is a workflow preset. `workflow_snapshot` stores the full workflow definition (same shape as a user workflow). When a user applies a recipe, the snapshot is copied into their `user_workflows` table and the link to the recipe is severed — the user owns the workflow from that point. Recipe updates do not propagate to applied workflows.

`required_plugin_slugs` lists every plugin the recipe needs. The recipe CTA is hidden until all required plugins are installed, with a prompt to install missing ones.

### User Install State

```sql
create table user_plugin_installs (
  user_id uuid not null references auth.users(id),
  plugin_id uuid not null references integration_plugins(id),
  status text not null check (status in ('installed','disabled','uninstalled')),
  installed_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  primary key (user_id, plugin_id)
);
```

Uninstall is a soft-delete: `status = 'uninstalled'`, `deleted_at = now()`. Rows are retained for 30 days to support undo, then purged by a scheduled job. All "show installed plugins" queries filter on `status = 'installed' AND deleted_at IS NULL`.

### Connection State

Connection state is split into two tables because cloud connectors (OAuth, API key) are account-wide while local connectors (WebSocket, HTTP, mDNS) are per-device.

```sql
-- Cloud/OAuth connections: one record per user per plugin
create table user_cloud_connections (
  user_id uuid not null references auth.users(id),
  plugin_id uuid not null references integration_plugins(id),
  status text not null check (status in ('not_configured','connected','error','expired')),
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, plugin_id)
);

-- Local connections: one record per device per plugin
create table user_device_connections (
  user_id uuid not null references auth.users(id),
  device_id uuid not null,
  plugin_id uuid not null references integration_plugins(id),
  status text not null check (status in ('not_configured','connected','error','expired')),
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, device_id, plugin_id)
);
```

The `ConnectorService` routes to the correct table based on `plugin.connector_type`: `oauth2` and `api-key` use `user_cloud_connections`; `local-websocket`, `local-http`, and `mdns-discovery` use `user_device_connections`.

### Connection Profiles

A connection profile is a named set of local connection settings that can be saved, exported, imported, and synced across devices.

```sql
create table device_connection_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table device_connection_profile_items (
  profile_id uuid not null references device_connection_profiles(id) on delete cascade,
  plugin_id uuid not null references integration_plugins(id),
  connection_snapshot jsonb not null,
  primary key (profile_id, plugin_id)
);
```

`connection_snapshot` stores non-secret settings only (host, port, display name, preferences). Secrets are never included in profile snapshots. On import, the user is prompted to re-enter any required secrets. Export/import format is portable JSON. Sync propagates non-secret settings across devices and prompts for secrets per-device.

Example profiles: "Home Studio", "Office Rig", "Travel Kit".

### User Beta Access

Beta plugin visibility is controlled by a flag on the user profile:

```sql
-- Added to existing user profiles table
is_beta_tester boolean not null default false
```

The catalog fetch includes `status = 'beta'` plugins only when `is_beta_tester = true`. The Labs toggle in Settings writes this flag. Per-plugin beta access (private betas, invite-only rollouts) can be layered on later without changing this mechanism.

Secrets should not be stored directly in connection tables. OAuth refresh tokens, API keys, and local service passwords should be stored in the appropriate secure layer:

- Agent OS keychain for local secrets
- Supabase secrets or encrypted server-side storage for cloud connectors
- Mobile secure storage only for mobile-owned connector tokens

---

## Shared Schema Direction

Add a generic integration action instead of adding a new top-level action kind for every app:

```ts
export type ButtonAction =
  | ExistingActions
  | {
      kind: 'INTEGRATION_ACTION';
      pluginId: string;
      toolId: string;    // UUID — for analytics and logging
      actionId: string;  // string like "obs.stream.start" — used by the router for dispatch
      params: Record<string, unknown>;
    };
```

`toolId` and `actionId` serve different purposes. `actionId` is what the `IntegrationRouterService` uses to dispatch to the correct adapter. `toolId` is the catalog UUID, retained in the action payload for analytics and logging only. Do not treat them as interchangeable.

Add a generic state channel:

```ts
export interface IntegrationStateMessage {
  type: 'INTEGRATION_STATE';
  pluginId: string;
  states: Array<{
    toolId?: string;
    key: string;
    value: unknown;
    label?: string;
    updatedAt: string;
  }>;
}
```

Add catalog messages:

```ts
export interface PluginCatalogMessage {
  type: 'PLUGIN_CATALOG';
  plugins: IntegrationPlugin[];
}

export interface InstalledPluginsMessage {
  type: 'INSTALLED_PLUGINS';
  pluginIds: string[];
}
```

The exact TypeScript names can change during implementation, but the architectural direction should stay generic.

---

## Agent Architecture

### New Services

| Service | Responsibility |
|---|---|
| `PluginCatalogService` | Fetches plugin/tool catalog from Supabase and filters by capability/platform |
| `PluginInstallService` | Tracks installed plugins for the current user/device |
| `IntegrationRouterService` | Dispatches `INTEGRATION_ACTION` to the correct plugin module by `actionId` |
| `ConnectorService` | Routes to `user_cloud_connections` or `user_device_connections` based on `connector_type`; handles OAuth, API key, local endpoint, and device discovery setup |
| `IntegrationStateService` | Polls/subscribes to live states and broadcasts state badges |

### Plugin Modules

Each first-party plugin module should own one integration:

```text
apps/agent/src/integrations/
  obs/
    obs.module.ts
    obs.service.ts
    obs.actions.ts
    obs.state.ts
    obs.service.test.ts
  twitch/
    twitch.module.ts
    twitch.service.ts
  lighting/
    lighting.module.ts
```

Each module exposes a small adapter interface:

```ts
interface IntegrationAdapter {
  pluginSlug: string;
  canExecute(actionId: string): boolean;
  execute(actionId: string, params: Record<string, unknown>): Promise<CommandResult>;
  getState?(): Promise<IntegrationState[]>;
}
```

The router validates params against the tool's `params_schema` before dispatching.

---

## Mobile Architecture

### New Screens

| Screen | Purpose |
|---|---|
| `PluginLibraryScreen` | Browse/search/filter available plugins |
| `PluginDetailScreen` | Explain plugin, tools, permissions, install state |
| `PluginToolsScreen` | Add installed plugin tools to deck/workflows |
| `PluginConnectionScreen` | Connect account, local service, or device |
| `InstalledPluginsScreen` | Manage installed plugins, disable, uninstall |
| `ConnectionProfilesScreen` | Manage, export, import connection profiles |

### Mobile Tool Execution

Mobile-mode tools are dispatched through a single switch function:

```ts
function executeMobileTool(actionId: string, params: Record<string, unknown>): Promise<void>
```

No mobile-side router in the MVP. If mobile tool volume grows enough to justify isolation, the switch becomes a router at that point.

### Integration With Existing Screens

- `AddTileScreen` gets a Plugins tab.
- `WorkflowBuilderScreen` can add installed plugin tools as workflow steps.
- `DeckScreen` renders integration state badges on tiles.
- `SettingsSheet` links to Installed Plugins, Connections, and Connection Profiles.

---

## Plugin Lifecycle

Every new app integration should follow this lifecycle:

| Stage | Meaning | User visibility |
|---|---|---|
| Draft | Manifest exists, implementation incomplete | Hidden |
| Internal | Implemented enough for local testing | Hidden |
| Beta | Tested but still limited | Visible only to users with `is_beta_tester = true` |
| Published | Ready for normal users | Visible in library |
| Deprecated | Still works, but replacement exists or API is ending | Visible with warning |
| Disabled | Broken/security issue/API removed | Hidden or blocked |

Release checklist before Published:

- Manifest and tools are complete.
- Required permissions are clearly described.
- Unit tests cover action dispatch and param validation.
- Manual QA covers connect, execute, disconnect, reconnect, and error states.
- Failure states are user-readable.
- Tool works inside a deck tile.
- Tool works inside a workflow if `supports_workflows = true`.
- State badge works if `supports_state = true`.
- Secrets are not written to plain JSON config.
- Unsupported platforms are correctly hidden or disabled.
- `connector_type` uses a valid enum value.
- `min_agent_capability` is set to the current agent minor version if new execution code was added.

---

## First Plugin Candidates

Recommended sequence:

1. **OBS Studio**
   - Highest creator value and strongest Stream Deck parity gap.
   - Local agent execution through OBS WebSocket.
   - Good first test for action + live state architecture.

2. **Smart Lighting**
   - Strong visual demo value.
   - Useful in "Go Live" recipes.
   - Start with one provider or a generic local-network abstraction.

3. **Twitch**
   - Strong creator workflow value.
   - Requires OAuth and cloud/API handling.
   - Good test for account connectors.

4. **Soundboard / Audio**
   - Builds on current media mixer.
   - Strong daily utility for creators and gamers.

5. **YouTube Live / Kick**
   - Add after Twitch once the connector pattern is proven.

---

## Example Plugin Manifest

```json
{
  "slug": "obs",
  "name": "OBS Studio",
  "category": "streaming",
  "publisher": "KDeck",
  "version": "1.0.0",
  "requiresConnector": true,
  "connectorType": "local-websocket",
  "supportedPlatforms": ["win32", "darwin"],
  "tools": [
    {
      "slug": "start-stream",
      "name": "Start Stream",
      "actionId": "obs.stream.start",
      "executionMode": "agent",
      "paramsSchema": {},
      "supportsWorkflows": true,
      "supportsState": true
    },
    {
      "slug": "switch-scene",
      "name": "Switch Scene",
      "actionId": "obs.scene.switch",
      "executionMode": "agent",
      "paramsSchema": {
        "type": "object",
        "required": ["sceneName"],
        "properties": {
          "sceneName": { "type": "string" }
        }
      },
      "supportsWorkflows": true,
      "supportsState": true
    }
  ]
}
```

---

## Recipes

A recipe is a workflow preset. It is defined in the catalog (`integration_recipes`) and applied by copying its `workflow_snapshot` into the user's own workflows. The link to the recipe is severed on apply — the user owns the workflow and can edit it freely. Recipe updates do not propagate to workflows already applied by users.

`required_plugin_slugs` lists every plugin the recipe needs. The recipe card and CTA are hidden until all required plugins are installed, with a prompt to install the missing ones.

Example: **Go Live**

1. Turn studio lights on.
2. Set light temperature to 5600K.
3. Switch OBS scene to Starting Soon.
4. Start stream.
5. Send Twitch chat message.
6. Mute Discord notifications.

Each step is a single-mode tool call (`agent` or `cloud`). There is no hybrid step — cross-environment actions are expressed as sequential steps in the workflow.

---

## Safety Rules

- MVP plugins are metadata plus first-party compiled agent code.
- No runtime arbitrary JavaScript from Supabase.
- Every action must have a typed `actionId`.
- Every action must validate params against `params_schema` before execution.
- Destructive or public-facing actions require confirmation unless the user disables confirmation.
- OAuth scopes must be listed before connect.
- Any tool that posts publicly must show a clear label and confirmation option.
- Any local network connector must show connection status and troubleshooting steps.
- Connection profile exports must strip all secrets. Secrets are re-prompted on import.

---

## Relationship To AI Tool Packs

The existing AI packs are not replaced. They become the first example of library-driven capabilities.

Short term:

- Keep AI tool packs in their current pack system.
- Add Plugin Library for app integrations.

Medium term:

- Present AI packs as an "AI" category inside the same Library UX.
- Keep AI prompt tools and app integration tools under one user-facing concept: downloadable capabilities.

This avoids confusing users with separate stores for AI packs and app plugins.

---

## Open Questions (resolved)

| Question | Decision |
|---|---|
| Plugin installs: account-wide or per-device? | Account-wide visibility (`user_plugin_installs`). Per-device connection state (`user_device_connections`). Cloud connectors account-wide (`user_cloud_connections`). |
| Advanced plugins gated behind AI Pro? | Basic plugins for all licensed users. Cloud relay / heavy API recipes can be Pro. |
| Individual tools downloadable, or only via plugin install? | Install plugin first, then choose individual tools. |
| Beta plugins behind a Labs toggle? | Yes. `is_beta_tester` flag on user profile. Labs toggle in Settings. Off by default. |
| Uninstall: delete row or keep tombstone? | Soft-delete with 30-day TTL, then purge. |
| Plugin update model? | Manifest updates silent. Code changes surface as "Requires agent update" via `min_agent_capability`. |
| Hybrid execution mode? | Removed. Cross-environment actions are multi-step workflows. |
| Recipe model: template, preset, or linked? | Workflow preset. Copied into user workflows on apply, link severed. |

---

## Implementation Phases

### Phase 1 - Library Shell

- Supabase catalog tables for plugins, tools, recipes.
- User install state with soft-delete TTL.
- Split connection tables (`user_cloud_connections`, `user_device_connections`).
- Connection profile tables.
- Mobile Plugin Library UI.
- Agent catalog fetch and capability filtering.
- Installed plugin tools visible in Add Tile and Workflow Builder.
- No real integration required yet.

### Phase 2 - First Real Plugin: OBS

- OBS connector setup (`local-websocket`).
- Start/stop stream.
- Start/stop recording.
- Switch scene.
- Toggle source.
- Live stream/recording/scene state badges.

### Phase 3 - Recipes

- Recipe catalog data and apply flow.
- "Go Live" and "End Stream" workflow presets.
- Missing plugin install prompts.

### Phase 4 - Connectors

- OAuth-capable connector framework for Twitch/YouTube.
- Local network/device connectors for lighting (`mdns-discovery`, `local-http`).
- Connection health and token refresh.
- Connection profile export/import.

### Phase 5 - Marketplace Foundation

- Publisher metadata.
- Review workflow.
- Beta channels.
- Usage analytics.
- Eventually, third-party SDK.
