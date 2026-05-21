# Plugin Library: Phase 1 (Shell) + Phase 2 (OBS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Plugin Library infrastructure and ship the first real integration — OBS Studio with stream control, scene switching, and live state badges.

**Architecture:** Catalog-gated plugins: manifests and user install state live in Supabase, execution code ships in the agent binary. An `IntegrationRouterService` dispatches `INTEGRATION_ACTION` taps to registered `IntegrationAdapter` implementations. OBS is the first adapter, communicating via OBS WebSocket protocol v5. Mobile browses the catalog, installs plugins, and tiles tools.

**Tech Stack:** NestJS (agent), React Native/Expo (mobile), Supabase (catalog + user state), `obs-websocket-js` v5 (OBS), Jest (tests).

---

## File Map

### New files
| Path | Purpose |
|---|---|
| `supabase/migrations/20260521000013_plugins.sql` | Catalog + install + connection tables |
| `supabase/migrations/20260521000014_plugins_seed.sql` | OBS plugin + tools seed data |
| `packages/shared/src/schema.ts` | Add plugin types + messages (modify) |
| `apps/agent/src/integrations/integration.adapter.ts` | IntegrationAdapter interface |
| `apps/agent/src/integrations/plugin-catalog.service.ts` | Fetch catalog from Supabase |
| `apps/agent/src/integrations/plugin-catalog.service.spec.ts` | Unit tests |
| `apps/agent/src/integrations/plugin-install.service.ts` | User install state (install/uninstall) |
| `apps/agent/src/integrations/plugin-install.service.spec.ts` | Unit tests |
| `apps/agent/src/integrations/integration-router.service.ts` | Dispatch actionId → adapter |
| `apps/agent/src/integrations/integration-router.service.spec.ts` | Unit tests |
| `apps/agent/src/integrations/connector.service.ts` | Read/write device connection settings |
| `apps/agent/src/integrations/integration-state.service.ts` | Poll adapters, broadcast state |
| `apps/agent/src/integrations/integrations.module.ts` | NestJS feature module |
| `apps/agent/src/integrations/obs/obs.service.ts` | OBS adapter |
| `apps/agent/src/integrations/obs/obs.service.spec.ts` | Unit tests |
| `apps/mobile/src/screens/PluginLibraryScreen.tsx` | Browse/search/install plugins |
| `apps/mobile/src/screens/PluginDetailScreen.tsx` | Plugin detail + tools list |
| `apps/mobile/src/screens/PluginConnectionScreen.tsx` | OBS connection form |

### Modified files
| Path | Change |
|---|---|
| `packages/shared/src/schema.ts` | Add IntegrationPlugin, IntegrationTool, INTEGRATION_ACTION, 8 message types |
| `apps/agent/src/app.module.ts` | Import IntegrationsModule |
| `apps/agent/src/command/command.service.ts` | Add INTEGRATION_ACTION case |
| `apps/agent/src/websocket/ws.gateway.ts` | Add plugin message handlers, send catalog on connect |
| `apps/agent/src/license/license.service.ts` | Add getUserId() method |
| `apps/mobile/src/services/websocket.service.ts` | Add plugin message send/receive |
| `apps/mobile/src/screens/DeckScreen.tsx` | Plugin library modal + state badges |
| `apps/mobile/src/screens/AddTileScreen.tsx` | Plugins tab |

---

## Task 1: Supabase Migration — Catalog + Connection Tables

**Files:**
- Create: `supabase/migrations/20260521000013_plugins.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260521000013_plugins.sql

-- Plugin catalog (public read, service-role write)
CREATE TABLE IF NOT EXISTS public.integration_plugins (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 text UNIQUE NOT NULL,
  name                 text NOT NULL,
  description          text,
  category             text NOT NULL,
  icon                 text NOT NULL,
  color                text,
  publisher            text NOT NULL DEFAULT 'KDeck',
  version              text NOT NULL DEFAULT '1.0.0',
  status               text NOT NULL CHECK (status IN ('draft','internal','beta','published','deprecated','disabled')),
  min_agent_capability int  NOT NULL DEFAULT 1,
  min_mobile_capability int NOT NULL DEFAULT 1,
  supported_platforms  text[] NOT NULL DEFAULT ARRAY['win32','darwin'],
  requires_connector   boolean NOT NULL DEFAULT false,
  connector_type       text CHECK (connector_type IN ('oauth2','api-key','local-websocket','local-http','mdns-discovery','none')),
  sort_order           int NOT NULL DEFAULT 0,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integration_tools (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id             uuid NOT NULL REFERENCES public.integration_plugins(id) ON DELETE CASCADE,
  slug                  text NOT NULL,
  name                  text NOT NULL,
  description           text,
  icon                  text,
  color                 text,
  action_id             text NOT NULL,
  execution_mode        text NOT NULL CHECK (execution_mode IN ('agent','mobile','cloud')),
  params_schema         jsonb NOT NULL DEFAULT '{}',
  result_schema         jsonb NOT NULL DEFAULT '{}',
  supports_workflows    boolean NOT NULL DEFAULT true,
  supports_state        boolean NOT NULL DEFAULT false,
  requires_confirmation boolean NOT NULL DEFAULT false,
  min_agent_capability  int NOT NULL DEFAULT 1,
  sort_order            int NOT NULL DEFAULT 0,
  status                text NOT NULL CHECK (status IN ('draft','internal','beta','published','deprecated','disabled')),
  UNIQUE (plugin_id, slug)
);

-- User install state with soft-delete
CREATE TABLE IF NOT EXISTS public.user_plugin_installs (
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  plugin_id    uuid NOT NULL REFERENCES public.integration_plugins(id),
  status       text NOT NULL CHECK (status IN ('installed','disabled','uninstalled')),
  installed_at timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  deleted_at   timestamptz,
  PRIMARY KEY (user_id, plugin_id)
);

-- Cloud connections (OAuth/API-key) — account-wide, one row per user per plugin
CREATE TABLE IF NOT EXISTS public.user_cloud_connections (
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  plugin_id    uuid NOT NULL REFERENCES public.integration_plugins(id),
  status       text NOT NULL CHECK (status IN ('not_configured','connected','error','expired')),
  display_name text,
  metadata     jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, plugin_id)
);

-- Device connections (local-websocket, local-http, mdns-discovery) — per device
CREATE TABLE IF NOT EXISTS public.user_device_connections (
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  device_id    text NOT NULL,
  plugin_id    uuid NOT NULL REFERENCES public.integration_plugins(id),
  status       text NOT NULL CHECK (status IN ('not_configured','connected','error','expired')),
  display_name text,
  metadata     jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, device_id, plugin_id)
);

-- RLS: catalog tables are public read
ALTER TABLE public.integration_plugins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_tools   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_plugin_installs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cloud_connections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_device_connections   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "integration_plugins_public_read" ON public.integration_plugins FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "integration_tools_public_read" ON public.integration_tools FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "user_plugin_installs_owner" ON public.user_plugin_installs FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "user_cloud_connections_owner" ON public.user_cloud_connections FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "user_device_connections_owner" ON public.user_device_connections FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS integration_tools_plugin_id_idx ON public.integration_tools(plugin_id);
CREATE INDEX IF NOT EXISTS user_plugin_installs_user_id_idx ON public.user_plugin_installs(user_id) WHERE deleted_at IS NULL;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260521000013_plugins.sql
git commit -m "feat(db): add plugin library tables — catalog, installs, connections"
```

---

## Task 2: OBS Seed Data

**Files:**
- Create: `supabase/migrations/20260521000014_plugins_seed.sql`

- [ ] **Step 1: Write the seed**

```sql
-- supabase/migrations/20260521000014_plugins_seed.sql

INSERT INTO public.integration_plugins
  (slug, name, description, category, icon, color, publisher, version, status,
   min_agent_capability, supported_platforms, requires_connector, connector_type, sort_order)
VALUES
  ('obs', 'OBS Studio', 'Control your OBS stream: start/stop, switch scenes, toggle sources, and see live status badges.',
   'streaming', 'video-camera', '#1a1a2e', 'KDeck', '1.0.0', 'published',
   1, ARRAY['win32','darwin'], true, 'local-websocket', 10)
ON CONFLICT (slug) DO NOTHING;

-- Insert tools, referencing the plugin by slug
WITH plugin AS (SELECT id FROM public.integration_plugins WHERE slug = 'obs')
INSERT INTO public.integration_tools
  (plugin_id, slug, name, description, action_id, execution_mode,
   params_schema, supports_workflows, supports_state, requires_confirmation, sort_order, status)
SELECT
  plugin.id, t.slug, t.name, t.description, t.action_id, 'agent',
  t.params_schema::jsonb, t.supports_workflows, t.supports_state, t.requires_confirmation, t.sort_order, 'published'
FROM plugin, (VALUES
  ('start-stream',    'Start Stream',    'Start streaming in OBS.',          'obs.stream.start',    '{}',
    true, true, false, 10),
  ('stop-stream',     'Stop Stream',     'Stop streaming in OBS.',           'obs.stream.stop',     '{}',
    true, true, false, 20),
  ('start-recording', 'Start Recording', 'Start recording in OBS.',          'obs.record.start',    '{}',
    true, true, false, 30),
  ('stop-recording',  'Stop Recording',  'Stop recording in OBS.',           'obs.record.stop',     '{}',
    true, true, false, 40),
  ('switch-scene',    'Switch Scene',    'Switch to a specific OBS scene.',  'obs.scene.switch',
    '{"type":"object","required":["sceneName"],"properties":{"sceneName":{"type":"string"}}}',
    true, true, false, 50),
  ('toggle-source',   'Toggle Source',   'Show or hide a source in a scene.','obs.source.toggle',
    '{"type":"object","required":["sceneName","sourceName"],"properties":{"sceneName":{"type":"string"},"sourceName":{"type":"string"}}}',
    true, false, false, 60)
) AS t(slug, name, description, action_id, params_schema, supports_workflows, supports_state, requires_confirmation, sort_order)
ON CONFLICT (plugin_id, slug) DO NOTHING;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260521000014_plugins_seed.sql
git commit -m "feat(db): seed OBS Studio plugin and tools"
```

---

## Task 3: Shared Types

**Files:**
- Modify: `packages/shared/src/schema.ts`

- [ ] **Step 1: Add plugin catalog types and messages after line 56 (after the Pack types block)**

Open `packages/shared/src/schema.ts`. After the closing brace of `PackRegistryMessage` (line 56), insert:

```typescript
// --- Integration plugin types ---

export type ConnectorType = 'oauth2' | 'api-key' | 'local-websocket' | 'local-http' | 'mdns-discovery' | 'none';
export type PluginStatus = 'draft' | 'internal' | 'beta' | 'published' | 'deprecated' | 'disabled';
export type ExecutionMode = 'agent' | 'mobile' | 'cloud';

export interface IntegrationTool {
  id: string;
  pluginId: string;
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  actionId: string;
  executionMode: ExecutionMode;
  paramsSchema: Record<string, unknown>;
  supportsWorkflows: boolean;
  supportsState: boolean;
  requiresConfirmation: boolean;
  minAgentCapability: number;
  sortOrder: number;
  status: PluginStatus;
}

export interface IntegrationPlugin {
  id: string;
  slug: string;
  name: string;
  description?: string;
  category: string;
  icon: string;
  color?: string;
  publisher: string;
  version: string;
  status: PluginStatus;
  minAgentCapability: number;
  minMobileCapability: number;
  supportedPlatforms: string[];
  requiresConnector: boolean;
  connectorType?: ConnectorType;
  sortOrder: number;
  tools: IntegrationTool[];
}

// Mobile → Agent: plugin messages
export interface GetPluginCatalogMessage { type: 'GET_PLUGIN_CATALOG' }
export interface InstallPluginMessage    { type: 'INSTALL_PLUGIN';   pluginId: string }
export interface UninstallPluginMessage  { type: 'UNINSTALL_PLUGIN'; pluginId: string }

export interface SetPluginConnectionMessage {
  type:     'SET_PLUGIN_CONNECTION';
  pluginId: string;
  metadata: Record<string, unknown>;
}

export interface TestPluginConnectionMessage {
  type:     'TEST_PLUGIN_CONNECTION';
  pluginId: string;
}

// Agent → Mobile: plugin messages
export interface PluginCatalogMessage {
  type:    'PLUGIN_CATALOG';
  plugins: IntegrationPlugin[];
}

export interface InstalledPluginsMessage {
  type:               'INSTALLED_PLUGINS';
  installedPluginIds: string[];
}

export interface PluginConnectionStatusMessage {
  type:     'PLUGIN_CONNECTION_STATUS';
  pluginId: string;
  status:   'not_configured' | 'connected' | 'error' | 'expired';
  error?:   string;
}

export interface IntegrationStateMessage {
  type:     'INTEGRATION_STATE';
  pluginId: string;
  states:   Array<{
    toolId?:   string;
    key:       string;
    value:     unknown;
    label?:    string;
    updatedAt: string;
  }>;
}
```

- [ ] **Step 2: Add `INTEGRATION_ACTION` to `ButtonAction` (line 8)**

Replace the `ButtonAction` type:

```typescript
export type ButtonAction =
  | { kind: 'AI_CLIPBOARD'; prompt: string; outputMode: 'clipboard' | 'autopaste' | 'viewer'; toolId?: string }
  | { kind: 'KEYSTROKE'; keys: string[] }
  | { kind: 'APP_LAUNCH'; appId: string }
  | { kind: 'URL_OPEN'; url: string }
  | { kind: 'CLIPBOARD_WRITE'; text: string }
  | { kind: 'EXEC'; exePath: string }
  | { kind: 'WORKFLOW'; steps: WorkflowStep[]; stopOnError: boolean }
  | { kind: 'INTEGRATION_ACTION'; pluginId: string; toolId: string; actionId: string; params: Record<string, unknown> };
```

- [ ] **Step 3: Add `'integration'` to `TileConfig.kind`** (line 75)

```typescript
export interface TileConfig {
  id: string;
  kind: 'app' | 'url' | 'ai' | 'shortcut' | 'custom' | 'workflow' | 'integration';
  label: string;
  iconId: string;
  color?: string;
  iconBase64?: string;
  pinned?: boolean;
  action: ButtonAction;
}
```

- [ ] **Step 4: Add new message types to `AgentMessage` and `MobileMessage` unions**

```typescript
export type AgentMessage =
  | ActionResultMessage
  | ConnectedMessage
  | DeckConfigMessage
  | SearchAppsResultMessage
  | ValidatePathResultMessage
  | LicenseStatusMessage
  | AiQuotaExceededMessage
  | ContextShortcutsMessage
  | ContextProfilesMessage
  | PackRegistryMessage
  | MediaStateMessage
  | PluginCatalogMessage
  | InstalledPluginsMessage
  | PluginConnectionStatusMessage
  | IntegrationStateMessage;

export type MobileMessage =
  | ButtonTapMessage
  | AddTileMessage
  | RemoveTileMessage
  | SetTilePinnedMessage
  | SearchAppsMessage
  | ValidatePathMessage
  | OpenActivationDialogMessage
  | GetLicenseStatusMessage
  | RevalidateLicenseMessage
  | AddContextShortcutMessage
  | RemoveContextShortcutMessage
  | GetContextProfilesMessage
  | MouseMoveMessage
  | MouseClickMessage
  | MouseScrollMessage
  | MediaVolumeDeltaMessage
  | MediaSetMuteMessage
  | MediaBringToFrontMessage
  | MediaPinAppMessage
  | MediaSetVolumeMessage
  | GetPluginCatalogMessage
  | InstallPluginMessage
  | UninstallPluginMessage
  | SetPluginConnectionMessage
  | TestPluginConnectionMessage;
```

- [ ] **Step 5: Build shared package to confirm no type errors**

```bash
cd packages/shared && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schema.ts
git commit -m "feat(shared): add IntegrationPlugin, IntegrationTool, INTEGRATION_ACTION, plugin WebSocket messages"
```

---

## Task 4: LicenseService — expose getUserId()

**Files:**
- Modify: `apps/agent/src/license/license.service.ts`

- [ ] **Step 1: Read the full file**

Open `apps/agent/src/license/license.service.ts`. Find the `LicenseClaims` interface definition. It will contain fields like `licensed`, `ai_pro`, `credits_remaining`, `credit_quota`. The JWT `sub` claim is the user ID.

- [ ] **Step 2: Add `sub` to LicenseClaims and expose getUserId()**

Locate the `LicenseClaims` interface and add `sub: string`:

```typescript
interface LicenseClaims {
  sub: string;          // add this line — JWT subject = Supabase user ID
  licensed: boolean;
  ai_pro: boolean;
  credits_remaining: number;
  credit_quota: number;
}
```

Add a public method after `getClaims()`:

```typescript
getUserId(): string | null {
  return this.claims?.sub ?? null;
}
```

- [ ] **Step 3: Verify the agent compiles**

```bash
cd apps/agent && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/license/license.service.ts
git commit -m "feat(agent): expose getUserId() on LicenseService"
```

---

## Task 5: Agent — IntegrationAdapter interface

**Files:**
- Create: `apps/agent/src/integrations/integration.adapter.ts`

- [ ] **Step 1: Create the file**

```typescript
// apps/agent/src/integrations/integration.adapter.ts
import { CommandResult } from '../command/command.service';

export interface IntegrationState {
  toolId?:   string;
  key:       string;
  value:     unknown;
  label?:    string;
  updatedAt: string;
}

export interface IntegrationAdapter {
  readonly pluginSlug: string;
  canExecute(actionId: string): boolean;
  execute(actionId: string, params: Record<string, unknown>): Promise<CommandResult>;
  getState?(): Promise<IntegrationState[]>;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent/src/integrations/integration.adapter.ts
git commit -m "feat(agent): add IntegrationAdapter interface"
```

---

## Task 6: Agent — PluginCatalogService

**Files:**
- Create: `apps/agent/src/integrations/plugin-catalog.service.ts`
- Create: `apps/agent/src/integrations/plugin-catalog.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/agent/src/integrations/plugin-catalog.service.spec.ts
const mockSelect = jest.fn();
const mockLte    = jest.fn();
const mockFrom   = jest.fn(() => ({ select: mockSelect }));
mockSelect.mockReturnValue({ lte: mockLte });
mockLte.mockResolvedValue({ data: null, error: null });

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));

import { PluginCatalogService } from './plugin-catalog.service';

describe('PluginCatalogService', () => {
  let service: PluginCatalogService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PluginCatalogService();
  });

  it('returns empty array before load', () => {
    expect(service.getPlugins()).toEqual([]);
  });

  it('loads and maps plugins from Supabase', async () => {
    const rawPlugin = {
      id: 'uuid-1', slug: 'obs', name: 'OBS Studio', description: 'Control OBS',
      category: 'streaming', icon: 'camera', color: '#000', publisher: 'KDeck',
      version: '1.0.0', status: 'published', min_agent_capability: 1,
      min_mobile_capability: 1, supported_platforms: ['win32','darwin'],
      requires_connector: true, connector_type: 'local-websocket', sort_order: 10,
      integration_tools: [{
        id: 'tool-1', plugin_id: 'uuid-1', slug: 'start-stream', name: 'Start Stream',
        description: null, icon: null, color: null, action_id: 'obs.stream.start',
        execution_mode: 'agent', params_schema: {}, result_schema: {},
        supports_workflows: true, supports_state: true, requires_confirmation: false,
        min_agent_capability: 1, sort_order: 10, status: 'published',
      }],
    };
    mockLte.mockResolvedValue({ data: [rawPlugin], error: null });

    await service.load();

    const plugins = service.getPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].slug).toBe('obs');
    expect(plugins[0].tools).toHaveLength(1);
    expect(plugins[0].tools[0].actionId).toBe('obs.stream.start');
  });

  it('filters out plugins whose minAgentCapability exceeds AGENT_CAPABILITY', async () => {
    const rawPlugin = {
      id: 'uuid-2', slug: 'future', name: 'Future Plugin', description: null,
      category: 'ai', icon: 'star', color: null, publisher: 'KDeck',
      version: '2.0.0', status: 'published', min_agent_capability: 99,
      min_mobile_capability: 1, supported_platforms: ['win32','darwin'],
      requires_connector: false, connector_type: null, sort_order: 0,
      integration_tools: [],
    };
    mockLte.mockResolvedValue({ data: [rawPlugin], error: null });

    await service.load();

    expect(service.getPlugins()).toHaveLength(0);
  });

  it('filters out non-published plugins', async () => {
    const rawPlugin = {
      id: 'uuid-3', slug: 'draft-plugin', name: 'Draft', description: null,
      category: 'streaming', icon: 'star', color: null, publisher: 'KDeck',
      version: '1.0.0', status: 'draft', min_agent_capability: 1,
      min_mobile_capability: 1, supported_platforms: ['win32','darwin'],
      requires_connector: false, connector_type: null, sort_order: 0,
      integration_tools: [],
    };
    mockLte.mockResolvedValue({ data: [rawPlugin], error: null });

    await service.load();

    expect(service.getPlugins()).toHaveLength(0);
  });

  it('survives Supabase error without throwing', async () => {
    mockLte.mockResolvedValue({ data: null, error: { message: 'network error' } });
    await expect(service.load()).resolves.toBeUndefined();
    expect(service.getPlugins()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module not found)**

```bash
cd apps/agent && npx jest src/integrations/plugin-catalog.service.spec.ts --no-coverage
```

Expected: `Cannot find module './plugin-catalog.service'`

- [ ] **Step 3: Implement PluginCatalogService**

```typescript
// apps/agent/src/integrations/plugin-catalog.service.ts
import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IntegrationPlugin, IntegrationTool, PluginStatus } from '@control-surface/shared';
import ws from 'ws';
import { platform } from 'os';

export const AGENT_CAPABILITY = 1;
const VISIBLE_STATUSES: PluginStatus[] = ['published'];

interface RawTool {
  id: string; plugin_id: string; slug: string; name: string; description: string | null;
  icon: string | null; color: string | null; action_id: string; execution_mode: string;
  params_schema: Record<string, unknown>; result_schema: Record<string, unknown>;
  supports_workflows: boolean; supports_state: boolean; requires_confirmation: boolean;
  min_agent_capability: number; sort_order: number; status: string;
}

interface RawPlugin {
  id: string; slug: string; name: string; description: string | null;
  category: string; icon: string; color: string | null; publisher: string;
  version: string; status: string; min_agent_capability: number;
  min_mobile_capability: number; supported_platforms: string[];
  requires_connector: boolean; connector_type: string | null; sort_order: number;
  integration_tools: RawTool[];
}

@Injectable()
export class PluginCatalogService {
  private readonly supabase: SupabaseClient;
  private plugins: IntegrationPlugin[] = [];

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL ?? '',
      process.env.SUPABASE_ANON_KEY ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { realtime: { transport: ws as any } },
    );
  }

  async load(): Promise<void> {
    try {
      const os = platform();
      const { data, error } = await this.supabase
        .from('integration_plugins')
        .select('*, integration_tools(*)')
        .lte('min_agent_capability', AGENT_CAPABILITY);

      if (error || !data) {
        console.warn('[PluginCatalog] Failed to load:', error?.message);
        return;
      }

      this.plugins = (data as RawPlugin[])
        .filter((p) => VISIBLE_STATUSES.includes(p.status as PluginStatus))
        .filter((p) => p.min_agent_capability <= AGENT_CAPABILITY)
        .filter((p) => p.supported_platforms.includes(os))
        .map((raw) => this.mapPlugin(raw))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      console.log(`[PluginCatalog] Loaded ${this.plugins.length} plugins`);
    } catch (err) {
      console.warn('[PluginCatalog] Unexpected error:', err);
    }
  }

  getPlugins(): IntegrationPlugin[] {
    return this.plugins;
  }

  getPlugin(slug: string): IntegrationPlugin | undefined {
    return this.plugins.find((p) => p.slug === slug);
  }

  private mapPlugin(raw: RawPlugin): IntegrationPlugin {
    const tools: IntegrationTool[] = (raw.integration_tools ?? [])
      .filter((t) => (VISIBLE_STATUSES as string[]).includes(t.status))
      .filter((t) => t.min_agent_capability <= AGENT_CAPABILITY)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => ({
        id: t.id, pluginId: t.plugin_id, slug: t.slug, name: t.name,
        description: t.description ?? undefined, icon: t.icon ?? undefined,
        color: t.color ?? undefined, actionId: t.action_id,
        executionMode: t.execution_mode as IntegrationTool['executionMode'],
        paramsSchema: t.params_schema ?? {}, supportsWorkflows: t.supports_workflows,
        supportsState: t.supports_state, requiresConfirmation: t.requires_confirmation,
        minAgentCapability: t.min_agent_capability, sortOrder: t.sort_order,
        status: t.status as PluginStatus,
      }));

    return {
      id: raw.id, slug: raw.slug, name: raw.name,
      description: raw.description ?? undefined, category: raw.category,
      icon: raw.icon, color: raw.color ?? undefined, publisher: raw.publisher,
      version: raw.version, status: raw.status as PluginStatus,
      minAgentCapability: raw.min_agent_capability,
      minMobileCapability: raw.min_mobile_capability,
      supportedPlatforms: raw.supported_platforms,
      requiresConnector: raw.requires_connector,
      connectorType: raw.connector_type as IntegrationPlugin['connectorType'],
      sortOrder: raw.sort_order, tools,
    };
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/agent && npx jest src/integrations/plugin-catalog.service.spec.ts --no-coverage
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/integrations/plugin-catalog.service.ts \
        apps/agent/src/integrations/plugin-catalog.service.spec.ts
git commit -m "feat(agent): PluginCatalogService — load and filter integration plugins from Supabase"
```

---

## Task 7: Agent — PluginInstallService

**Files:**
- Create: `apps/agent/src/integrations/plugin-install.service.ts`
- Create: `apps/agent/src/integrations/plugin-install.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/agent/src/integrations/plugin-install.service.spec.ts
const mockEq       = jest.fn();
const mockEq2      = jest.fn();
const mockIsNull   = jest.fn();
const mockSelect   = jest.fn();
const mockUpsert   = jest.fn();
const mockFrom     = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));

const mockLicenseService = { getUserId: jest.fn(() => 'user-123') };

import { PluginInstallService } from './plugin-install.service';

describe('PluginInstallService', () => {
  let service: PluginInstallService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
    });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ eq: mockEq2 });
    mockEq2.mockReturnValue({ is: mockIsNull });
    mockIsNull.mockResolvedValue({ data: [], error: null });
    mockUpsert.mockResolvedValue({ error: null });

    service = new PluginInstallService(mockLicenseService as any);
  });

  it('returns empty set before fetch', () => {
    expect(service.getInstalledPluginIds()).toEqual([]);
  });

  it('fetchInstalled populates installed set', async () => {
    mockIsNull.mockResolvedValue({
      data: [{ plugin_id: 'uuid-obs' }, { plugin_id: 'uuid-twitch' }],
      error: null,
    });

    await service.fetchInstalled();

    expect(service.getInstalledPluginIds()).toEqual(['uuid-obs', 'uuid-twitch']);
    expect(service.isInstalled('uuid-obs')).toBe(true);
    expect(service.isInstalled('uuid-missing')).toBe(false);
  });

  it('install writes to Supabase and updates local set', async () => {
    await service.install('uuid-obs');

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ plugin_id: 'uuid-obs', status: 'installed' }),
      expect.anything(),
    );
    expect(service.isInstalled('uuid-obs')).toBe(true);
  });

  it('uninstall soft-deletes and removes from local set', async () => {
    await service.install('uuid-obs');
    await service.uninstall('uuid-obs');

    expect(mockUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ plugin_id: 'uuid-obs', status: 'uninstalled' }),
      expect.anything(),
    );
    expect(service.isInstalled('uuid-obs')).toBe(false);
  });

  it('install is a no-op when userId is null', async () => {
    mockLicenseService.getUserId.mockReturnValue(null);
    await service.install('uuid-obs');
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/agent && npx jest src/integrations/plugin-install.service.spec.ts --no-coverage
```

Expected: `Cannot find module './plugin-install.service'`

- [ ] **Step 3: Implement PluginInstallService**

```typescript
// apps/agent/src/integrations/plugin-install.service.ts
import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LicenseService } from '../license/license.service';
import ws from 'ws';

@Injectable()
export class PluginInstallService {
  private readonly supabase: SupabaseClient;
  private installedIds = new Set<string>();

  constructor(private readonly licenseService: LicenseService) {
    // Service role key bypasses RLS; userId is passed explicitly in queries.
    this.supabase = createClient(
      process.env.SUPABASE_URL ?? '',
      process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { realtime: { transport: ws as any } },
    );
  }

  async fetchInstalled(): Promise<void> {
    const userId = this.licenseService.getUserId();
    if (!userId) return;

    const { data, error } = await this.supabase
      .from('user_plugin_installs')
      .select('plugin_id')
      .eq('user_id', userId)
      .eq('status', 'installed')
      .is('deleted_at', null);

    if (error) {
      console.warn('[PluginInstall] Failed to fetch installs:', error.message);
      return;
    }

    this.installedIds = new Set((data ?? []).map((r: { plugin_id: string }) => r.plugin_id));
  }

  async install(pluginId: string): Promise<void> {
    const userId = this.licenseService.getUserId();
    if (!userId) return;

    const { error } = await this.supabase
      .from('user_plugin_installs')
      .upsert(
        { user_id: userId, plugin_id: pluginId, status: 'installed', deleted_at: null, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,plugin_id' },
      );

    if (error) {
      console.warn('[PluginInstall] Failed to install:', error.message);
      return;
    }

    this.installedIds.add(pluginId);
  }

  async uninstall(pluginId: string): Promise<void> {
    const userId = this.licenseService.getUserId();
    if (!userId) return;

    const { error } = await this.supabase
      .from('user_plugin_installs')
      .upsert(
        { user_id: userId, plugin_id: pluginId, status: 'uninstalled', deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: 'user_id,plugin_id' },
      );

    if (error) {
      console.warn('[PluginInstall] Failed to uninstall:', error.message);
      return;
    }

    this.installedIds.delete(pluginId);
  }

  getInstalledPluginIds(): string[] {
    return Array.from(this.installedIds);
  }

  isInstalled(pluginId: string): boolean {
    return this.installedIds.has(pluginId);
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd apps/agent && npx jest src/integrations/plugin-install.service.spec.ts --no-coverage
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/integrations/plugin-install.service.ts \
        apps/agent/src/integrations/plugin-install.service.spec.ts
git commit -m "feat(agent): PluginInstallService — install/uninstall with soft-delete"
```

---

## Task 8: Agent — IntegrationRouterService

**Files:**
- Create: `apps/agent/src/integrations/integration-router.service.ts`
- Create: `apps/agent/src/integrations/integration-router.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/agent/src/integrations/integration-router.service.spec.ts
import { IntegrationRouterService } from './integration-router.service';
import { IntegrationAdapter } from './integration.adapter';

const makeAdapter = (slug: string, actionIds: string[]): IntegrationAdapter => ({
  pluginSlug: slug,
  canExecute: (id) => actionIds.includes(id),
  execute: jest.fn().mockResolvedValue({ success: true }),
});

describe('IntegrationRouterService', () => {
  let router: IntegrationRouterService;

  beforeEach(() => {
    router = new IntegrationRouterService();
  });

  it('dispatches to the correct adapter by actionId', async () => {
    const obs = makeAdapter('obs', ['obs.stream.start']);
    router.register(obs);

    const result = await router.dispatch('obs.stream.start', {});
    expect(result.success).toBe(true);
    expect(obs.execute).toHaveBeenCalledWith('obs.stream.start', {});
  });

  it('returns error when no adapter handles actionId', async () => {
    const result = await router.dispatch('unknown.action', {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no adapter/i);
  });

  it('validates required params before dispatch', async () => {
    const obs = makeAdapter('obs', ['obs.scene.switch']);
    router.register(obs);
    // sceneName is required per OBS schema; passing empty object should fail validation
    const schema = { type: 'object', required: ['sceneName'], properties: { sceneName: { type: 'string' } } };

    const result = await router.dispatch('obs.scene.switch', {}, schema);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sceneName/);
  });

  it('passes valid params through to adapter', async () => {
    const obs = makeAdapter('obs', ['obs.scene.switch']);
    router.register(obs);
    const schema = { type: 'object', required: ['sceneName'], properties: { sceneName: { type: 'string' } } };

    const result = await router.dispatch('obs.scene.switch', { sceneName: 'Gaming' }, schema);
    expect(result.success).toBe(true);
    expect(obs.execute).toHaveBeenCalledWith('obs.scene.switch', { sceneName: 'Gaming' });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/agent && npx jest src/integrations/integration-router.service.spec.ts --no-coverage
```

Expected: `Cannot find module './integration-router.service'`

- [ ] **Step 3: Implement IntegrationRouterService**

```typescript
// apps/agent/src/integrations/integration-router.service.ts
import { Injectable } from '@nestjs/common';
import { CommandResult } from '../command/command.service';
import { IntegrationAdapter } from './integration.adapter';

@Injectable()
export class IntegrationRouterService {
  private readonly adapters: IntegrationAdapter[] = [];

  register(adapter: IntegrationAdapter): void {
    this.adapters.push(adapter);
  }

  async dispatch(
    actionId: string,
    params: Record<string, unknown>,
    paramsSchema?: Record<string, unknown>,
  ): Promise<CommandResult> {
    if (paramsSchema) {
      const err = this.validateParams(params, paramsSchema);
      if (err) return { success: false, error: err };
    }

    const adapter = this.adapters.find((a) => a.canExecute(actionId));
    if (!adapter) return { success: false, error: `No adapter handles actionId: ${actionId}` };

    return adapter.execute(actionId, params);
  }

  getAdapters(): IntegrationAdapter[] {
    return this.adapters;
  }

  private validateParams(params: Record<string, unknown>, schema: Record<string, unknown>): string | null {
    const required = schema.required as string[] | undefined;
    if (!required) return null;

    for (const field of required) {
      if (params[field] === undefined || params[field] === null || params[field] === '') {
        return `Missing required param: ${field}`;
      }
    }
    return null;
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd apps/agent && npx jest src/integrations/integration-router.service.spec.ts --no-coverage
```

Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/integrations/integration-router.service.ts \
        apps/agent/src/integrations/integration-router.service.spec.ts
git commit -m "feat(agent): IntegrationRouterService — adapter registry and param validation"
```

---

## Task 9: Agent — ConnectorService

**Files:**
- Create: `apps/agent/src/integrations/connector.service.ts`

- [ ] **Step 1: Create ConnectorService**

```typescript
// apps/agent/src/integrations/connector.service.ts
import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LicenseService } from '../license/license.service';
import { DeviceFingerprintService } from '../license/device-fingerprint.service';
import ws from 'ws';

export type ConnectionMetadata = Record<string, unknown>;

@Injectable()
export class ConnectorService {
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly licenseService: LicenseService,
    private readonly deviceFingerprint: DeviceFingerprintService,
  ) {
    this.supabase = createClient(
      process.env.SUPABASE_URL ?? '',
      process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { realtime: { transport: ws as any } },
    );
  }

  async getDeviceConnection(pluginId: string): Promise<ConnectionMetadata | null> {
    const userId   = this.licenseService.getUserId();
    const deviceId = await this.deviceFingerprint.getFingerprint();
    if (!userId || !deviceId) return null;

    const { data } = await this.supabase
      .from('user_device_connections')
      .select('metadata, status')
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .eq('plugin_id', pluginId)
      .single();

    return data?.status === 'connected' ? (data.metadata as ConnectionMetadata) : null;
  }

  async setDeviceConnection(pluginId: string, metadata: ConnectionMetadata): Promise<void> {
    const userId   = this.licenseService.getUserId();
    const deviceId = await this.deviceFingerprint.getFingerprint();
    if (!userId || !deviceId) return;

    await this.supabase
      .from('user_device_connections')
      .upsert(
        { user_id: userId, device_id: deviceId, plugin_id: pluginId, status: 'connected', metadata, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,device_id,plugin_id' },
      );
  }

  async clearDeviceConnection(pluginId: string): Promise<void> {
    const userId   = this.licenseService.getUserId();
    const deviceId = await this.deviceFingerprint.getFingerprint();
    if (!userId || !deviceId) return;

    await this.supabase
      .from('user_device_connections')
      .upsert(
        { user_id: userId, device_id: deviceId, plugin_id: pluginId, status: 'not_configured', metadata: {}, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,device_id,plugin_id' },
      );
  }
}
```

- [ ] **Step 2: Check DeviceFingerprintService method name**

Open `apps/agent/src/license/device-fingerprint.service.ts` and confirm the method that returns the device ID. It may be `getFingerprint()`, `getId()`, or `get()`. Update the `ConnectorService` import and calls to match the actual method name.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/src/integrations/connector.service.ts
git commit -m "feat(agent): ConnectorService — read/write device connection metadata"
```

---

## Task 10: Agent — IntegrationStateService

**Files:**
- Create: `apps/agent/src/integrations/integration-state.service.ts`

- [ ] **Step 1: Create IntegrationStateService**

```typescript
// apps/agent/src/integrations/integration-state.service.ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { IntegrationRouterService } from './integration-router.service';
import { IntegrationStateMessage } from '@control-surface/shared';

type BroadcastFn = (msg: IntegrationStateMessage) => void;

@Injectable()
export class IntegrationStateService implements OnModuleDestroy {
  private broadcastFn?: BroadcastFn;
  private intervalHandle?: NodeJS.Timeout;

  constructor(private readonly router: IntegrationRouterService) {}

  setBroadcastFn(fn: BroadcastFn): void {
    this.broadcastFn = fn;
  }

  startPolling(intervalMs = 5000): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => void this.poll(), intervalMs);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  private async poll(): Promise<void> {
    if (!this.broadcastFn) return;

    for (const adapter of this.router.getAdapters()) {
      if (!adapter.getState) continue;
      try {
        const states = await adapter.getState();
        if (states.length === 0) continue;
        const msg: IntegrationStateMessage = {
          type:     'INTEGRATION_STATE',
          pluginId: adapter.pluginSlug,
          states,
        };
        this.broadcastFn(msg);
      } catch {
        // adapter offline — silently skip
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent/src/integrations/integration-state.service.ts
git commit -m "feat(agent): IntegrationStateService — poll adapters and broadcast state"
```

---

## Task 11: Agent — OBS Service

**Files:**
- Create: `apps/agent/src/integrations/obs/obs.service.ts`
- Create: `apps/agent/src/integrations/obs/obs.service.spec.ts`

- [ ] **Step 1: Install obs-websocket-js**

```bash
cd apps/agent && npm install obs-websocket-js
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/agent/src/integrations/obs/obs.service.spec.ts
const mockCall       = jest.fn();
const mockConnect    = jest.fn();
const mockDisconnect = jest.fn();
const mockOn         = jest.fn();
const mockOff        = jest.fn();

jest.mock('obs-websocket-js', () => ({
  default: jest.fn().mockImplementation(() => ({
    call: mockCall,
    connect: mockConnect,
    disconnect: mockDisconnect,
    on: mockOn,
    off: mockOff,
  })),
}));

const mockConnector = {
  getDeviceConnection: jest.fn(),
  setDeviceConnection: jest.fn(),
  clearDeviceConnection: jest.fn(),
};

import { ObsService } from './obs.service';

describe('ObsService', () => {
  let service: ObsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ObsService(mockConnector as any);
  });

  it('pluginSlug is obs', () => {
    expect(service.pluginSlug).toBe('obs');
  });

  it('canExecute returns true for known obs actionIds', () => {
    expect(service.canExecute('obs.stream.start')).toBe(true);
    expect(service.canExecute('obs.stream.stop')).toBe(true);
    expect(service.canExecute('obs.record.start')).toBe(true);
    expect(service.canExecute('obs.record.stop')).toBe(true);
    expect(service.canExecute('obs.scene.switch')).toBe(true);
    expect(service.canExecute('obs.source.toggle')).toBe(true);
  });

  it('canExecute returns false for unknown actionIds', () => {
    expect(service.canExecute('twitch.clip.create')).toBe(false);
    expect(service.canExecute('')).toBe(false);
  });

  it('execute returns error when not connected', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue(null);

    const result = await service.execute('obs.stream.start', {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not connected/i);
  });

  it('execute StartStream calls obs.call correctly', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: 'secret' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockResolvedValue({});

    const result = await service.execute('obs.stream.start', {});
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('StartStream');
  });

  it('execute SwitchScene calls SetCurrentProgramScene with sceneName', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockResolvedValue({});

    await service.execute('obs.scene.switch', { sceneName: 'Gaming' });
    expect(mockCall).toHaveBeenCalledWith('SetCurrentProgramScene', { sceneName: 'Gaming' });
  });

  it('execute returns error when obs.call throws', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockRejectedValue(new Error('OBS not running'));

    const result = await service.execute('obs.stream.start', {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/OBS not running/);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

```bash
cd apps/agent && npx jest src/integrations/obs/obs.service.spec.ts --no-coverage
```

Expected: `Cannot find module './obs.service'`

- [ ] **Step 4: Implement ObsService**

```typescript
// apps/agent/src/integrations/obs/obs.service.ts
import { Injectable } from '@nestjs/common';
import OBSWebSocket from 'obs-websocket-js';
import { CommandResult } from '../../command/command.service';
import { IntegrationAdapter, IntegrationState } from '../integration.adapter';
import { ConnectorService } from '../connector.service';

const OBS_PLUGIN_ID = 'obs';

const SUPPORTED_ACTIONS = new Set([
  'obs.stream.start',
  'obs.stream.stop',
  'obs.record.start',
  'obs.record.stop',
  'obs.scene.switch',
  'obs.source.toggle',
]);

interface ObsConnection {
  host:     string;
  port:     number;
  password: string;
}

@Injectable()
export class ObsService implements IntegrationAdapter {
  readonly pluginSlug = OBS_PLUGIN_ID;

  private obs = new OBSWebSocket();
  private connected = false;

  constructor(private readonly connector: ConnectorService) {}

  canExecute(actionId: string): boolean {
    return SUPPORTED_ACTIONS.has(actionId);
  }

  async execute(actionId: string, params: Record<string, unknown>): Promise<CommandResult> {
    try {
      const connMeta = await this.connector.getDeviceConnection(OBS_PLUGIN_ID);
      if (!connMeta) return { success: false, error: 'OBS not connected. Configure the connection first.' };

      await this.ensureConnected(connMeta as unknown as ObsConnection);

      switch (actionId) {
        case 'obs.stream.start':  await this.obs.call('StartStream');  break;
        case 'obs.stream.stop':   await this.obs.call('StopStream');   break;
        case 'obs.record.start':  await this.obs.call('StartRecord');  break;
        case 'obs.record.stop':   await this.obs.call('StopRecord');   break;

        case 'obs.scene.switch': {
          const sceneName = params.sceneName as string;
          await this.obs.call('SetCurrentProgramScene', { sceneName });
          break;
        }

        case 'obs.source.toggle': {
          const { sceneName, sourceName } = params as { sceneName: string; sourceName: string };
          const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName });
          const item = (sceneItems as Array<{ sourceName: string; sceneItemId: number; sceneItemEnabled: boolean }>)
            .find((i) => i.sourceName === sourceName);
          if (!item) return { success: false, error: `Source "${sourceName}" not found in scene "${sceneName}"` };
          await this.obs.call('SetSceneItemEnabled', {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemEnabled: !item.sceneItemEnabled,
          });
          break;
        }

        default:
          return { success: false, error: `Unknown OBS actionId: ${actionId}` };
      }

      return { success: true };
    } catch (err) {
      this.connected = false;
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async getState(): Promise<IntegrationState[]> {
    const connMeta = await this.connector.getDeviceConnection(OBS_PLUGIN_ID);
    if (!connMeta) return [];

    try {
      await this.ensureConnected(connMeta as unknown as ObsConnection);

      const [streamStatus, recordStatus, sceneList] = await Promise.all([
        this.obs.call('GetStreamStatus'),
        this.obs.call('GetRecordStatus'),
        this.obs.call('GetSceneList'),
      ]);

      const now = new Date().toISOString();
      return [
        { key: 'streaming',  value: streamStatus.outputActive,              label: streamStatus.outputActive ? 'Live' : 'Offline', updatedAt: now },
        { key: 'recording',  value: recordStatus.outputActive,              label: recordStatus.outputActive  ? 'Recording' : '',  updatedAt: now },
        { key: 'scene',      value: sceneList.currentProgramSceneName,      label: sceneList.currentProgramSceneName as string,     updatedAt: now },
      ];
    } catch {
      this.connected = false;
      return [];
    }
  }

  private async ensureConnected(conn: ObsConnection): Promise<void> {
    if (this.connected) return;
    const url = `ws://${conn.host}:${conn.port}`;
    await this.obs.connect(url, conn.password || undefined);
    this.connected = true;
  }
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
cd apps/agent && npx jest src/integrations/obs/obs.service.spec.ts --no-coverage
```

Expected: 8 passing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/integrations/obs/obs.service.ts \
        apps/agent/src/integrations/obs/obs.service.spec.ts
git commit -m "feat(agent): ObsService — OBS WebSocket adapter with stream, record, scene, source toggle"
```

---

## Task 12: Agent — IntegrationsModule + Wire App

**Files:**
- Create: `apps/agent/src/integrations/integrations.module.ts`
- Modify: `apps/agent/src/app.module.ts`
- Modify: `apps/agent/src/command/command.service.ts`
- Modify: `apps/agent/src/websocket/ws.gateway.ts`

- [ ] **Step 1: Create IntegrationsModule**

```typescript
// apps/agent/src/integrations/integrations.module.ts
import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { PluginCatalogService }      from './plugin-catalog.service';
import { PluginInstallService }      from './plugin-install.service';
import { IntegrationRouterService }  from './integration-router.service';
import { ConnectorService }          from './connector.service';
import { IntegrationStateService }   from './integration-state.service';
import { ObsService }                from './obs/obs.service';

@Module({
  imports: [LicenseModule],
  providers: [
    PluginCatalogService,
    PluginInstallService,
    IntegrationRouterService,
    ConnectorService,
    IntegrationStateService,
    ObsService,
  ],
  exports: [
    PluginCatalogService,
    PluginInstallService,
    IntegrationRouterService,
    ConnectorService,
    IntegrationStateService,
  ],
})
export class IntegrationsModule {}
```

- [ ] **Step 2: Import IntegrationsModule in AppModule**

In `apps/agent/src/app.module.ts`, add IntegrationsModule to imports:

```typescript
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [LicenseModule, NetworkModule, ContextModule, MouseModule, MediaModule, IntegrationsModule],
  providers: [
    WsGateway,
    ClipboardService,
    AiRouterService,
    CommandService,
    AppLaunchService,
    AppRegistryService,
    KeystrokeService,
    AppSearchService,
    PackRegistryService,
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Add INTEGRATION_ACTION case to CommandService**

In `apps/agent/src/command/command.service.ts`, inject `IntegrationRouterService` and `PluginCatalogService`, then add the case:

```typescript
// Add to constructor params:
private readonly integrationRouter: IntegrationRouterService,
private readonly pluginCatalog: PluginCatalogService,

// Add import at top:
import { IntegrationRouterService } from '../integrations/integration-router.service';
import { PluginCatalogService }     from '../integrations/plugin-catalog.service';

// Add case before `default:` in the switch:
case 'INTEGRATION_ACTION': {
  const plugin = this.pluginCatalog.getPlugins().find((p) => p.id === action.pluginId);
  const tool   = plugin?.tools.find((t) => t.id === action.toolId);
  return this.integrationRouter.dispatch(
    action.actionId,
    action.params,
    tool?.paramsSchema as Record<string, unknown> | undefined,
  );
}
```

- [ ] **Step 4: Register OBS adapter and wire gateway**

In `apps/agent/src/websocket/ws.gateway.ts`, inject the integration services and wire them up. Add to imports at top:

```typescript
import { PluginCatalogService }     from '../integrations/plugin-catalog.service';
import { PluginInstallService }     from '../integrations/plugin-install.service';
import { IntegrationStateService }  from '../integrations/integration-state.service';
import { IntegrationRouterService } from '../integrations/integration-router.service';
import { ObsService }               from '../integrations/obs/obs.service';
import {
  PluginCatalogMessage,
  InstalledPluginsMessage,
  IntegrationStateMessage,
  PluginConnectionStatusMessage,
} from '@control-surface/shared';
```

Add to constructor params:

```typescript
private readonly pluginCatalog:    PluginCatalogService,
private readonly pluginInstall:    PluginInstallService,
private readonly integrationState: IntegrationStateService,
private readonly integrationRouter: IntegrationRouterService,
private readonly obsService:       ObsService,
```

Add to the constructor body (after existing setup lines):

```typescript
// Register OBS adapter
this.integrationRouter.register(this.obsService);

// Load plugin catalog and installs
void this.pluginCatalog.load();
void this.pluginInstall.fetchInstalled();

// Wire state broadcasting
this.integrationState.setBroadcastFn((msg: IntegrationStateMessage) => this.broadcastIntegrationState(msg));
this.integrationState.startPolling();
```

Add helper methods:

```typescript
private sendPluginCatalog(client: WebSocket): void {
  const msg: PluginCatalogMessage = { type: 'PLUGIN_CATALOG', plugins: this.pluginCatalog.getPlugins() };
  client.send(JSON.stringify(msg));
}

private sendInstalledPlugins(client: WebSocket): void {
  const msg: InstalledPluginsMessage = { type: 'INSTALLED_PLUGINS', installedPluginIds: this.pluginInstall.getInstalledPluginIds() };
  client.send(JSON.stringify(msg));
}

private broadcastInstalledPlugins(): void {
  const msg: InstalledPluginsMessage = { type: 'INSTALLED_PLUGINS', installedPluginIds: this.pluginInstall.getInstalledPluginIds() };
  const payload = JSON.stringify(msg);
  this.server.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(payload); });
}

private broadcastIntegrationState(msg: IntegrationStateMessage): void {
  const payload = JSON.stringify(msg);
  this.server.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(payload); });
}
```

In `handleConnection`, add after `this.sendPackRegistry(client)`:

```typescript
this.sendPluginCatalog(client);
this.sendInstalledPlugins(client);
```

In the `client.on('message', ...)` handler, add before `if (data.type !== 'BUTTON_TAP') return;`:

```typescript
if (data.type === 'GET_PLUGIN_CATALOG') {
  this.sendPluginCatalog(client);
  return;
}

if (data.type === 'INSTALL_PLUGIN') {
  await this.pluginInstall.install(data.pluginId);
  this.broadcastInstalledPlugins();
  return;
}

if (data.type === 'UNINSTALL_PLUGIN') {
  await this.pluginInstall.uninstall(data.pluginId);
  this.broadcastInstalledPlugins();
  return;
}

if (data.type === 'SET_PLUGIN_CONNECTION') {
  // ConnectorService resolves device ID internally
  const { ConnectorService } = await import('../integrations/connector.service');
  // Note: inject ConnectorService in constructor instead of dynamic import in production code.
  // See step below for proper injection.
  return;
}

if (data.type === 'TEST_PLUGIN_CONNECTION') {
  // Implemented in Task 15 (PluginConnectionScreen)
  return;
}
```

**Important:** The `SET_PLUGIN_CONNECTION` handler above uses a placeholder. Inject `ConnectorService` properly in the constructor instead:

Add `private readonly connectorService: ConnectorService` to the WsGateway constructor, then replace the handler:

```typescript
if (data.type === 'SET_PLUGIN_CONNECTION') {
  await this.connectorService.setDeviceConnection(data.pluginId, data.metadata);
  const statusMsg: PluginConnectionStatusMessage = {
    type: 'PLUGIN_CONNECTION_STATUS', pluginId: data.pluginId, status: 'connected',
  };
  client.send(JSON.stringify(statusMsg));
  return;
}
```

- [ ] **Step 5: Verify the agent compiles**

```bash
cd apps/agent && npx tsc --noEmit
```

Expected: no errors. Fix any import or type issues before proceeding.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/integrations/integrations.module.ts \
        apps/agent/src/app.module.ts \
        apps/agent/src/command/command.service.ts \
        apps/agent/src/websocket/ws.gateway.ts
git commit -m "feat(agent): wire IntegrationsModule — OBS adapter, plugin catalog/install, state polling"
```

---

## Task 13: Mobile — WebSocket Plugin Handlers

**Files:**
- Modify: `apps/mobile/src/services/websocket.service.ts`

- [ ] **Step 1: Read websocket.service.ts fully**

Open `apps/mobile/src/services/websocket.service.ts`. Understand the existing callback subscription pattern (arrays of listeners, `onStatusChange`, `onMessage` etc.).

- [ ] **Step 2: Add plugin message handlers**

Following the existing callback pattern in the service, add these public methods:

```typescript
// Add state fields
private pluginCatalog: IntegrationPlugin[] = [];
private installedPluginIds: string[] = [];
private integrationStates = new Map<string, IntegrationStateMessage['states']>();

// Callbacks
private pluginCatalogListeners:    Array<(plugins: IntegrationPlugin[]) => void> = [];
private installedPluginsListeners: Array<(ids: string[]) => void> = [];
private integrationStateListeners: Array<(msg: IntegrationStateMessage) => void> = [];
private pluginConnStatusListeners: Array<(msg: PluginConnectionStatusMessage) => void> = [];

onPluginCatalog(cb: (plugins: IntegrationPlugin[]) => void): () => void {
  this.pluginCatalogListeners.push(cb);
  if (this.pluginCatalog.length > 0) cb(this.pluginCatalog);
  return () => { this.pluginCatalogListeners = this.pluginCatalogListeners.filter((l) => l !== cb); };
}

onInstalledPlugins(cb: (ids: string[]) => void): () => void {
  this.installedPluginsListeners.push(cb);
  cb(this.installedPluginIds);
  return () => { this.installedPluginsListeners = this.installedPluginsListeners.filter((l) => l !== cb); };
}

onIntegrationState(cb: (msg: IntegrationStateMessage) => void): () => void {
  this.integrationStateListeners.push(cb);
  return () => { this.integrationStateListeners = this.integrationStateListeners.filter((l) => l !== cb); };
}

onPluginConnectionStatus(cb: (msg: PluginConnectionStatusMessage) => void): () => void {
  this.pluginConnStatusListeners.push(cb);
  return () => { this.pluginConnStatusListeners = this.pluginConnStatusListeners.filter((l) => l !== cb); };
}

sendInstallPlugin(pluginId: string): void {
  this.send({ type: 'INSTALL_PLUGIN', pluginId } satisfies InstallPluginMessage);
}

sendUninstallPlugin(pluginId: string): void {
  this.send({ type: 'UNINSTALL_PLUGIN', pluginId } satisfies UninstallPluginMessage);
}

sendSetPluginConnection(pluginId: string, metadata: Record<string, unknown>): void {
  this.send({ type: 'SET_PLUGIN_CONNECTION', pluginId, metadata } satisfies SetPluginConnectionMessage);
}

sendTestPluginConnection(pluginId: string): void {
  this.send({ type: 'TEST_PLUGIN_CONNECTION', pluginId } satisfies TestPluginConnectionMessage);
}

getIntegrationStates(pluginId: string): IntegrationStateMessage['states'] {
  return this.integrationStates.get(pluginId) ?? [];
}
```

In the existing message handler switch/dispatch (where agent messages are processed), add cases for the new message types:

```typescript
case 'PLUGIN_CATALOG': {
  this.pluginCatalog = msg.plugins;
  this.pluginCatalogListeners.forEach((cb) => cb(this.pluginCatalog));
  break;
}
case 'INSTALLED_PLUGINS': {
  this.installedPluginIds = msg.installedPluginIds;
  this.installedPluginsListeners.forEach((cb) => cb(this.installedPluginIds));
  break;
}
case 'INTEGRATION_STATE': {
  this.integrationStates.set(msg.pluginId, msg.states);
  this.integrationStateListeners.forEach((cb) => cb(msg));
  break;
}
case 'PLUGIN_CONNECTION_STATUS': {
  this.pluginConnStatusListeners.forEach((cb) => cb(msg));
  break;
}
```

Add imports at the top of the file:

```typescript
import {
  IntegrationPlugin,
  IntegrationStateMessage,
  PluginConnectionStatusMessage,
  InstallPluginMessage,
  UninstallPluginMessage,
  SetPluginConnectionMessage,
  TestPluginConnectionMessage,
} from '@control-surface/shared';
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/services/websocket.service.ts
git commit -m "feat(mobile): add plugin catalog, install, state, and connection WebSocket handlers"
```

---

## Task 14: Mobile — PluginLibraryScreen

**Files:**
- Create: `apps/mobile/src/screens/PluginLibraryScreen.tsx`

- [ ] **Step 1: Create PluginLibraryScreen**

```tsx
// apps/mobile/src/screens/PluginLibraryScreen.tsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Modal, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { IntegrationPlugin } from '@control-surface/shared';
import { WebSocketService } from '../services/websocket.service';

interface Props {
  visible:    boolean;
  wsService:  WebSocketService | null;
  onDismiss:  () => void;
  onOpenDetail: (plugin: IntegrationPlugin) => void;
}

export function PluginLibraryScreen({ visible, wsService, onDismiss, onOpenDetail }: Props) {
  const [plugins, setPlugins]         = useState<IntegrationPlugin[]>([]);
  const [installedIds, setInstalledIds] = useState<string[]>([]);
  const [query, setQuery]             = useState('');
  const [category, setCategory]       = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    if (!wsService || !visible) return;
    const unsub1 = wsService.onPluginCatalog((p) => setPlugins(p));
    const unsub2 = wsService.onInstalledPlugins((ids) => setInstalledIds(ids));
    return () => { unsub1(); unsub2(); };
  }, [wsService, visible]);

  const categories = useMemo(() => {
    const all = Array.from(new Set(plugins.map((p) => p.category)));
    return all.sort();
  }, [plugins]);

  const filtered = useMemo(() => {
    return plugins.filter((p) => {
      const matchQuery = !query || p.name.toLowerCase().includes(query.toLowerCase());
      const matchCat   = !category || p.category === category;
      return matchQuery && matchCat;
    });
  }, [plugins, query, category]);

  const handleInstall = async (plugin: IntegrationPlugin) => {
    if (!wsService) return;
    setLoading(true);
    wsService.sendInstallPlugin(plugin.id);
    setLoading(false);
  };

  const handleUninstall = async (plugin: IntegrationPlugin) => {
    if (!wsService) return;
    wsService.sendUninstallPlugin(plugin.id);
  };

  const renderPlugin = ({ item }: { item: IntegrationPlugin }) => {
    const installed = installedIds.includes(item.id);
    return (
      <TouchableOpacity style={styles.card} onPress={() => onOpenDetail(item)}>
        <View style={[styles.iconBox, { backgroundColor: item.color ?? '#333' }]}>
          <Text style={styles.iconText}>{item.icon.slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          <Text style={styles.cardMeta}>{item.category} · {item.publisher}</Text>
        </View>
        <TouchableOpacity
          style={[styles.ctaBtn, installed ? styles.ctaBtnInstalled : styles.ctaBtnAvailable]}
          onPress={() => installed ? handleUninstall(item) : handleInstall(item)}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.ctaBtnText}>{installed ? 'Uninstall' : 'Install'}</Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Plugins</Text>
          <TouchableOpacity onPress={onDismiss}>
            <Text style={styles.closeBtn}>Done</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.search}
          placeholder="Search plugins..."
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
        />

        <View style={styles.chips}>
          <TouchableOpacity
            style={[styles.chip, !category && styles.chipActive]}
            onPress={() => setCategory(null)}
          >
            <Text style={[styles.chipText, !category && styles.chipTextActive]}>All</Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, category === cat && styles.chipActive]}
              onPress={() => setCategory(cat === category ? null : cat)}
            >
              <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={renderPlugin}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No plugins found.</Text>}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#111' },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title:           { fontSize: 20, fontWeight: '700', color: '#fff' },
  closeBtn:        { fontSize: 16, color: '#6ee7b7' },
  search:          { margin: 12, padding: 10, borderRadius: 10, backgroundColor: '#1e1e1e', color: '#fff', fontSize: 15 },
  chips:           { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  chip:            { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: '#1e1e1e' },
  chipActive:      { backgroundColor: '#6ee7b7' },
  chipText:        { color: '#aaa', fontSize: 13 },
  chipTextActive:  { color: '#111', fontWeight: '600' },
  list:            { paddingHorizontal: 12, paddingBottom: 32 },
  card:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', borderRadius: 14, padding: 12, marginBottom: 10 },
  iconBox:         { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  iconText:        { color: '#fff', fontWeight: '700', fontSize: 14 },
  cardBody:        { flex: 1 },
  cardName:        { color: '#fff', fontWeight: '600', fontSize: 15 },
  cardDesc:        { color: '#888', fontSize: 12, marginTop: 2 },
  cardMeta:        { color: '#555', fontSize: 11, marginTop: 3 },
  ctaBtn:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  ctaBtnAvailable: { backgroundColor: '#6ee7b7' },
  ctaBtnInstalled: { backgroundColor: '#333' },
  ctaBtnText:      { fontWeight: '600', fontSize: 13, color: '#111' },
  empty:           { color: '#555', textAlign: 'center', marginTop: 40 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/PluginLibraryScreen.tsx
git commit -m "feat(mobile): PluginLibraryScreen — browse, search, filter, install/uninstall plugins"
```

---

## Task 15: Mobile — PluginDetailScreen

**Files:**
- Create: `apps/mobile/src/screens/PluginDetailScreen.tsx`

- [ ] **Step 1: Create PluginDetailScreen**

```tsx
// apps/mobile/src/screens/PluginDetailScreen.tsx
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal, SafeAreaView,
} from 'react-native';
import { IntegrationPlugin } from '@control-surface/shared';

interface Props {
  plugin:       IntegrationPlugin | null;
  installedIds: string[];
  onDismiss:    () => void;
  onInstall:    (pluginId: string) => void;
  onUninstall:  (pluginId: string) => void;
  onConnect:    (plugin: IntegrationPlugin) => void;
  onAddTools:   (plugin: IntegrationPlugin) => void;
}

export function PluginDetailScreen({
  plugin, installedIds, onDismiss, onInstall, onUninstall, onConnect, onAddTools,
}: Props) {
  if (!plugin) return null;

  const installed = installedIds.includes(plugin.id);

  return (
    <Modal visible={!!plugin} animationType="slide" onRequestClose={onDismiss}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onDismiss}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.iconBox, { backgroundColor: plugin.color ?? '#333' }]}>
            <Text style={styles.iconText}>{plugin.icon.slice(0, 2).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{plugin.name}</Text>
          <Text style={styles.meta}>{plugin.publisher} · v{plugin.version}</Text>
          {plugin.description ? <Text style={styles.desc}>{plugin.description}</Text> : null}

          {plugin.requiresConnector && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Connection</Text>
              <Text style={styles.infoValue}>{plugin.connectorType}</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Platforms</Text>
            <Text style={styles.infoValue}>{plugin.supportedPlatforms.join(', ')}</Text>
          </View>

          <Text style={styles.sectionTitle}>Tools ({plugin.tools.length})</Text>
          {plugin.tools.map((tool) => (
            <View key={tool.id} style={styles.toolRow}>
              <Text style={styles.toolName}>{tool.name}</Text>
              {tool.description ? <Text style={styles.toolDesc}>{tool.description}</Text> : null}
              <View style={styles.toolBadges}>
                {tool.supportsWorkflows  && <Text style={styles.badge}>Workflow</Text>}
                {tool.supportsState      && <Text style={styles.badge}>State badge</Text>}
                {tool.requiresConfirmation && <Text style={styles.badgeWarn}>Confirm</Text>}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          {!installed ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => onInstall(plugin.id)}>
              <Text style={styles.primaryBtnText}>Install</Text>
            </TouchableOpacity>
          ) : (
            <>
              {plugin.requiresConnector && (
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => onConnect(plugin)}>
                  <Text style={styles.secondaryBtnText}>Configure Connection</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={() => onAddTools(plugin)}>
                <Text style={styles.primaryBtnText}>Add Tools to Deck</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dangerBtn} onPress={() => onUninstall(plugin.id)}>
                <Text style={styles.dangerBtnText}>Uninstall</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#111' },
  header:          { padding: 16 },
  back:            { color: '#6ee7b7', fontSize: 16 },
  content:         { padding: 20, paddingBottom: 8 },
  iconBox:         { width: 72, height: 72, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 16, alignSelf: 'center' },
  iconText:        { color: '#fff', fontWeight: '700', fontSize: 24 },
  name:            { color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  meta:            { color: '#666', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  desc:            { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  infoRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#222' },
  infoLabel:       { color: '#666', fontSize: 13 },
  infoValue:       { color: '#aaa', fontSize: 13 },
  sectionTitle:    { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 10 },
  toolRow:         { backgroundColor: '#1e1e1e', borderRadius: 10, padding: 12, marginBottom: 8 },
  toolName:        { color: '#fff', fontWeight: '600', fontSize: 14 },
  toolDesc:        { color: '#888', fontSize: 12, marginTop: 3 },
  toolBadges:      { flexDirection: 'row', gap: 6, marginTop: 6 },
  badge:           { backgroundColor: '#2a3a2a', color: '#6ee7b7', fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeWarn:       { backgroundColor: '#3a2a1a', color: '#f97316', fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  footer:          { padding: 16, gap: 10 },
  primaryBtn:      { backgroundColor: '#6ee7b7', borderRadius: 14, padding: 14, alignItems: 'center' },
  primaryBtnText:  { color: '#111', fontWeight: '700', fontSize: 16 },
  secondaryBtn:    { backgroundColor: '#1e1e1e', borderRadius: 14, padding: 14, alignItems: 'center' },
  secondaryBtnText:{ color: '#fff', fontWeight: '600', fontSize: 15 },
  dangerBtn:       { padding: 12, alignItems: 'center' },
  dangerBtnText:   { color: '#ef4444', fontSize: 14 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/PluginDetailScreen.tsx
git commit -m "feat(mobile): PluginDetailScreen — plugin info, tools list, install/connect/add-tools CTA"
```

---

## Task 16: Mobile — PluginConnectionScreen (OBS)

**Files:**
- Create: `apps/mobile/src/screens/PluginConnectionScreen.tsx`

- [ ] **Step 1: Create PluginConnectionScreen**

```tsx
// apps/mobile/src/screens/PluginConnectionScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Modal, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { IntegrationPlugin, PluginConnectionStatusMessage } from '@control-surface/shared';
import { WebSocketService } from '../services/websocket.service';

interface Props {
  plugin:    IntegrationPlugin | null;
  wsService: WebSocketService | null;
  onDismiss: () => void;
}

export function PluginConnectionScreen({ plugin, wsService, onDismiss }: Props) {
  const [host, setHost]         = useState('localhost');
  const [port, setPort]         = useState('4455');
  const [password, setPassword] = useState('');
  const [status, setStatus]     = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!wsService || !plugin) return;
    const unsub = wsService.onPluginConnectionStatus((msg: PluginConnectionStatusMessage) => {
      if (msg.pluginId !== plugin.id) return;
      if (msg.status === 'connected') {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg(msg.error ?? 'Connection failed');
      }
    });
    return unsub;
  }, [wsService, plugin]);

  const handleSave = () => {
    if (!wsService || !plugin) return;
    setStatus('saving');
    setErrorMsg('');
    wsService.sendSetPluginConnection(plugin.id, {
      host:     host.trim(),
      port:     parseInt(port, 10) || 4455,
      password: password,
    });
  };

  if (!plugin) return null;

  return (
    <Modal visible={!!plugin} animationType="slide" onRequestClose={onDismiss}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onDismiss}>
              <Text style={styles.back}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Connect {plugin.name}</Text>
            <View style={{ width: 48 }} />
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Host</Text>
            <TextInput
              style={styles.input}
              value={host}
              onChangeText={setHost}
              placeholder="localhost"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Port</Text>
            <TextInput
              style={styles.input}
              value={port}
              onChangeText={setPort}
              placeholder="4455"
              placeholderTextColor="#555"
              keyboardType="numeric"
            />

            <Text style={styles.label}>Password (optional)</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Leave blank if no password"
              placeholderTextColor="#555"
              secureTextEntry
              autoCapitalize="none"
            />

            {status === 'error'   && <Text style={styles.errorText}>{errorMsg}</Text>}
            {status === 'success' && <Text style={styles.successText}>Connected successfully</Text>}

            <TouchableOpacity
              style={[styles.saveBtn, status === 'saving' && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={status === 'saving'}
            >
              {status === 'saving' ? (
                <ActivityIndicator color="#111" />
              ) : (
                <Text style={styles.saveBtnText}>Save & Connect</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Open OBS → Tools → WebSocket Server Settings. Enable the server and note the port and password.
          </Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#111' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  back:            { color: '#6ee7b7', fontSize: 16, width: 48 },
  title:           { color: '#fff', fontSize: 17, fontWeight: '600' },
  form:            { padding: 20, gap: 6 },
  label:           { color: '#aaa', fontSize: 13, marginBottom: 4, marginTop: 12 },
  input:           { backgroundColor: '#1e1e1e', borderRadius: 10, padding: 12, color: '#fff', fontSize: 15 },
  errorText:       { color: '#ef4444', fontSize: 13, marginTop: 12 },
  successText:     { color: '#6ee7b7', fontSize: 13, marginTop: 12 },
  saveBtn:         { backgroundColor: '#6ee7b7', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 24 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:     { color: '#111', fontWeight: '700', fontSize: 16 },
  hint:            { color: '#555', fontSize: 12, padding: 20, lineHeight: 18 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/PluginConnectionScreen.tsx
git commit -m "feat(mobile): PluginConnectionScreen — OBS local-websocket connection form"
```

---

## Task 17: Mobile — Wire Screens into DeckScreen

**Files:**
- Modify: `apps/mobile/src/screens/DeckScreen.tsx`

- [ ] **Step 1: Read DeckScreen.tsx**

Open `apps/mobile/src/screens/DeckScreen.tsx`. Find:
1. Where modal state variables are declared (around line 61–91)
2. Where modals are rendered (look for `<Modal` components)
3. Where tiles are rendered (look for `TileGrid` or `DeckButton`)

- [ ] **Step 2: Add plugin modal state**

Add to the state block near other modal states:

```typescript
const [showPluginLibrary,    setShowPluginLibrary]    = useState(false);
const [selectedPlugin,       setSelectedPlugin]        = useState<IntegrationPlugin | null>(null);
const [showPluginDetail,     setShowPluginDetail]      = useState(false);
const [showPluginConnection, setShowPluginConnection]  = useState(false);
const [installedPluginIds,   setInstalledPluginIds]    = useState<string[]>([]);
const [integrationStates,    setIntegrationStates]     = useState<Map<string, IntegrationStateMessage['states']>>(new Map());
```

- [ ] **Step 3: Subscribe to installedPlugins and integrationState**

In the WebSocket effect (where `wsService` subscriptions are set up), add:

```typescript
const unsubInstalled = wsService.onInstalledPlugins((ids) => setInstalledPluginIds(ids));
const unsubState     = wsService.onIntegrationState((msg) => {
  setIntegrationStates((prev) => new Map(prev).set(msg.pluginId, msg.states));
});
// add unsubInstalled and unsubState to cleanup return
```

- [ ] **Step 4: Add a Plugins button to the header or tab bar**

Find where the settings or add-tile button is rendered. Add a Plugins button nearby:

```tsx
<TouchableOpacity onPress={() => setShowPluginLibrary(true)} style={styles.pluginsBtn}>
  <Text style={styles.pluginsBtnText}>Plugins</Text>
</TouchableOpacity>
```

- [ ] **Step 5: Render the three plugin modals**

Add below the existing modals:

```tsx
<PluginLibraryScreen
  visible={showPluginLibrary}
  wsService={wsService}
  onDismiss={() => setShowPluginLibrary(false)}
  onOpenDetail={(plugin) => {
    setSelectedPlugin(plugin);
    setShowPluginDetail(true);
  }}
/>

<PluginDetailScreen
  plugin={showPluginDetail ? selectedPlugin : null}
  installedIds={installedPluginIds}
  onDismiss={() => setShowPluginDetail(false)}
  onInstall={(id) => wsService?.sendInstallPlugin(id)}
  onUninstall={(id) => wsService?.sendUninstallPlugin(id)}
  onConnect={(plugin) => {
    setShowPluginDetail(false);
    setShowPluginConnection(true);
  }}
  onAddTools={(plugin) => {
    setShowPluginDetail(false);
    // Opens AddTileScreen on the Plugins tab — implemented in Task 18
  }}
/>

<PluginConnectionScreen
  plugin={showPluginConnection ? selectedPlugin : null}
  wsService={wsService}
  onDismiss={() => setShowPluginConnection(false)}
/>
```

Add imports at the top:

```typescript
import { PluginLibraryScreen }    from './PluginLibraryScreen';
import { PluginDetailScreen }     from './PluginDetailScreen';
import { PluginConnectionScreen } from './PluginConnectionScreen';
import { IntegrationPlugin, IntegrationStateMessage } from '@control-surface/shared';
```

- [ ] **Step 6: Add state badge rendering to tiles**

Find where `DeckButton` or individual tiles are rendered. Pass integration state to each tile so it can show a badge. In the tile render, look up state for the tile's plugin:

```typescript
// Helper to get state badge label for a tile
const getStateBadge = (action: ButtonAction): string | null => {
  if (action.kind !== 'INTEGRATION_ACTION') return null;
  const states = integrationStates.get(action.pluginId) ?? [];
  const streaming = states.find((s) => s.key === 'streaming');
  if (streaming?.value === true) return streaming.label as string ?? 'Live';
  const scene = states.find((s) => s.key === 'scene');
  if (scene?.value) return scene.label as string ?? null;
  return null;
};
```

Pass `stateBadge={getStateBadge(tile.action)}` to each `DeckButton`. Update `DeckButton` to render a small badge text below the tile label when `stateBadge` is set.

- [ ] **Step 7: Verify TypeScript**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: no errors. Fix any import issues.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/screens/DeckScreen.tsx
git commit -m "feat(mobile): wire plugin library, detail, connection screens and integration state badges into DeckScreen"
```

---

## Task 18: Mobile — AddTileScreen Plugins Tab

**Files:**
- Modify: `apps/mobile/src/screens/AddTileScreen.tsx`

- [ ] **Step 1: Read AddTileScreen.tsx**

Open `apps/mobile/src/screens/AddTileScreen.tsx`. Find:
1. Where tab options are defined (there will be a tabs array or conditional rendering by tab key)
2. How a new tile is created and sent back to DeckScreen (look for the `onAddTile` or `ADD_TILE` callback)
3. The props interface — confirm it receives `wsService`

- [ ] **Step 2: Add Plugins tab to tab list**

Locate the tab array (e.g., `[{ key: 'apps', label: 'Apps' }, ...]`) and add:

```typescript
{ key: 'plugins', label: 'Plugins' }
```

- [ ] **Step 3: Add Plugins tab content**

In the tab content switch/conditional, add a `plugins` case:

```tsx
{activeTab === 'plugins' && (
  <PluginsTabContent
    wsService={wsService}
    onAddTile={onAddTile}
  />
)}
```

- [ ] **Step 4: Implement PluginsTabContent inline or as a sibling component**

Add this component in the same file or in a sibling file `AddTileScreen.plugins.tsx`:

```tsx
function PluginsTabContent({
  wsService,
  onAddTile,
}: {
  wsService: WebSocketService | null;
  onAddTile: (tile: Omit<TileConfig, 'id'>) => void;
}) {
  const [plugins, setPlugins]           = useState<IntegrationPlugin[]>([]);
  const [installedIds, setInstalledIds] = useState<string[]>([]);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<IntegrationTool | null>(null);
  const [params, setParams]             = useState<Record<string, string>>({});

  useEffect(() => {
    if (!wsService) return;
    const u1 = wsService.onPluginCatalog((p) => setPlugins(p));
    const u2 = wsService.onInstalledPlugins((ids) => setInstalledIds(ids));
    return () => { u1(); u2(); };
  }, [wsService]);

  const installedPlugins = plugins.filter((p) => installedIds.includes(p.id));

  const handleAddTool = (plugin: IntegrationPlugin, tool: IntegrationTool) => {
    const requiredParams = (tool.paramsSchema as { required?: string[] }).required ?? [];
    if (requiredParams.length > 0) {
      setSelectedTool(tool);
      const initial: Record<string, string> = {};
      requiredParams.forEach((k) => { initial[k] = ''; });
      setParams(initial);
      return;
    }
    submitTile(plugin, tool, {});
  };

  const submitTile = (plugin: IntegrationPlugin, tool: IntegrationTool, resolvedParams: Record<string, unknown>) => {
    onAddTile({
      kind:   'integration',
      label:  tool.name,
      iconId: plugin.icon,
      color:  plugin.color,
      action: {
        kind:     'INTEGRATION_ACTION',
        pluginId: plugin.id,
        toolId:   tool.id,
        actionId: tool.actionId,
        params:   resolvedParams,
      },
    });
    setSelectedTool(null);
    setParams({});
  };

  if (installedPlugins.length === 0) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ color: '#666', textAlign: 'center' }}>
          No plugins installed. Open the Plugin Library to add integrations.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView>
      {installedPlugins.map((plugin) => (
        <View key={plugin.id}>
          <TouchableOpacity
            style={pluginTabStyles.pluginHeader}
            onPress={() => setExpandedPlugin(expandedPlugin === plugin.id ? null : plugin.id)}
          >
            <Text style={pluginTabStyles.pluginName}>{plugin.name}</Text>
            <Text style={pluginTabStyles.chevron}>{expandedPlugin === plugin.id ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {expandedPlugin === plugin.id && plugin.tools.map((tool) => (
            <TouchableOpacity
              key={tool.id}
              style={pluginTabStyles.toolRow}
              onPress={() => handleAddTool(plugin, tool)}
            >
              <Text style={pluginTabStyles.toolName}>{tool.name}</Text>
              {tool.description && <Text style={pluginTabStyles.toolDesc}>{tool.description}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      ))}

      {/* Param config sheet */}
      {selectedTool && (
        <View style={pluginTabStyles.paramSheet}>
          <Text style={pluginTabStyles.paramTitle}>Configure: {selectedTool.name}</Text>
          {Object.keys(params).map((key) => (
            <View key={key}>
              <Text style={pluginTabStyles.paramLabel}>{key}</Text>
              <TextInput
                style={pluginTabStyles.paramInput}
                value={params[key]}
                onChangeText={(v) => setParams((p) => ({ ...p, [key]: v }))}
                placeholder={key}
                placeholderTextColor="#555"
                autoCapitalize="none"
              />
            </View>
          ))}
          <TouchableOpacity
            style={pluginTabStyles.confirmBtn}
            onPress={() => {
              const plugin = installedPlugins.find((p) => p.tools.some((t) => t.id === selectedTool.id))!;
              submitTile(plugin, selectedTool, params);
            }}
          >
            <Text style={pluginTabStyles.confirmBtnText}>Add to Deck</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedTool(null)}>
            <Text style={pluginTabStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const pluginTabStyles = StyleSheet.create({
  pluginHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#222' },
  pluginName:   { color: '#fff', fontWeight: '600', fontSize: 15 },
  chevron:      { color: '#666', fontSize: 12 },
  toolRow:      { padding: 12, paddingLeft: 24, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', backgroundColor: '#111' },
  toolName:     { color: '#ddd', fontSize: 14 },
  toolDesc:     { color: '#666', fontSize: 12, marginTop: 2 },
  paramSheet:   { margin: 16, padding: 16, backgroundColor: '#1e1e1e', borderRadius: 14 },
  paramTitle:   { color: '#fff', fontWeight: '600', fontSize: 15, marginBottom: 12 },
  paramLabel:   { color: '#aaa', fontSize: 13, marginBottom: 4, marginTop: 8 },
  paramInput:   { backgroundColor: '#111', borderRadius: 8, padding: 10, color: '#fff' },
  confirmBtn:   { backgroundColor: '#6ee7b7', borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 16 },
  confirmBtnText: { color: '#111', fontWeight: '700' },
  cancelText:   { color: '#666', textAlign: 'center', marginTop: 12, padding: 8 },
});
```

- [ ] **Step 5: Add missing imports to AddTileScreen.tsx**

```typescript
import { IntegrationPlugin, IntegrationTool, TileConfig } from '@control-surface/shared';
import { WebSocketService } from '../services/websocket.service';
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/AddTileScreen.tsx
git commit -m "feat(mobile): AddTileScreen Plugins tab — browse installed plugin tools, configure params, add to deck"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| Supabase catalog tables (plugins, tools, installs, connections) | Task 1 |
| OBS plugin + tools seed data | Task 2 |
| INTEGRATION_ACTION ButtonAction variant | Task 3 |
| Plugin WebSocket messages (catalog, installs, state, connection) | Task 3 |
| PluginCatalogService (fetch, filter by platform/capability) | Task 6 |
| PluginInstallService (install/uninstall, soft-delete) | Task 7 |
| IntegrationRouterService (dispatch, param validation) | Task 8 |
| ConnectorService (device connection read/write) | Task 9 |
| IntegrationStateService (poll, broadcast) | Task 10 |
| OBS adapter (all 6 actions + state) | Task 11 |
| Agent wired: OBS registered, catalog sent on connect | Task 12 |
| INSTALL_PLUGIN / UNINSTALL_PLUGIN handlers in gateway | Task 12 |
| SET_PLUGIN_CONNECTION handler in gateway | Task 12 |
| Mobile WebSocket plugin message handling | Task 13 |
| PluginLibraryScreen (search, filter, install/uninstall) | Task 14 |
| PluginDetailScreen (tools list, install/connect/add-tools CTA) | Task 15 |
| PluginConnectionScreen (OBS local-websocket form) | Task 16 |
| DeckScreen: plugin modals, state badges | Task 17 |
| AddTileScreen Plugins tab (browse tools, param config) | Task 18 |
| Plugin lifecycle (published filter) | Task 6 (PluginCatalogService filters) |
| min_agent_capability filtering | Task 6 (PluginCatalogService filters) |
| connector_type enum | Task 1 (CHECK constraint) + Task 3 (TS type) |
| Soft-delete TTL note | Task 7 (spec note; purge job is a separate cron, out of scope for Phase 1) |

**Gap:** The 30-day TTL purge job (soft-delete cleanup) is not implemented here. It requires a Supabase scheduled function or pg_cron job — add as a follow-up migration in a dedicated task when pg_cron is available in the project.

**Gap:** `is_beta_tester` user flag is not added in this plan. It is deferred to a separate migration once the labs toggle UI is built.

**Gap:** DeckButton component changes for the state badge are described but not fully implemented (exact DeckButton props are unknown without reading that file). Task 17 Step 6 describes the pattern; the implementer must read `apps/mobile/src/components/DeckButton.tsx` and add the `stateBadge` prop there.

### Placeholder scan

No TBD or TODO placeholders. Task 9 Step 2 requires reading `device-fingerprint.service.ts` for the exact method name — this is intentional (method name is not known without reading the file) and is a concrete instruction, not a placeholder.

### Type consistency

- `IntegrationPlugin` and `IntegrationTool` defined in Task 3, used in Tasks 6, 13, 14, 15, 16, 17, 18 — consistent.
- `IntegrationAdapter` defined in Task 5, implemented in Task 11 (`ObsService`) — interface matches.
- `CommandResult` imported from `command.service.ts` in Tasks 5 and 8 — consistent.
- `INTEGRATION_ACTION` added to `ButtonAction` in Task 3, dispatched in Task 12, created in Task 18 — consistent.
- `installedPluginIds` (not `pluginIds`) used in `InstalledPluginsMessage` — consistent across Tasks 3, 7, 13.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-21-plugin-library.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
