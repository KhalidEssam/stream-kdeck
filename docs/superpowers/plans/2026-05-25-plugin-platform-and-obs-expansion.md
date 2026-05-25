# Plugin Platform Maturity + OBS Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the OBS catalog expansion (Priority 1) and the four most blocking platform maturity items (Priority 0) that prevent clean addition of future plugins.

**Architecture:** Priority 1 is a single SQL migration — the OBS agent service and mobile UI already handle all new actions. Priority 0 touches the agent router (type/enum param validation), state service (filter polling to installed plugins only), mobile connector screen (generic form driven by connectorType), and the seed update pattern (ON CONFLICT DO UPDATE). No new services, no new modules.

**Tech Stack:** NestJS (agent), React Native (mobile), Supabase SQL (migrations), Jest (agent unit tests).

**Out of scope in this plan:** Catalog-driven tool presentation metadata (deferred until a second plugin with grouped tools ships), cloud connector framework (deferred until Priority 7), dynamic param options API (deferred until after KDeck Media).

---

## Files

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260525000001_obs_catalog_expansion.sql` | Create | Add 15 missing OBS catalog tool entries with ON CONFLICT DO UPDATE |
| `apps/agent/src/integrations/integration-router.service.ts` | Modify | Add type and enum validation to `validateParams` |
| `apps/agent/src/integrations/integration-router.service.spec.ts` | Modify | Tests for new type/enum validation |
| `apps/agent/src/integrations/integration-state.service.ts` | Modify | Inject `PluginInstallService`; skip polling uninstalled plugins |
| `apps/agent/src/integrations/integration-state.service.spec.ts` | Create | Unit tests for state polling filter |
| `apps/mobile/src/screens/PluginConnectionScreen.tsx` | Modify | Render connector form from `plugin.connectorType` instead of hardcoded OBS fields |

---

## Task 1: OBS Catalog Expansion Migration

**Files:**
- Create: `supabase/migrations/20260525000001_obs_catalog_expansion.sql`

This migration adds 15 missing OBS tool entries. The agent (`obs.service.ts`) already implements all of them. The mobile `pluginTools.ts` already handles toggle grouping for stream, record, replay, virtual camera, and studio mode — it uses `hasNativeStreamToggle` / `hasNativeRecordToggle` detection, so adding the toggle entries to the catalog will automatically collapse the start/stop sub-actions in the UI as intended.

Uses `ON CONFLICT DO UPDATE` — this is the new standard for all plugin catalog migrations going forward.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260525000001_obs_catalog_expansion.sql
-- Adds the 15 OBS tool entries that obs.service.ts already implements but the catalog
-- does not yet expose. Uses ON CONFLICT DO UPDATE so future re-runs are idempotent and
-- tool metadata changes (names, schemas, sort_order) actually land.

WITH plugin AS (
  SELECT id FROM public.integration_plugins WHERE slug = 'obs'
)
INSERT INTO public.integration_tools (
  plugin_id, slug, name, action_id, execution_mode, params_schema,
  result_schema, supports_workflows, supports_state, requires_confirmation,
  sort_order, status
)
SELECT
  plugin.id,
  t.slug,
  t.name,
  t.action_id,
  t.execution_mode,
  t.params_schema::jsonb,
  '{}'::jsonb,
  t.supports_workflows,
  t.supports_state,
  t.requires_confirmation,
  t.sort_order,
  'published'
FROM plugin, (VALUES
  -- Toggle variants (catalog-native; mobile pluginTools.ts detects these and hides start/stop)
  ('stream-toggle',         'Toggle Stream',         'obs.stream.toggle',         'agent', '{}', true,  true,  false, 11),
  ('record-toggle',         'Toggle Recording',      'obs.record.toggle',         'agent', '{}', true,  true,  false, 31),
  -- Replay buffer
  ('replay-start',          'Start Replay Buffer',   'obs.replay.start',          'agent', '{}', true,  true,  false, 61),
  ('replay-stop',           'Stop Replay Buffer',    'obs.replay.stop',           'agent', '{}', true,  true,  false, 62),
  ('replay-save',           'Save Replay Buffer',    'obs.replay.save',           'agent', '{}', true,  false, false, 63),
  ('replay-toggle',         'Toggle Replay Buffer',  'obs.replay.toggle',         'agent', '{}', true,  true,  false, 64),
  -- Virtual camera
  ('virtual-camera-start',  'Start Virtual Camera',  'obs.virtual_camera.start',  'agent', '{}', true,  true,  false, 71),
  ('virtual-camera-stop',   'Stop Virtual Camera',   'obs.virtual_camera.stop',   'agent', '{}', true,  true,  false, 72),
  ('virtual-camera-toggle', 'Toggle Virtual Camera', 'obs.virtual_camera.toggle', 'agent', '{}', true,  true,  false, 73),
  -- Studio mode
  ('studio-mode-enable',    'Enable Studio Mode',    'obs.studio_mode.enable',    'agent', '{}', true,  true,  false, 81),
  ('studio-mode-disable',   'Disable Studio Mode',   'obs.studio_mode.disable',   'agent', '{}', true,  true,  false, 82),
  ('studio-mode-toggle',    'Toggle Studio Mode',    'obs.studio_mode.toggle',    'agent', '{}', true,  true,  false, 83),
  -- Input controls (require params; dynamic options for inputName come in a later plan)
  ('input-mute-toggle',     'Toggle Input Mute',     'obs.input.mute.toggle',     'agent',
   '{"type":"object","required":["inputName"],"properties":{"inputName":{"type":"string"}}}',
   true, false, false, 91),
  ('input-mute-set',        'Set Input Mute',        'obs.input.mute.set',        'agent',
   '{"type":"object","required":["inputName","muted"],"properties":{"inputName":{"type":"string"},"muted":{"type":"boolean"}}}',
   true, false, false, 92),
  ('input-volume-set',      'Set Input Volume',      'obs.input.volume.set',      'agent',
   '{"type":"object","required":["inputName","volume"],"properties":{"inputName":{"type":"string"},"volume":{"type":"number","minimum":0,"maximum":1}}}',
   true, false, false, 93)
) AS t(slug, name, action_id, execution_mode, params_schema, supports_workflows, supports_state, requires_confirmation, sort_order)
ON CONFLICT (plugin_id, slug) DO UPDATE SET
  name            = EXCLUDED.name,
  action_id       = EXCLUDED.action_id,
  params_schema   = EXCLUDED.params_schema,
  supports_workflows   = EXCLUDED.supports_workflows,
  supports_state       = EXCLUDED.supports_state,
  requires_confirmation = EXCLUDED.requires_confirmation,
  sort_order      = EXCLUDED.sort_order,
  status          = EXCLUDED.status;
```

- [ ] **Step 2: Apply to local Supabase**

```bash
npx supabase db push
```

Expected: migration applies cleanly with no errors.

- [ ] **Step 3: Verify manually**

Open the app → Plugin Library → OBS Studio (must be installed). In Add Tile, confirm:
- "Toggle Stream" and "Toggle Recording" are visible (stream/record start-only entries should collapse since toggle is now catalog-native)
- "Toggle Replay Buffer", "Save Replay Buffer", "Toggle Virtual Camera", "Toggle Studio Mode" are listed
- "Toggle Input Mute", "Set Input Mute", "Set Input Volume" are listed with input fields

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260525000001_obs_catalog_expansion.sql
git commit -m "feat(plugins): add 15 missing OBS catalog tool entries"
```

---

## Task 2: Param Schema Type and Enum Validation

**Files:**
- Modify: `apps/agent/src/integrations/integration-router.service.ts`
- Modify: `apps/agent/src/integrations/integration-router.service.spec.ts`

Currently `validateParams` only checks that required fields are present. It does not verify that `muted` is a boolean or that `volume` is a number. This causes confusing OBS errors at the WebSocket call instead of a clean validation message.

- [ ] **Step 1: Write the failing tests**

Add to `apps/agent/src/integrations/integration-router.service.spec.ts` (append after the existing `describe` block's last `it`):

```typescript
  it('rejects param with wrong type', async () => {
    const obs = makeAdapter('obs', ['obs.input.mute.set']);
    router.register(obs);
    const schema = {
      type: 'object',
      required: ['inputName', 'muted'],
      properties: {
        inputName: { type: 'string' },
        muted: { type: 'boolean' },
      },
    };

    const result = await router.dispatch('obs.input.mute.set', { inputName: 'Mic', muted: 'yes' }, schema);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/muted/);
    expect(result.error).toMatch(/boolean/);
  });

  it('rejects param not in enum list', async () => {
    const obs = makeAdapter('obs', ['obs.scene.switch']);
    router.register(obs);
    const schema = {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: { type: 'string', enum: ['start', 'stop'] },
      },
    };

    const result = await router.dispatch('obs.scene.switch', { mode: 'pause' }, schema);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/mode/);
    expect(result.error).toMatch(/start.*stop|stop.*start/);
  });

  it('accepts param that matches enum', async () => {
    const obs = makeAdapter('obs', ['obs.scene.switch']);
    router.register(obs);
    const schema = {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: { type: 'string', enum: ['start', 'stop'] },
      },
    };

    const result = await router.dispatch('obs.scene.switch', { mode: 'start' }, schema);
    expect(result.success).toBe(true);
  });

  it('skips type check for absent optional params', async () => {
    const obs = makeAdapter('obs', ['obs.scene.switch']);
    router.register(obs);
    const schema = {
      type: 'object',
      properties: {
        optionalFlag: { type: 'boolean' },
      },
    };

    const result = await router.dispatch('obs.scene.switch', {}, schema);
    expect(result.success).toBe(true);
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx nx test agent --testPathPattern=integration-router --no-coverage
```

Expected: 4 new tests FAIL ("rejects param with wrong type", "rejects param not in enum list", "accepts param that matches enum", "skips type check for absent optional params"). The first two fail because validation returns null instead of an error. The last two pass already — that is fine.

- [ ] **Step 3: Update `validateParams` in `integration-router.service.ts`**

Replace the entire `validateParams` method (lines 33–43):

```typescript
  private validateParams(params: Record<string, unknown>, schema: Record<string, unknown>): string | null {
    const required = schema.required as string[] | undefined;
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;

    if (required) {
      for (const field of required) {
        if (params[field] === undefined || params[field] === null || params[field] === '') {
          return `Missing required param: ${field}`;
        }
      }
    }

    if (properties) {
      for (const [field, propSchema] of Object.entries(properties)) {
        const value = params[field];
        if (value === undefined || value === null) continue;

        const expectedType = propSchema.type as string | undefined;
        if (expectedType && typeof value !== expectedType) {
          return `Invalid type for param '${field}': expected ${expectedType}, got ${typeof value}`;
        }

        const allowedValues = propSchema.enum as unknown[] | undefined;
        if (allowedValues && !allowedValues.includes(value)) {
          return `Invalid value for param '${field}': must be one of [${allowedValues.join(', ')}]`;
        }
      }
    }

    return null;
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx nx test agent --testPathPattern=integration-router --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/integrations/integration-router.service.ts \
        apps/agent/src/integrations/integration-router.service.spec.ts
git commit -m "feat(agent): add type and enum validation to integration param schema"
```

---

## Task 3: Installed-Plugin State Filtering

**Files:**
- Modify: `apps/agent/src/integrations/integration-state.service.ts`
- Create: `apps/agent/src/integrations/integration-state.service.spec.ts`

Currently `IntegrationStateService` polls every registered adapter on every tick, even if the plugin is not installed. This wastes cycles and could cause confusing OBS connection attempts for plugins the user never set up.

`PluginInstallService` is already provided in `IntegrationsModule` — only the constructor injection and filter are new.

- [ ] **Step 1: Write the failing tests**

Create `apps/agent/src/integrations/integration-state.service.spec.ts`:

```typescript
import { IntegrationStateService } from './integration-state.service';

const makeAdapter = (slug: string, states = [{ key: 'streaming', value: true, updatedAt: '' }]) => ({
  pluginSlug: slug,
  canExecute: () => false,
  execute: jest.fn(),
  getState: jest.fn().mockResolvedValue(states),
});

const makeAdapterNoState = (slug: string) => ({
  pluginSlug: slug,
  canExecute: () => false,
  execute: jest.fn(),
});

describe('IntegrationStateService', () => {
  let router: { getAdapters: jest.Mock };
  let pluginCatalog: { getPlugin: jest.Mock };
  let pluginInstall: { isInstalled: jest.Mock };
  let broadcastFn: jest.Mock;
  let service: IntegrationStateService;

  beforeEach(() => {
    router = { getAdapters: jest.fn().mockReturnValue([]) };
    pluginCatalog = { getPlugin: jest.fn() };
    pluginInstall = { isInstalled: jest.fn().mockReturnValue(false) };
    broadcastFn = jest.fn();
    service = new IntegrationStateService(
      router as any,
      pluginCatalog as any,
      pluginInstall as any,
    );
    service.setBroadcastFn(broadcastFn);
  });

  it('does not call getState on adapters that have no getState method', async () => {
    const adapter = makeAdapterNoState('obs');
    router.getAdapters.mockReturnValue([adapter]);
    pluginCatalog.getPlugin.mockReturnValue({ id: 'obs-id', slug: 'obs' });
    pluginInstall.isInstalled.mockReturnValue(true);

    await service.pollNow();

    expect(broadcastFn).not.toHaveBeenCalled();
  });

  it('does not poll adapters whose plugin is not found in catalog', async () => {
    const adapter = makeAdapter('unknown');
    router.getAdapters.mockReturnValue([adapter]);
    pluginCatalog.getPlugin.mockReturnValue(undefined);

    await service.pollNow();

    expect(adapter.getState).not.toHaveBeenCalled();
    expect(broadcastFn).not.toHaveBeenCalled();
  });

  it('does not poll adapters for uninstalled plugins', async () => {
    const adapter = makeAdapter('obs');
    router.getAdapters.mockReturnValue([adapter]);
    pluginCatalog.getPlugin.mockReturnValue({ id: 'obs-id', slug: 'obs' });
    pluginInstall.isInstalled.mockReturnValue(false);

    await service.pollNow();

    expect(adapter.getState).not.toHaveBeenCalled();
    expect(broadcastFn).not.toHaveBeenCalled();
  });

  it('broadcasts state for installed plugins', async () => {
    const adapter = makeAdapter('obs');
    router.getAdapters.mockReturnValue([adapter]);
    pluginCatalog.getPlugin.mockReturnValue({ id: 'obs-id', slug: 'obs' });
    pluginInstall.isInstalled.mockReturnValue(true);

    await service.pollNow();

    expect(adapter.getState).toHaveBeenCalledTimes(1);
    expect(broadcastFn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'INTEGRATION_STATE', pluginId: 'obs-id' }),
    );
  });

  it('does not broadcast when getState returns empty array', async () => {
    const adapter = makeAdapter('obs', []);
    router.getAdapters.mockReturnValue([adapter]);
    pluginCatalog.getPlugin.mockReturnValue({ id: 'obs-id', slug: 'obs' });
    pluginInstall.isInstalled.mockReturnValue(true);

    await service.pollNow();

    expect(broadcastFn).not.toHaveBeenCalled();
  });

  it('swallows errors from offline adapters without stopping other adapters', async () => {
    const failing = { ...makeAdapter('obs'), getState: jest.fn().mockRejectedValue(new Error('OBS offline')) };
    const working = makeAdapter('media');
    router.getAdapters.mockReturnValue([failing, working]);
    pluginCatalog.getPlugin.mockImplementation((slug: string) =>
      slug === 'obs' ? { id: 'obs-id', slug: 'obs' } : { id: 'media-id', slug: 'media' },
    );
    pluginInstall.isInstalled.mockReturnValue(true);

    await service.pollNow();

    expect(broadcastFn).toHaveBeenCalledTimes(1);
    expect(broadcastFn).toHaveBeenCalledWith(expect.objectContaining({ pluginId: 'media-id' }));
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx nx test agent --testPathPattern=integration-state --no-coverage
```

Expected: compile error or runtime failures because the constructor does not accept `pluginInstall` yet, and the filtering logic does not exist.

- [ ] **Step 3: Update `integration-state.service.ts`**

Replace the full file content:

```typescript
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { IntegrationStateMessage } from '@control-surface/shared';
import { PluginCatalogService } from './plugin-catalog.service';
import { PluginInstallService } from './plugin-install.service';
import { IntegrationRouterService } from './integration-router.service';

type BroadcastFn = (msg: IntegrationStateMessage) => void;

@Injectable()
export class IntegrationStateService implements OnModuleDestroy {
  private broadcastFn?: BroadcastFn;
  private intervalHandle?: ReturnType<typeof setInterval>;

  constructor(
    private readonly router: IntegrationRouterService,
    private readonly pluginCatalog: PluginCatalogService,
    private readonly pluginInstall: PluginInstallService,
  ) {}

  setBroadcastFn(fn: BroadcastFn): void {
    this.broadcastFn = fn;
  }

  startPolling(intervalMs = 5000): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => void this.poll(), intervalMs);
  }

  async pollNow(): Promise<void> {
    await this.poll();
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  private async poll(): Promise<void> {
    if (!this.broadcastFn) return;

    for (const adapter of this.router.getAdapters()) {
      if (!adapter.getState) continue;

      const plugin = this.pluginCatalog.getPlugin(adapter.pluginSlug);
      if (!plugin || !this.pluginInstall.isInstalled(plugin.id)) continue;

      try {
        const states = await adapter.getState();
        if (states.length === 0) continue;

        const msg: IntegrationStateMessage = {
          type: 'INTEGRATION_STATE',
          pluginId: plugin.id,
          states,
        };
        this.broadcastFn(msg);
      } catch {
        // Adapter is offline or unavailable; the next polling tick can recover.
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx nx test agent --testPathPattern=integration-state --no-coverage
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Run full agent test suite to confirm no regressions**

```bash
npx nx test agent --no-coverage
```

Expected: all tests PASS. (The only compile-time dependency of `IntegrationStateService` is the constructor change; `IntegrationsModule` already provides `PluginInstallService` so no module change is needed.)

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/integrations/integration-state.service.ts \
        apps/agent/src/integrations/integration-state.service.spec.ts
git commit -m "feat(agent): only poll state for installed plugins"
```

---

## Task 4: Generic Connector UI

**Files:**
- Modify: `apps/mobile/src/screens/PluginConnectionScreen.tsx`

The screen currently hardcodes host/port/password fields and an OBS-specific hint. When a second plugin ships (KDeck Media, `connector_type = 'none'`), this screen would need new code for every plugin. Rendering from `connectorType` prevents that.

Handled connector types after this task:
- `local-websocket` — host + port + password form (current OBS UX, genericised)
- `none` or `requiresConnector === false` — "no setup required" message with a dismiss button
- Anything else — "connector type not yet supported" placeholder

- [ ] **Step 1: Replace `PluginConnectionScreen.tsx`**

```typescript
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IntegrationPlugin, PluginConnectionStatusMessage } from '../types/schema';
import { WebSocketService } from '../services/websocket.service';

interface Props {
  plugin: IntegrationPlugin | null;
  wsService: WebSocketService | null;
  onDismiss: () => void;
}

export function PluginConnectionScreen({ plugin, wsService, onDismiss }: Props) {
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('4455');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!wsService || !plugin) return;
    const unsub = wsService.onPluginConnectionStatus((msg: PluginConnectionStatusMessage) => {
      if (msg.pluginId !== plugin.id) return;
      if (msg.status === 'connected') {
        setStatus('success');
        setErrorMsg('');
      } else {
        setStatus('error');
        setErrorMsg(msg.error ?? 'Connection failed');
      }
    });
    return unsub;
  }, [plugin, wsService]);

  useEffect(() => {
    if (plugin) {
      setStatus('idle');
      setErrorMsg('');
    }
  }, [plugin]);

  const handleSave = () => {
    if (!wsService || !plugin) return;
    setStatus('saving');
    setErrorMsg('');
    wsService.sendSetPluginConnection(plugin.id, {
      host: host.trim() || 'localhost',
      port: Number.parseInt(port, 10) || 4455,
      password,
    });
  };

  if (!plugin) return null;

  const needsConnector = plugin.requiresConnector && plugin.connectorType !== 'none';

  return (
    <Modal visible={!!plugin} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onDismiss} activeOpacity={0.78}>
            <Text style={styles.back}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>Connect {plugin.name}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {!needsConnector ? (
          <View style={styles.noSetup}>
            <Text style={styles.noSetupText}>No setup required for {plugin.name}.</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={onDismiss} activeOpacity={0.8}>
              <Text style={styles.saveBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : plugin.connectorType === 'local-websocket' ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
            <View style={styles.form}>
              <Text style={styles.label}>Host</Text>
              <TextInput
                style={styles.input}
                value={host}
                onChangeText={setHost}
                placeholder="localhost"
                placeholderTextColor="#6B6B8A"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>Port</Text>
              <TextInput
                style={styles.input}
                value={port}
                onChangeText={setPort}
                placeholder="4455"
                placeholderTextColor="#6B6B8A"
                keyboardType="numeric"
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Optional"
                placeholderTextColor="#6B6B8A"
                secureTextEntry
                autoCapitalize="none"
              />

              {status === 'error' ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
              {status === 'success' ? <Text style={styles.successText}>Connected successfully.</Text> : null}

              <TouchableOpacity
                style={[styles.saveBtn, status === 'saving' && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={status === 'saving'}
                activeOpacity={0.8}
              >
                {status === 'saving' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save and Connect</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.hint}>
              Enter the WebSocket host, port, and optional password for {plugin.name}.
            </Text>
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.noSetup}>
            <Text style={styles.noSetupText}>
              Connector type "{plugin.connectorType}" is not yet supported in this version.
            </Text>
            <TouchableOpacity style={styles.saveBtn} onPress={onDismiss} activeOpacity={0.8}>
              <Text style={styles.saveBtnText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  keyboard: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { color: '#AAAACC', fontSize: 15, fontWeight: '700', width: 56 },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
  headerSpacer: { width: 56 },
  form: { padding: 20 },
  label: { color: '#AAAACC', fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#FFFFFF',
    fontSize: 15,
  },
  errorText: { color: '#FF6B6B', fontSize: 13, lineHeight: 18, marginTop: 14 },
  successText: { color: '#7AEB9A', fontSize: 13, fontWeight: '700', marginTop: 14 },
  saveBtn: { backgroundColor: '#5B4FE8', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 24 },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  hint: { color: '#6B6B8A', fontSize: 12, lineHeight: 18, paddingHorizontal: 20 },
  noSetup: { flex: 1, padding: 20, justifyContent: 'flex-start' },
  noSetupText: { color: '#AAAACC', fontSize: 15, lineHeight: 22, marginTop: 8 },
});
```

- [ ] **Step 2: Manually verify OBS connector still works**

- Open Plugin Library → OBS Studio → tap "Connect"
- Confirm host/port/password form renders correctly
- Confirm hint text now reads "Enter the WebSocket host, port, and optional password for OBS Studio."
- Connect to OBS — confirm connection succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/PluginConnectionScreen.tsx
git commit -m "feat(mobile): generic connector UI driven by connectorType"
```

---

## Self-Review

**Spec coverage:**

| Roadmap item | Covered |
|---|---|
| P1: OBS 15 new catalog tools | Task 1 ✓ |
| P0.2: Generic connector UI | Task 4 ✓ |
| P0.4: Param schema type/enum validation | Task 2 ✓ |
| P0.6: State installed-plugin filtering | Task 3 ✓ |
| P0.7: Seed upsert pattern | Task 1 uses ON CONFLICT DO UPDATE ✓ |
| P0.1: Catalog-driven tool presentation | Deferred (out of scope) |
| P0.3: Cloud connector service split | Deferred (out of scope) |
| P0.5: Dynamic param options | Deferred (out of scope) |

**Placeholder scan:** No TBD, TODO, or "similar to Task N" patterns. All code steps contain complete implementations.

**Type consistency:**
- `IntegrationStateService` constructor takes `(router, pluginCatalog, pluginInstall)` in service and spec.
- `makeAdapter` in spec matches the `IntegrationAdapter` interface (`pluginSlug`, `canExecute`, `execute`, optional `getState`).
- `plugin.id` is used consistently after the guard (`if (!plugin || !this.pluginInstall.isInstalled(plugin.id)) continue`).
- Connector screen reads `plugin.connectorType` and `plugin.requiresConnector` — both present in `IntegrationPlugin` interface.
