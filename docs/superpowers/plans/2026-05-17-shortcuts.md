# Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create shortcut tiles on mobile that simulate any keyboard combination (Ctrl+C, Win+D, Alt+F4, etc.) on the desktop agent via `@nut-tree/nut-js`.

**Architecture:** `KeystrokeService` wraps `@nut-tree/nut-js` and maps string key names (`['ctrl','shift','s']`) to the library's `Key` enum. `CommandService` delegates the existing stubbed `KEYSTROKE` case to it. Mobile gets a new "Shortcut" tab in `AddTileScreen` with modifier toggles (Ctrl/Alt/Win/Shift) and a single-key input; tapping Add creates a `TileConfig` with `kind: 'shortcut'` and `action: { kind: 'KEYSTROKE', keys: [...] }`.

**Tech Stack:** `@nut-tree/nut-js@^3` (prebuilt binaries, no node-gyp), NestJS DI, React Native

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `packages/shared/src/schema.ts` | Modify | Add `'shortcut'` to `TileConfig.kind` union |
| `apps/mobile/src/types/schema.ts` | Modify | Mirror shared schema change |
| `apps/agent/package.json` | Modify | Add `@nut-tree/nut-js` dependency |
| `apps/agent/src/keystroke/keystroke.service.ts` | Create | String-key → nut-js Key mapping + press/release |
| `apps/agent/src/command/command.service.ts` | Modify | Implement KEYSTROKE case (was stubbed) |
| `apps/agent/src/app.module.ts` | Modify | Add `KeystrokeService` to providers |
| `apps/agent/tests/keystroke.service.test.ts` | Create | Unit tests for key mapping and execution |
| `apps/agent/tests/command.service.test.ts` | Modify | Add KEYSTROKE tests |
| `apps/mobile/src/components/AppTile.tsx` | Modify | Handle `kind === 'shortcut'` — show ⌨ icon, blue badge |
| `apps/mobile/src/screens/AddTileScreen.tsx` | Modify | Add tab bar (Apps / Shortcut); Shortcut tab = modifier picker |

---

### Task 1: Schema — add 'shortcut' kind + install nut-js

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Modify: `apps/mobile/src/types/schema.ts`
- Modify: `apps/agent/package.json`

- [ ] **Step 1: Update TileConfig.kind in shared schema**

In `packages/shared/src/schema.ts`, change line 31:
```ts
// Before:
  kind: 'app' | 'url' | 'ai';
// After:
  kind: 'app' | 'url' | 'ai' | 'shortcut';
```

- [ ] **Step 2: Mirror in mobile types**

In `apps/mobile/src/types/schema.ts`, same change on the `TileConfig.kind` line:
```ts
  kind: 'app' | 'url' | 'ai' | 'shortcut';
```

- [ ] **Step 3: Rebuild shared package**

```powershell
cd D:\BMC\stream-deck
npm run build --workspace=packages/shared
```
Expected: no output (success)

- [ ] **Step 4: Install @nut-tree/nut-js in agent**

```powershell
cd D:\BMC\stream-deck
npm install @nut-tree/nut-js@^3 --workspace=apps/agent --legacy-peer-deps
```
Expected: package added, no errors.

- [ ] **Step 5: Commit**

```powershell
git add packages/shared/src/schema.ts apps/mobile/src/types/schema.ts apps/agent/package.json package-lock.json
git commit -m "feat: add shortcut tile kind + install @nut-tree/nut-js"
```

---

### Task 2: KeystrokeService

**Files:**
- Create: `apps/agent/src/keystroke/keystroke.service.ts`
- Create: `apps/agent/tests/keystroke.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/agent/tests/keystroke.service.test.ts`:
```ts
import { Test } from '@nestjs/testing';
import { KeystrokeService } from '../src/keystroke/keystroke.service';

jest.mock('@nut-tree/nut-js', () => ({
  keyboard: {
    pressKey: jest.fn().mockResolvedValue(undefined),
    releaseKey: jest.fn().mockResolvedValue(undefined),
  },
  Key: new Proxy({}, { get: (_t, prop) => prop }),
}));

import { keyboard } from '@nut-tree/nut-js';

describe('KeystrokeService', () => {
  let service: KeystrokeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [KeystrokeService],
    }).compile();
    service = module.get(KeystrokeService);
  });

  it('presses and releases Ctrl+C', async () => {
    await service.execute(['ctrl', 'c']);
    expect(keyboard.pressKey).toHaveBeenCalledWith('LeftControl', 'C');
    expect(keyboard.releaseKey).toHaveBeenCalledWith('LeftControl', 'C');
  });

  it('presses and releases Win+D', async () => {
    await service.execute(['win', 'd']);
    expect(keyboard.pressKey).toHaveBeenCalledWith('LeftSuper', 'D');
  });

  it('presses and releases Ctrl+Shift+S', async () => {
    await service.execute(['ctrl', 'shift', 's']);
    expect(keyboard.pressKey).toHaveBeenCalledWith('LeftControl', 'LeftShift', 'S');
  });

  it('presses F5', async () => {
    await service.execute(['f5']);
    expect(keyboard.pressKey).toHaveBeenCalledWith('F5');
  });

  it('throws for an unknown key name', async () => {
    await expect(service.execute(['ctrl', 'UNKNOWN_KEY'])).rejects.toThrow('Unknown key: "UNKNOWN_KEY"');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
cd D:\BMC\stream-deck
npm test --workspace=apps/agent -- --testPathPattern=keystroke 2>&1 | Select-Object -Last 10
```
Expected: FAIL — module not found or function not defined.

- [ ] **Step 3: Implement KeystrokeService**

Create `apps/agent/src/keystroke/keystroke.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { keyboard, Key } from '@nut-tree/nut-js';

const KEY_MAP: Record<string, Key> = {
  ctrl:      Key.LeftControl,
  control:   Key.LeftControl,
  alt:       Key.LeftAlt,
  shift:     Key.LeftShift,
  win:       Key.LeftSuper,
  super:     Key.LeftSuper,
  cmd:       Key.LeftSuper,
  tab:       Key.Tab,
  enter:     Key.Return,
  return:    Key.Return,
  esc:       Key.Escape,
  escape:    Key.Escape,
  space:     Key.Space,
  backspace: Key.Backspace,
  delete:    Key.Delete,
  home:      Key.Home,
  end:       Key.End,
  pageup:    Key.PageUp,
  pagedown:  Key.PageDown,
  up:        Key.Up,
  down:      Key.Down,
  left:      Key.Left,
  right:     Key.Right,
  f1: Key.F1,   f2: Key.F2,   f3: Key.F3,   f4: Key.F4,
  f5: Key.F5,   f6: Key.F6,   f7: Key.F7,   f8: Key.F8,
  f9: Key.F9,   f10: Key.F10, f11: Key.F11, f12: Key.F12,
};

// Register letter keys: 'a' → Key.A, 'b' → Key.B, …
for (const char of 'abcdefghijklmnopqrstuvwxyz') {
  KEY_MAP[char] = Key[char.toUpperCase() as keyof typeof Key] as Key;
}

// Register digit keys: '0' → Key.Num0, …
for (const digit of '0123456789') {
  KEY_MAP[digit] = Key[`Num${digit}` as keyof typeof Key] as Key;
}

@Injectable()
export class KeystrokeService {
  async execute(keys: string[]): Promise<void> {
    const mapped = keys.map((k) => {
      const resolved = KEY_MAP[k.toLowerCase()];
      if (!resolved) throw new Error(`Unknown key: "${k}"`);
      return resolved;
    });
    await keyboard.pressKey(...mapped);
    await keyboard.releaseKey(...mapped);
  }
}
```

- [ ] **Step 4: Run tests — all should pass**

```powershell
cd D:\BMC\stream-deck
npm test --workspace=apps/agent -- --testPathPattern=keystroke 2>&1 | Select-Object -Last 8
```
Expected: `Tests: 5 passed, 5 total`

- [ ] **Step 5: Commit**

```powershell
git add apps/agent/src/keystroke/keystroke.service.ts apps/agent/tests/keystroke.service.test.ts
git commit -m "feat: KeystrokeService — maps string keys to nut-js and simulates press/release"
```

---

### Task 3: Wire KEYSTROKE in CommandService

**Files:**
- Modify: `apps/agent/src/command/command.service.ts`
- Modify: `apps/agent/src/app.module.ts`
- Modify: `apps/agent/tests/command.service.test.ts`

- [ ] **Step 1: Update CommandService tests — add KEYSTROKE cases**

In `apps/agent/tests/command.service.test.ts`, add `KeystrokeService` to the test module and add two tests at the end of the describe block:

```ts
// In imports at top:
import { KeystrokeService } from '../src/keystroke/keystroke.service';

// In beforeEach, add mockKeystroke:
let mockKeystroke: { execute: jest.Mock };
// ...
mockKeystroke = { execute: jest.fn().mockResolvedValue(undefined) };

// In Test.createTestingModule providers:
{ provide: KeystrokeService, useValue: mockKeystroke },

// New tests:
it('executes KEYSTROKE — delegates to KeystrokeService', async () => {
  const result = await commandService.execute({ kind: 'KEYSTROKE', keys: ['ctrl', 'c'] });
  expect(result.success).toBe(true);
  expect(mockKeystroke.execute).toHaveBeenCalledWith(['ctrl', 'c']);
});

it('returns error when KeystrokeService throws (unknown key)', async () => {
  mockKeystroke.execute.mockRejectedValueOnce(new Error('Unknown key: "xyz"'));
  const result = await commandService.execute({ kind: 'KEYSTROKE', keys: ['ctrl', 'xyz'] });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/Unknown key/);
});
```

- [ ] **Step 2: Run tests — KEYSTROKE tests should fail (stub returns false)**

```powershell
cd D:\BMC\stream-deck
npm test --workspace=apps/agent -- --testPathPattern=command 2>&1 | Select-Object -Last 10
```
Expected: 2 new tests fail because KEYSTROKE still returns `{ success: false }`.

- [ ] **Step 3: Implement KEYSTROKE in CommandService**

In `apps/agent/src/command/command.service.ts`:

Replace the import and constructor to add `KeystrokeService`:
```ts
import { Injectable } from '@nestjs/common';
import { ButtonAction } from '@control-surface/shared';
import { ClipboardService } from '../clipboard/clipboard.service';
import { AiRouterService } from '../ai/ai-router.service';
import { AppLaunchService } from '../app-launch/app-launch.service';
import { KeystrokeService } from '../keystroke/keystroke.service';

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
}

@Injectable()
export class CommandService {
  constructor(
    private readonly clipboard: ClipboardService,
    private readonly aiRouter: AiRouterService,
    private readonly appLaunch: AppLaunchService,
    private readonly keystroke: KeystrokeService,
  ) {}

  async execute(action: ButtonAction): Promise<CommandResult> {
    try {
      switch (action.kind) {
        case 'CLIPBOARD_WRITE':
          await this.clipboard.write(action.text);
          return { success: true };

        case 'AI_CLIPBOARD': {
          const context = await this.clipboard.read();
          const result = await this.aiRouter.call(action.prompt, context);
          if (action.outputMode === 'viewer') {
            return { success: true, output: result };
          }
          await this.clipboard.write(result);
          return { success: true };
        }

        case 'APP_LAUNCH':
          await this.appLaunch.launch(action.appId);
          return { success: true };

        case 'URL_OPEN':
          await this.appLaunch.openUrl(action.url);
          return { success: true };

        case 'KEYSTROKE':
          await this.keystroke.execute(action.keys);
          return { success: true };

        default: {
          const exhaustive: never = action;
          return { success: false, error: `Unknown action kind: ${(exhaustive as ButtonAction).kind}` };
        }
      }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
```

- [ ] **Step 4: Add KeystrokeService to AppModule**

In `apps/agent/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { WsGateway } from './websocket/ws.gateway';
import { ClipboardService } from './clipboard/clipboard.service';
import { AiRouterService } from './ai/ai-router.service';
import { CommandService } from './command/command.service';
import { AppLaunchService } from './app-launch/app-launch.service';
import { AppRegistryService } from './app-launch/app-registry.service';
import { KeystrokeService } from './keystroke/keystroke.service';

@Module({
  providers: [WsGateway, ClipboardService, AiRouterService, CommandService, AppLaunchService, AppRegistryService, KeystrokeService],
})
export class AppModule {}
```

- [ ] **Step 5: Run all tests — all should pass**

```powershell
cd D:\BMC\stream-deck
npm test --workspace=apps/agent 2>&1 | Select-Object -Last 8
```
Expected: `Tests: 37 passed, 37 total` (35 existing + 2 new KEYSTROKE)

- [ ] **Step 6: Commit**

```powershell
git add apps/agent/src/command/command.service.ts apps/agent/src/app.module.ts apps/agent/tests/command.service.test.ts
git commit -m "feat: implement KEYSTROKE via KeystrokeService in CommandService"
```

---

### Task 4: AppTile — shortcut kind rendering

**Files:**
- Modify: `apps/mobile/src/components/AppTile.tsx`

- [ ] **Step 1: Add shortcut tile background and shortcut icon rendering**

In `apps/mobile/src/components/AppTile.tsx`:

1. Add `shortcut` to `TILE_BG`:
```ts
const TILE_BG: Record<string, string> = {
  ai:       '#1A1A2E',
  app:      '#1E1E2E',
  url:      '#0D2B45',
  shortcut: '#0F2A1A',
};
```

2. Update the brand color logic — shortcut tiles use a fixed keyboard green:
```ts
const brandColor = tile.kind === 'ai'
  ? (tile.color ?? '#2D1B69')
  : tile.kind === 'shortcut'
    ? '#1DB954'
    : (BRAND_COLORS[tile.iconId] ?? '#3A3A5C');
```

3. Update the icon badge content — add the shortcut icon condition:
```tsx
{/* Icon badge */}
<View style={[styles.iconBadge, { backgroundColor: brandColor }]}>
  {tile.kind === 'ai' ? (
    <Text style={styles.aiIcon}>✦</Text>
  ) : tile.kind === 'shortcut' ? (
    <Text style={styles.shortcutIcon}>⌨</Text>
  ) : showLogo ? (
    <Image
      source={{ uri: logoUri }}
      style={styles.logo}
      onError={() => setLogoError(true)}
    />
  ) : (
    <Text style={styles.fallbackLetter}>
      {tile.label.charAt(0).toUpperCase()}
    </Text>
  )}
</View>
```

4. Add `shortcutIcon` style inside `StyleSheet.create`:
```ts
shortcutIcon: { color: '#FFFFFF', fontSize: 24, opacity: 0.9 },
```

- [ ] **Step 2: Type-check mobile**

```powershell
cd D:\BMC\stream-deck\apps\mobile
npx tsc --noEmit 2>&1
```
Expected: no output (clean).

- [ ] **Step 3: Commit**

```powershell
cd D:\BMC\stream-deck
git add apps/mobile/src/components/AppTile.tsx
git commit -m "feat: shortcut tile kind renders keyboard icon on green badge"
```

---

### Task 5: AddTileScreen — Shortcut tab with modifier picker

**Files:**
- Modify: `apps/mobile/src/screens/AddTileScreen.tsx`

- [ ] **Step 1: Rewrite AddTileScreen with tab bar and Shortcut tab**

Replace the full contents of `apps/mobile/src/screens/AddTileScreen.tsx` with:

```tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { AppTile } from '../components/AppTile';
import { TileConfig } from '../types/schema';

// ─── Curated Apps ─────────────────────────────────────────────────────────────

const CURATED_APPS: Omit<TileConfig, 'id'>[] = [
  { kind: 'app', label: 'Spotify',       iconId: 'spotify',    action: { kind: 'APP_LAUNCH', appId: 'spotify' } },
  { kind: 'app', label: 'OBS Studio',    iconId: 'obs',        action: { kind: 'APP_LAUNCH', appId: 'obs' } },
  { kind: 'app', label: 'VS Code',       iconId: 'vscode',     action: { kind: 'APP_LAUNCH', appId: 'vscode' } },
  { kind: 'app', label: 'Chrome',        iconId: 'chrome',     action: { kind: 'APP_LAUNCH', appId: 'chrome' } },
  { kind: 'app', label: 'Discord',       iconId: 'discord',    action: { kind: 'APP_LAUNCH', appId: 'discord' } },
  { kind: 'app', label: 'WhatsApp',      iconId: 'whatsapp',   action: { kind: 'APP_LAUNCH', appId: 'whatsapp' } },
  { kind: 'app', label: 'Slack',         iconId: 'slack',      action: { kind: 'APP_LAUNCH', appId: 'slack' } },
  { kind: 'app', label: 'Notion',        iconId: 'notion',     action: { kind: 'APP_LAUNCH', appId: 'notion' } },
  { kind: 'app', label: 'Figma',         iconId: 'figma',      action: { kind: 'APP_LAUNCH', appId: 'figma' } },
  { kind: 'app', label: 'Claude',        iconId: 'claude',     action: { kind: 'APP_LAUNCH', appId: 'claude' } },
  { kind: 'app', label: 'GitHub',        iconId: 'github',     action: { kind: 'APP_LAUNCH', appId: 'github' } },
  { kind: 'app', label: 'YouTube',       iconId: 'youtube',    action: { kind: 'APP_LAUNCH', appId: 'youtube' } },
  { kind: 'app', label: 'Twitch',        iconId: 'twitch',     action: { kind: 'APP_LAUNCH', appId: 'twitch' } },
  { kind: 'app', label: 'PowerShell',    iconId: 'powershell', action: { kind: 'APP_LAUNCH', appId: 'powershell' } },
  { kind: 'app', label: 'Terminal',      iconId: 'terminal',   action: { kind: 'APP_LAUNCH', appId: 'terminal' } },
  { kind: 'app', label: 'File Explorer', iconId: 'explorer',   action: { kind: 'APP_LAUNCH', appId: 'explorer' } },
  { kind: 'app', label: 'Steam',         iconId: 'steam',      action: { kind: 'APP_LAUNCH', appId: 'steam' } },
  { kind: 'app', label: 'Postman',       iconId: 'postman',    action: { kind: 'APP_LAUNCH', appId: 'postman' } },
  { kind: 'app', label: 'Linear',        iconId: 'linear',     action: { kind: 'APP_LAUNCH', appId: 'linear' } },
  { kind: 'app', label: 'Vercel',        iconId: 'vercel',     action: { kind: 'APP_LAUNCH', appId: 'vercel' } },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'apps' | 'shortcut';

type Modifier = 'ctrl' | 'alt' | 'win' | 'shift';

interface Props {
  currentTiles: TileConfig[];
  onAdd: (tile: Omit<TileConfig, 'id'>) => void;
  onRemove: (tileId: string) => void;
  onDismiss: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddTileScreen({ currentTiles, onAdd, onRemove, onDismiss }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('apps');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Add Tiles</Text>
        <TouchableOpacity onPress={onDismiss} style={styles.doneBtn}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['apps', 'shortcut'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'apps' ? 'Apps' : 'Shortcut'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {activeTab === 'apps' && (
          <AppsTab currentTiles={currentTiles} onAdd={onAdd} onRemove={onRemove} />
        )}
        {activeTab === 'shortcut' && (
          <ShortcutTab onAdd={onAdd} />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Apps Tab ─────────────────────────────────────────────────────────────────

function AppsTab({ currentTiles, onAdd, onRemove }: Pick<Props, 'currentTiles' | 'onAdd' | 'onRemove'>) {
  const [search, setSearch] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  const selectedByAppId = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const tile of currentTiles) {
      if (tile.action.kind === 'APP_LAUNCH') map.set(tile.action.appId, tile.id);
    }
    return map;
  }, [currentTiles]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? CURATED_APPS.filter((a) => a.label.toLowerCase().includes(q)) : CURATED_APPS;
  }, [search]);

  const handleToggle = (item: Omit<TileConfig, 'id'>) => {
    if (item.action.kind !== 'APP_LAUNCH') return;
    const existingId = selectedByAppId.get(item.action.appId);
    if (existingId) onRemove(existingId);
    else onAdd(item);
  };

  const handleAddUrl = () => {
    const url = customUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) return;
    const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    onAdd({ kind: 'url', label: hostname, iconId: 'globe', action: { kind: 'URL_OPEN', url } });
    setCustomUrl('');
  };

  return (
    <>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search apps…"
          placeholderTextColor="#6B6B8A"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.iconId}
        numColumns={3}
        renderItem={({ item }) => {
          const appId = item.action.kind === 'APP_LAUNCH' ? item.action.appId : '';
          return (
            <AppTile
              tile={{ ...item, id: item.iconId }}
              isSelected={selectedByAppId.has(appId)}
              onTap={() => handleToggle(item)}
            />
          );
        }}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={<Text style={styles.noResults}>No apps match "{search}"</Text>}
      />
      <View style={styles.urlRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="https://custom-url.com"
          placeholderTextColor="#6B6B8A"
          value={customUrl}
          onChangeText={setCustomUrl}
          autoCapitalize="none"
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={handleAddUrl}
        />
        <TouchableOpacity
          style={[styles.addBtn, !customUrl.startsWith('http') && styles.addBtnDisabled]}
          onPress={handleAddUrl}
          disabled={!customUrl.startsWith('http')}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

// ─── Shortcut Tab ─────────────────────────────────────────────────────────────

const MODIFIERS: { key: Modifier; label: string }[] = [
  { key: 'ctrl',  label: 'Ctrl'  },
  { key: 'alt',   label: 'Alt'   },
  { key: 'win',   label: 'Win ⊞' },
  { key: 'shift', label: 'Shift' },
];

function ShortcutTab({ onAdd }: Pick<Props, 'onAdd'>) {
  const [mods, setMods] = useState<Set<Modifier>>(new Set());
  const [key, setKey]   = useState('');
  const [label, setLabel] = useState('');

  const toggleMod = (mod: Modifier) => {
    setMods((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod); else next.add(mod);
      return next;
    });
  };

  const keyList = [...Array.from(mods), key.toLowerCase().trim()].filter(Boolean);
  const autoLabel = keyList.map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join('+');

  const canAdd = key.trim().length > 0;

  const handleAdd = () => {
    if (!canAdd) return;
    const tileLabel = label.trim() || autoLabel;
    onAdd({
      kind: 'shortcut',
      label: tileLabel,
      iconId: 'keyboard',
      color: '#0F2A1A',
      action: { kind: 'KEYSTROKE', keys: keyList },
    });
    setMods(new Set());
    setKey('');
    setLabel('');
  };

  return (
    <ScrollView contentContainerStyle={styles.shortcutContainer} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionLabel}>Modifiers</Text>
      <View style={styles.modRow}>
        {MODIFIERS.map(({ key: mod, label: modLabel }) => (
          <TouchableOpacity
            key={mod}
            style={[styles.modChip, mods.has(mod) && styles.modChipActive]}
            onPress={() => toggleMod(mod)}
          >
            <Text style={[styles.modChipText, mods.has(mod) && styles.modChipTextActive]}>
              {modLabel}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Key</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. c, d, F5, Tab, Enter"
        placeholderTextColor="#6B6B8A"
        value={key}
        onChangeText={(v) => setKey(v.slice(-8))} // allow up to 8 chars for "PageDown"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {autoLabel.length > 0 && (
        <View style={styles.previewRow}>
          <Text style={styles.previewLabel}>Preview: </Text>
          <Text style={styles.previewValue}>{autoLabel}</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Tile label <Text style={styles.optional}>(optional)</Text></Text>
      <TextInput
        style={styles.input}
        placeholder={autoLabel || 'e.g. Mute Mic'}
        placeholderTextColor="#6B6B8A"
        value={label}
        onChangeText={setLabel}
      />

      <TouchableOpacity
        style={[styles.addBtn, !canAdd && styles.addBtnDisabled, { marginTop: 16, alignSelf: 'stretch' }]}
        onPress={handleAdd}
        disabled={!canAdd}
      >
        <Text style={styles.addBtnText}>Add Shortcut</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', flex: 1 },
  doneBtn: { backgroundColor: '#5B4FE8', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7 },
  doneBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  // Tab bar
  tabBar: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#5B4FE8' },
  tabText: { color: '#6B6B8A', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },

  // Shared inputs
  searchRow: { paddingHorizontal: 12, paddingBottom: 8 },
  input: {
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 12,
    marginBottom: 8,
  },
  grid: { paddingHorizontal: 8, paddingBottom: 8 },
  noResults: { color: '#6B6B8A', textAlign: 'center', marginTop: 32, fontSize: 14 },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  addBtn: { backgroundColor: '#5B4FE8', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14, textAlign: 'center' },

  // Shortcut tab
  shortcutContainer: { padding: 16, gap: 4 },
  sectionLabel: { color: '#AAAACC', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  optional: { color: '#6B6B8A', fontWeight: '400' },
  modRow: { flexDirection: 'row', gap: 8 },
  modChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1A1A2E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  modChipActive: { backgroundColor: '#3A3A6A', borderColor: '#5B4FE8' },
  modChipText: { color: '#6B6B8A', fontWeight: '600', fontSize: 13 },
  modChipTextActive: { color: '#FFFFFF' },
  previewRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  previewLabel: { color: '#6B6B8A', fontSize: 13 },
  previewValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
```

- [ ] **Step 2: Type-check mobile**

```powershell
cd D:\BMC\stream-deck\apps\mobile
npx tsc --noEmit 2>&1
```
Expected: no output.

- [ ] **Step 3: Commit**

```powershell
cd D:\BMC\stream-deck
git add apps/mobile/src/screens/AddTileScreen.tsx
git commit -m "feat: AddTileScreen tab bar with Shortcut picker (modifier toggles + key input)"
```

---

### Task 6: Final integration test + agent build

- [ ] **Step 1: Run all agent tests**

```powershell
cd D:\BMC\stream-deck
npm test --workspace=apps/agent 2>&1 | Select-Object -Last 8
```
Expected: `Tests: 37 passed, 37 total` (or more)

- [ ] **Step 2: Build agent TypeScript**

```powershell
npm run build --workspace=packages/shared; npm run build --workspace=apps/agent 2>&1 | Select-Object -Last 5
```
Expected: no errors.

- [ ] **Step 3: Mobile type-check**

```powershell
cd D:\BMC\stream-deck\apps\mobile; npx tsc --noEmit 2>&1
```
Expected: no output.

- [ ] **Step 4: Final commit**

```powershell
cd D:\BMC\stream-deck
git add -A
git commit -m "feat: keyboard shortcuts — complete end-to-end (nut-js + modifier picker UI)"
```
