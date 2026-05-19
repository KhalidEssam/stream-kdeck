# Context-Aware Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect the active desktop app, auto-generate its keyboard shortcuts via LLM (once, cached), and push them to a scrollable context strip that overlays the bottom of the mobile deck.

**Architecture:** `ActiveWindowService` polls `active-win` every 500ms with a 1.5s debounce and emits `appChanged`. `ContextProfileService` checks a disk cache (`context-profiles.json`), calls Gemini via the existing `AiRouterService` on first detection of a curated app, and persists results. `WsGateway` pushes `CONTEXT_SHORTCUTS` to all connected mobile clients on every app change and on new connections. Mobile renders a `ContextStrip` component below the main tile grid.

**Tech Stack:** `active-win@7` (CommonJS compatible), `@nut-tree-fork/nut-js` (already implemented), NestJS EventEmitter pattern, React Native Animated API, existing `AiRouterService`/Gemini Edge Function.

---

## File Map

### Agent — new files
| File | Responsibility |
|---|---|
| `apps/agent/src/active-window/active-window.service.ts` | Poll active-win@7, 1.5s debounce, expose `current`, emit `appChanged` |
| `apps/agent/src/context-profile/context-profile.service.ts` | context-profiles.json CRUD + Gemini generation |
| `apps/agent/src/context-profile/context.module.ts` | NestJS module wiring |

### Agent — modified files
| File | Change |
|---|---|
| `apps/agent/src/websocket/ws.gateway.ts` | Subscribe to appChanged; handle 3 new message types; push on connect |
| `apps/agent/src/app.module.ts` | Import `ContextModule` |

### Shared — modified files
| File | Change |
|---|---|
| `packages/shared/src/schema.ts` | Add 6 new types + update union types |

### Mobile — new files
| File | Responsibility |
|---|---|
| `apps/mobile/src/components/ContextStrip.tsx` | Animated overlay strip with horizontal FlatList |
| `apps/mobile/src/screens/ContextShortcutsScreen.tsx` | Profile management settings screen |

### Mobile — modified files
| File | Change |
|---|---|
| `apps/mobile/src/types/schema.ts` | Mirror shared schema additions |
| `apps/mobile/src/services/websocket.service.ts` | Handle CONTEXT_SHORTCUTS; add context methods |
| `apps/mobile/src/screens/DeckScreen.tsx` | Render ContextStrip conditionally |

---

## Task 1: Add schema types to shared package and mobile

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Modify: `apps/mobile/src/types/schema.ts`

- [ ] **Step 1: Add context types to shared schema**

Open `packages/shared/src/schema.ts` and add the following after the existing `GetLicenseStatusMessage` interface (before the `AgentMessage` union):

```ts
// --- Context-aware deck messages ---

export interface ContextShortcut {
  id: string;
  label: string;
  keys: string[];
  description: string;
}

export interface ContextShortcutsMessage {
  type: 'CONTEXT_SHORTCUTS';
  processName: string;   // OS process name, e.g. "Discord.exe" — needed to key ADD_CONTEXT_SHORTCUT
  appLabel: string;
  iconId: string;
  shortcuts: ContextShortcut[];
}

export interface AddContextShortcutMessage {
  type: 'ADD_CONTEXT_SHORTCUT';
  processName: string;
  appLabel: string;
  iconId: string;
  shortcut: Omit<ContextShortcut, 'id'>;
}

export interface RemoveContextShortcutMessage {
  type: 'REMOVE_CONTEXT_SHORTCUT';
  processName: string;
  shortcutId: string;
}

export interface GetContextProfilesMessage {
  type: 'GET_CONTEXT_PROFILES';
}

export interface ContextProfileSummary {
  processName: string;
  appLabel: string;
  iconId: string;
  source: 'llm' | 'user' | 'llm-failed';
  shortcutCount: number;
  shortcuts: ContextShortcut[];  // full list — needed by ContextShortcutsScreen detail view
}

export interface ContextProfilesMessage {
  type: 'CONTEXT_PROFILES';
  profiles: ContextProfileSummary[];
}
```

- [ ] **Step 2: Update AgentMessage union in shared schema**

Replace the existing `AgentMessage` type in `packages/shared/src/schema.ts`:

```ts
export type AgentMessage =
  | ActionResultMessage
  | ConnectedMessage
  | DeckConfigMessage
  | SearchAppsResultMessage
  | ValidatePathResultMessage
  | LicenseStatusMessage
  | AiQuotaExceededMessage
  | ContextShortcutsMessage
  | ContextProfilesMessage;
```

- [ ] **Step 3: Update MobileMessage union in shared schema**

Replace the existing `MobileMessage` type:

```ts
export type MobileMessage =
  | ButtonTapMessage
  | AddTileMessage
  | RemoveTileMessage
  | SetTilePinnedMessage
  | SearchAppsMessage
  | ValidatePathMessage
  | OpenActivationDialogMessage
  | GetLicenseStatusMessage
  | AddContextShortcutMessage
  | RemoveContextShortcutMessage
  | GetContextProfilesMessage;
```

- [ ] **Step 4: Rebuild shared package**

```bash
cd packages/shared && npx tsc --build
```

Expected: no errors, `dist/` files updated.

- [ ] **Step 5: Mirror additions in mobile's local schema**

Open `apps/mobile/src/types/schema.ts` and add the same block from Step 1 after `GetLicenseStatusMessage`, then replace `AgentMessage` and `MobileMessage` unions with the versions from Steps 2 and 3.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schema.ts apps/mobile/src/types/schema.ts
git commit -m "feat(schema): add context-aware deck message types"
```

---

## Task 2: Install active-win

**Files:**
- Modify: `apps/agent/package.json` (via npm)

- [ ] **Step 1: Install active-win v7**

`active-win` v8+ is ESM-only; the agent compiles to CommonJS. Use v7, the last CommonJS-compatible release.

```bash
npm install active-win@7 --workspace=apps/agent
```

Expected: `package-lock.json` updated, `apps/agent/node_modules/active-win/` present.

- [ ] **Step 2: Verify import works**

Create a quick smoke test file, run it, then delete it:

```bash
node -e "const aw = require('active-win'); aw().then(w => console.log(w?.processName ?? 'null')).catch(e => console.error(e))" --experimental-vm-modules 2>/dev/null || node -e "const aw = require('D:/BMC/stream-deck/apps/agent/node_modules/active-win/index.js'); aw().then(w => { console.log('OK:', w?.processName ?? 'null'); process.exit(0); })"
```

Expected: prints the name of your current foreground process (or `null` on lock screen). If it errors, check that you installed v7 not v8.

- [ ] **Step 3: Commit**

```bash
git add package-lock.json apps/agent/package.json
git commit -m "feat(agent): install active-win@7 for foreground window detection"
```

---

## Task 3: ActiveWindowService

**Files:**
- Create: `apps/agent/src/active-window/active-window.service.ts`
- Create: `apps/agent/src/active-window/active-window.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/agent/src/active-window/active-window.service.spec.ts`:

```ts
jest.mock('active-win', () => ({
  __esModule: false,
  default: jest.fn(),
}));

import activeWin from 'active-win';
import { ActiveWindowService } from './active-window.service';

const mockActiveWin = activeWin as jest.MockedFunction<typeof activeWin>;

describe('ActiveWindowService', () => {
  let service: ActiveWindowService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new ActiveWindowService();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('emits appChanged after 1.5s of stable focus', async () => {
    mockActiveWin.mockResolvedValue({ processName: 'Discord.exe' } as Awaited<ReturnType<typeof activeWin>>);
    const listener = jest.fn();
    service.on('appChanged', listener);
    service.onModuleInit();

    // Advance past poll interval (500ms) + debounce (1500ms)
    jest.advanceTimersByTime(2100);
    await Promise.resolve(); // flush microtasks

    expect(listener).toHaveBeenCalledWith('Discord.exe');
    expect(service.current).toBe('Discord.exe');
  });

  it('does not emit when app changes back within debounce window', async () => {
    mockActiveWin
      .mockResolvedValueOnce({ processName: 'Discord.exe' } as Awaited<ReturnType<typeof activeWin>>)
      .mockResolvedValue({ processName: 'Code.exe' } as Awaited<ReturnType<typeof activeWin>>);
    const listener = jest.fn();
    service.on('appChanged', listener);
    service.onModuleInit();

    jest.advanceTimersByTime(600);  // poll fires: Discord.exe
    await Promise.resolve();
    jest.advanceTimersByTime(600);  // poll fires: Code.exe — debounce resets
    await Promise.resolve();

    // Only 1.2s total — debounce (1.5s) hasn't elapsed for either
    expect(listener).not.toHaveBeenCalled();
  });

  it('emits null when active-win returns undefined', async () => {
    mockActiveWin.mockResolvedValue(undefined);
    const listener = jest.fn();
    service.on('appChanged', listener);
    service.onModuleInit();

    jest.advanceTimersByTime(2100);
    await Promise.resolve();

    expect(listener).toHaveBeenCalledWith(null);
    expect(service.current).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=apps/agent -- --testPathPattern=active-window
```

Expected: FAIL — `Cannot find module './active-window.service'`

- [ ] **Step 3: Implement ActiveWindowService**

Create `apps/agent/src/active-window/active-window.service.ts`:

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import activeWin from 'active-win';

const POLL_MS    = 500;
const DEBOUNCE_MS = 1500;

@Injectable()
export class ActiveWindowService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  current: string | null = null;

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: string | null = null;

  onModuleInit(): void {
    this.pollInterval = setInterval(() => void this.poll(), POLL_MS);
  }

  onModuleDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  private async poll(): Promise<void> {
    const win = await activeWin().catch(() => undefined);
    const name = win?.processName ?? null;

    if (name === this.pending) return;
    this.pending = name;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.current = name;
      this.emit('appChanged', name);
    }, DEBOUNCE_MS);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=apps/agent -- --testPathPattern=active-window
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/active-window/
git commit -m "feat(agent): add ActiveWindowService with 500ms poll and 1.5s debounce"
```

---

## Task 4: ContextProfileService — file I/O and CRUD

**Files:**
- Create: `apps/agent/src/context-profile/context-profile.service.ts`
- Create: `apps/agent/src/context-profile/context-profile.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/agent/src/context-profile/context-profile.service.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ContextProfileService } from './context-profile.service';

describe('ContextProfileService (CRUD)', () => {
  let service: ContextProfileService;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-test-'));
    process.env.USER_DATA_PATH = tmpDir;
    service = new ContextProfileService(null as any);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.USER_DATA_PATH;
  });

  it('returns null for unknown process', () => {
    expect(service.getProfile('Unknown.exe')).toBeNull();
  });

  it('returns true for isCurated Discord', () => {
    expect(service.isCurated('Discord.exe')).toBe(true);
  });

  it('returns false for isCurated unknown app', () => {
    expect(service.isCurated('MyApp.exe')).toBe(false);
  });

  it('addShortcut creates profile and persists', () => {
    service.addShortcut('Discord.exe', 'Discord', 'discord', {
      label: 'Mute',
      keys: ['Ctrl', 'Shift', 'M'],
      description: 'Toggle mute',
    });
    const profile = service.getProfile('Discord.exe');
    expect(profile).not.toBeNull();
    expect(profile!.shortcuts).toHaveLength(1);
    expect(profile!.shortcuts[0].label).toBe('Mute');
    expect(profile!.shortcuts[0].id).toBeTruthy();
    expect(profile!.source).toBe('user');

    // Verify persisted to disk
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'context-profiles.json'), 'utf-8'));
    expect(raw.profiles['Discord.exe']).toBeDefined();
  });

  it('removeShortcut deletes entry by id', () => {
    service.addShortcut('Discord.exe', 'Discord', 'discord', {
      label: 'Mute', keys: ['Ctrl', 'Shift', 'M'], description: '',
    });
    const id = service.getProfile('Discord.exe')!.shortcuts[0].id;
    service.removeShortcut('Discord.exe', id);
    expect(service.getProfile('Discord.exe')!.shortcuts).toHaveLength(0);
  });

  it('getAllProfiles returns summaries', () => {
    service.addShortcut('Discord.exe', 'Discord', 'discord', {
      label: 'Mute', keys: ['Ctrl', 'Shift', 'M'], description: '',
    });
    const summaries = service.getAllProfiles();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].processName).toBe('Discord.exe');
    expect(summaries[0].shortcutCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=apps/agent -- --testPathPattern=context-profile.service
```

Expected: FAIL — `Cannot find module './context-profile.service'`

- [ ] **Step 3: Implement ContextProfileService (CRUD only, no LLM yet)**

Create `apps/agent/src/context-profile/context-profile.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ContextShortcut, ContextProfileSummary } from '@control-surface/shared';
import { AiRouterService } from '../ai/ai-router.service';

export interface ContextProfile {
  source: 'llm' | 'user' | 'llm-failed';
  generatedAt?: string;
  appLabel: string;
  iconId: string;
  shortcuts: ContextShortcut[];
}

interface ProfilesFile {
  profiles: Record<string, ContextProfile>;
}

// Maps OS process name → { appLabel, iconId }
// Windows: <Name>.exe  |  macOS: <Name> (no extension)
const CURATED_APPS: Record<string, { appLabel: string; iconId: string }> = {
  // Windows
  'Discord.exe':        { appLabel: 'Discord',      iconId: 'discord'    },
  'obs64.exe':          { appLabel: 'OBS Studio',   iconId: 'obs'        },
  'Code.exe':           { appLabel: 'VS Code',      iconId: 'vscode'     },
  'Spotify.exe':        { appLabel: 'Spotify',      iconId: 'spotify'    },
  'Slack.exe':          { appLabel: 'Slack',        iconId: 'slack'      },
  'figma_agent.exe':    { appLabel: 'Figma',        iconId: 'figma'      },
  'Claude.exe':         { appLabel: 'Claude',       iconId: 'claude'     },
  'chrome.exe':         { appLabel: 'Chrome',       iconId: 'chrome'     },
  'Notion.exe':         { appLabel: 'Notion',       iconId: 'notion'     },
  'steam.exe':          { appLabel: 'Steam',        iconId: 'steam'      },
  'Postman.exe':        { appLabel: 'Postman',      iconId: 'postman'    },
  'WhatsApp.exe':       { appLabel: 'WhatsApp',     iconId: 'whatsapp'   },
  'powershell.exe':     { appLabel: 'PowerShell',   iconId: 'powershell' },
  'WindowsTerminal.exe':{ appLabel: 'Terminal',     iconId: 'terminal'   },
  // macOS
  'Discord':            { appLabel: 'Discord',      iconId: 'discord'    },
  'obs':                { appLabel: 'OBS Studio',   iconId: 'obs'        },
  'Code':               { appLabel: 'VS Code',      iconId: 'vscode'     },
  'Spotify':            { appLabel: 'Spotify',      iconId: 'spotify'    },
  'Slack':              { appLabel: 'Slack',        iconId: 'slack'      },
  'Figma':              { appLabel: 'Figma',        iconId: 'figma'      },
  'Claude':             { appLabel: 'Claude',       iconId: 'claude'     },
  'Google Chrome':      { appLabel: 'Chrome',       iconId: 'chrome'     },
  'Notion':             { appLabel: 'Notion',       iconId: 'notion'     },
  'Steam':              { appLabel: 'Steam',        iconId: 'steam'      },
  'Postman':            { appLabel: 'Postman',      iconId: 'postman'    },
  'WhatsApp':           { appLabel: 'WhatsApp',     iconId: 'whatsapp'   },
  'Terminal':           { appLabel: 'Terminal',     iconId: 'terminal'   },
};

@Injectable()
export class ContextProfileService {
  private data: ProfilesFile = { profiles: {} };
  private readonly filePath: string;

  constructor(private readonly aiRouter: AiRouterService) {
    this.filePath = path.join(
      process.env.USER_DATA_PATH ?? path.join(__dirname, '../../'),
      'context-profiles.json',
    );
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;
    try {
      this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as ProfilesFile;
    } catch {
      this.data = { profiles: {} };
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[ContextProfile] persist failed:', e);
    }
  }

  isCurated(processName: string): boolean {
    return processName in CURATED_APPS;
  }

  getCuratedMeta(processName: string): { appLabel: string; iconId: string } | null {
    return CURATED_APPS[processName] ?? null;
  }

  getProfile(processName: string | null): ContextProfile | null {
    if (!processName) return null;
    return this.data.profiles[processName] ?? null;
  }

  getAllProfiles(): ContextProfileSummary[] {
    return Object.entries(this.data.profiles).map(([processName, p]) => ({
      processName,
      appLabel: p.appLabel,
      iconId: p.iconId,
      source: p.source,
      shortcutCount: p.shortcuts.length,
      shortcuts: p.shortcuts,
    }));
  }

  addShortcut(
    processName: string,
    appLabel: string,
    iconId: string,
    shortcut: Omit<ContextShortcut, 'id'>,
  ): void {
    if (!this.data.profiles[processName]) {
      this.data.profiles[processName] = { source: 'user', appLabel, iconId, shortcuts: [] };
    }
    this.data.profiles[processName].shortcuts.push({ ...shortcut, id: randomUUID() });
    this.persist();
  }

  removeShortcut(processName: string, shortcutId: string): void {
    const profile = this.data.profiles[processName];
    if (!profile) return;
    profile.shortcuts = profile.shortcuts.filter((s) => s.id !== shortcutId);
    this.persist();
  }

  async generateAndCache(processName: string, appLabel: string, iconId: string, platform: string): Promise<void> {
    const osName = platform === 'win32' ? 'Windows' : 'macOS';
    const prompt = `You are a keyboard shortcut assistant. List the most useful default keyboard shortcuts for ${appLabel} on ${osName}.

Return ONLY a JSON array, no markdown, no explanation:
[
  { "label": "Short action name (2-3 words max)", "keys": ["Ctrl","Shift","M"], "description": "One sentence." }
]

Rules:
- Return 12-15 shortcuts maximum
- Order by how frequently a power user would reach for them (most useful first)
- Use the app's actual documented default key bindings only — no guesses
- Keys array: use exact modifier names: "Ctrl", "Shift", "Alt", "Meta"
- If you are not confident about a shortcut, omit it entirely`;

    try {
      const raw = await this.aiRouter.call(prompt, '');
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned) as unknown[];

      const shortcuts: ContextShortcut[] = parsed
        .filter((item): item is { label: string; keys: string[]; description?: string } =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).label === 'string' &&
          Array.isArray((item as Record<string, unknown>).keys),
        )
        .map((item) => ({
          id:          randomUUID(),
          label:       item.label,
          keys:        item.keys,
          description: typeof item.description === 'string' ? item.description : '',
        }));

      if (shortcuts.length === 0) throw new Error('Empty shortcut list');

      this.data.profiles[processName] = {
        source:      'llm',
        generatedAt: new Date().toISOString(),
        appLabel,
        iconId,
        shortcuts,
      };
    } catch (e) {
      console.warn(`[ContextProfile] generation failed for ${appLabel}:`, e);
      this.data.profiles[processName] = {
        source:   'llm-failed',
        appLabel,
        iconId,
        shortcuts: [],
      };
    }
    this.persist();
  }
}
```

- [ ] **Step 4: Run CRUD tests to verify they pass**

```bash
npm test --workspace=apps/agent -- --testPathPattern=context-profile.service
```

Expected: PASS (5 tests)

- [ ] **Step 5: Write LLM generation test and verify it passes**

Add to `apps/agent/src/context-profile/context-profile.service.spec.ts`:

```ts
describe('ContextProfileService (LLM generation)', () => {
  let service: ContextProfileService;
  let tmpDir: string;
  let mockAiRouter: { call: jest.Mock };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-llm-test-'));
    process.env.USER_DATA_PATH = tmpDir;
    mockAiRouter = { call: jest.fn() };
    service = new ContextProfileService(mockAiRouter as any);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.USER_DATA_PATH;
  });

  it('generateAndCache stores llm profile on success', async () => {
    mockAiRouter.call.mockResolvedValue(
      JSON.stringify([{ label: 'Mute', keys: ['Ctrl', 'Shift', 'M'], description: 'Toggle mute' }]),
    );
    await service.generateAndCache('Discord.exe', 'Discord', 'discord', 'win32');
    const profile = service.getProfile('Discord.exe');
    expect(profile?.source).toBe('llm');
    expect(profile?.shortcuts).toHaveLength(1);
    expect(profile?.shortcuts[0].id).toBeTruthy();
  });

  it('generateAndCache stores llm-failed on invalid JSON', async () => {
    mockAiRouter.call.mockResolvedValue('not json');
    await service.generateAndCache('Discord.exe', 'Discord', 'discord', 'win32');
    expect(service.getProfile('Discord.exe')?.source).toBe('llm-failed');
  });

  it('generateAndCache stores llm-failed on empty array', async () => {
    mockAiRouter.call.mockResolvedValue('[]');
    await service.generateAndCache('Discord.exe', 'Discord', 'discord', 'win32');
    expect(service.getProfile('Discord.exe')?.source).toBe('llm-failed');
  });

  it('generateAndCache strips markdown fences from LLM response', async () => {
    mockAiRouter.call.mockResolvedValue(
      '```json\n[{"label":"Mute","keys":["Ctrl","Shift","M"],"description":"x"}]\n```',
    );
    await service.generateAndCache('Discord.exe', 'Discord', 'discord', 'win32');
    expect(service.getProfile('Discord.exe')?.source).toBe('llm');
  });
});
```

```bash
npm test --workspace=apps/agent -- --testPathPattern=context-profile.service
```

Expected: PASS (9 tests total)

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/context-profile/
git commit -m "feat(agent): add ContextProfileService with disk cache and LLM generation"
```

---

## Task 5: ContextModule and AppModule wiring

**Files:**
- Create: `apps/agent/src/context-profile/context.module.ts`
- Modify: `apps/agent/src/app.module.ts`

- [ ] **Step 1: Create ContextModule**

Create `apps/agent/src/context-profile/context.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ActiveWindowService } from '../active-window/active-window.service';
import { ContextProfileService } from './context-profile.service';
import { AiRouterService } from '../ai/ai-router.service';
import { LicenseModule } from '../license/license.module';

@Module({
  imports: [LicenseModule],
  providers: [ActiveWindowService, ContextProfileService, AiRouterService],
  exports: [ActiveWindowService, ContextProfileService],
})
export class ContextModule {}
```

- [ ] **Step 2: Import ContextModule in AppModule**

Open `apps/agent/src/app.module.ts` and make these changes:

```ts
import { Module } from '@nestjs/common';
import { WsGateway } from './websocket/ws.gateway';
import { ClipboardService } from './clipboard/clipboard.service';
import { AiRouterService } from './ai/ai-router.service';
import { CommandService } from './command/command.service';
import { AppLaunchService } from './app-launch/app-launch.service';
import { AppRegistryService } from './app-launch/app-registry.service';
import { KeystrokeService } from './keystroke/keystroke.service';
import { AppSearchService } from './app-search/app-search.service';
import { LicenseModule } from './license/license.module';
import { NetworkModule } from './network/network.module';
import { ContextModule } from './context-profile/context.module';

@Module({
  imports: [LicenseModule, NetworkModule, ContextModule],
  providers: [
    WsGateway,
    ClipboardService,
    AiRouterService,
    CommandService,
    AppLaunchService,
    AppRegistryService,
    KeystrokeService,
    AppSearchService,
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Build to verify no compile errors**

```bash
npm run build --workspace=apps/agent
```

Expected: no errors. If `AiRouterService` appears duplicated (declared in both `AppModule` providers and `ContextModule`), remove it from `AppModule` providers since `ContextModule` exports it — but only do this if you see a NestJS duplicate-provider warning.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/context-profile/context.module.ts apps/agent/src/app.module.ts
git commit -m "feat(agent): wire ContextModule into AppModule"
```

---

## Task 6: WsGateway — context integration

**Files:**
- Modify: `apps/agent/src/websocket/ws.gateway.ts`

- [ ] **Step 1: Add imports and inject new services**

Open `apps/agent/src/websocket/ws.gateway.ts`. Add these imports at the top:

```ts
import { platform } from 'os';
import {
  // existing imports ...
  ContextShortcutsMessage,
  ContextProfilesMessage,
  AddContextShortcutMessage,
  RemoveContextShortcutMessage,
} from '@control-surface/shared';
import { ActiveWindowService } from '../active-window/active-window.service';
import { ContextProfileService } from '../context-profile/context-profile.service';
```

- [ ] **Step 2: Update constructor to inject and subscribe**

Replace the constructor in `ws.gateway.ts`:

```ts
constructor(
  private readonly commandService: CommandService,
  private readonly appRegistry: AppRegistryService,
  private readonly appSearch: AppSearchService,
  private readonly licenseService: LicenseService,
  private readonly activationDialog: ActivationDialogService,
  private readonly activeWindow: ActiveWindowService,
  private readonly contextProfile: ContextProfileService,
) {
  super();
  this.activationDialog.onActivated?.(() => this.broadcastLicenseStatus());
  this.activeWindow.on('appChanged', (processName: string | null) => {
    void this.handleAppChanged(processName);
  });
}
```

- [ ] **Step 3: Add handleAppChanged and broadcastContextShortcuts helpers**

Add these private methods to `WsGateway` (before `handleConnection`):

```ts
private async handleAppChanged(processName: string | null): Promise<void> {
  let profile = this.contextProfile.getProfile(processName);

  if (!profile && processName && this.contextProfile.isCurated(processName)) {
    const meta = this.contextProfile.getCuratedMeta(processName)!;
    await this.contextProfile.generateAndCache(processName, meta.appLabel, meta.iconId, platform());
    profile = this.contextProfile.getProfile(processName);
  }

  this.broadcastContextShortcuts(processName, profile);
}

private buildContextMsg(
  processName: string | null,
  profile: import('../context-profile/context-profile.service').ContextProfile | null,
): ContextShortcutsMessage {
  const hasContent = profile && profile.source !== 'llm-failed' && profile.shortcuts.length > 0;
  return {
    type:        'CONTEXT_SHORTCUTS',
    processName: processName ?? '',
    appLabel:    hasContent ? profile.appLabel : '',
    iconId:      hasContent ? profile.iconId   : '',
    shortcuts:   hasContent ? profile.shortcuts : [],
  };
}

private broadcastContextShortcuts(
  processName: string | null,
  profile: import('../context-profile/context-profile.service').ContextProfile | null,
): void {
  const payload = JSON.stringify(this.buildContextMsg(processName, profile));
  this.server.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

private sendContextShortcuts(client: WebSocket): void {
  const pn = this.activeWindow.current;
  const profile = this.contextProfile.getProfile(pn);
  client.send(JSON.stringify(this.buildContextMsg(pn, profile)));
}
```

- [ ] **Step 4: Send context on new connection**

In `handleConnection`, after `this.sendLicenseStatus(client);` add:

```ts
this.sendContextShortcuts(client);
```

- [ ] **Step 5: Handle the three new message types**

In the `client.on('message', ...)` handler, add these blocks before the final `if (data.type !== 'BUTTON_TAP') return;` line:

```ts
if (data.type === 'ADD_CONTEXT_SHORTCUT') {
  const d = data as AddContextShortcutMessage;
  this.contextProfile.addShortcut(d.processName, d.appLabel, d.iconId, d.shortcut);
  const profile = this.contextProfile.getProfile(d.processName);
  client.send(JSON.stringify(this.buildContextMsg(d.processName, profile)));
  return;
}

if (data.type === 'REMOVE_CONTEXT_SHORTCUT') {
  const d = data as RemoveContextShortcutMessage;
  this.contextProfile.removeShortcut(d.processName, d.shortcutId);
  const profile = this.contextProfile.getProfile(d.processName);
  client.send(JSON.stringify(this.buildContextMsg(d.processName, profile)));
  return;
}

if (data.type === 'GET_CONTEXT_PROFILES') {
  const msg: ContextProfilesMessage = {
    type:     'CONTEXT_PROFILES',
    profiles: this.contextProfile.getAllProfiles(),
  };
  client.send(JSON.stringify(msg));
  return;
}
```

- [ ] **Step 6: Build to verify no compile errors**

```bash
npm run build --workspace=apps/agent
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/websocket/ws.gateway.ts
git commit -m "feat(agent): push CONTEXT_SHORTCUTS on app focus change and connection"
```

---

## Task 7: Mobile WebSocketService — context support

**Files:**
- Modify: `apps/mobile/src/services/websocket.service.ts`

- [ ] **Step 1: Add new imports at the top of websocket.service.ts**

```ts
import {
  // ...existing imports...
  ContextShortcutsMessage,
  ContextProfilesMessage,
  AddContextShortcutMessage,
  RemoveContextShortcutMessage,
  GetContextProfilesMessage,
  ContextShortcut,
} from '../types/schema';
```

- [ ] **Step 2: Add new callback types and arrays**

After the existing callback type declarations, add:

```ts
type ContextShortcutsCallback = (msg: ContextShortcutsMessage) => void;
type ContextProfilesCallback  = (msg: ContextProfilesMessage) => void;
```

In the `WebSocketService` class, add two new arrays alongside the existing ones:

```ts
private contextShortcutsCallbacks: ContextShortcutsCallback[] = [];
private contextProfilesCallbacks:  ContextProfilesCallback[]  = [];
```

- [ ] **Step 3: Handle new message types in onmessage**

In the `ws.onmessage` handler, add these branches after the `AI_QUOTA_EXCEEDED` branch:

```ts
} else if (msg.type === 'CONTEXT_SHORTCUTS') {
  this.contextShortcutsCallbacks.forEach((cb) => cb(msg));
} else if (msg.type === 'CONTEXT_PROFILES') {
  this.contextProfilesCallbacks.forEach((cb) => cb(msg));
}
```

- [ ] **Step 4: Add send methods**

After `requestLicenseStatus()`, add:

```ts
addContextShortcut(
  processName: string,
  appLabel: string,
  iconId: string,
  shortcut: Omit<ContextShortcut, 'id'>,
): void {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
  const msg: AddContextShortcutMessage = {
    type: 'ADD_CONTEXT_SHORTCUT',
    processName,
    appLabel,
    iconId,
    shortcut,
  };
  this.ws.send(JSON.stringify(msg));
}

removeContextShortcut(processName: string, shortcutId: string): void {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
  const msg: RemoveContextShortcutMessage = { type: 'REMOVE_CONTEXT_SHORTCUT', processName, shortcutId };
  this.ws.send(JSON.stringify(msg));
}

requestContextProfiles(): void {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
  const msg: GetContextProfilesMessage = { type: 'GET_CONTEXT_PROFILES' };
  this.ws.send(JSON.stringify(msg));
}
```

- [ ] **Step 5: Add subscription methods**

```ts
onContextShortcuts(cb: ContextShortcutsCallback): () => void {
  this.contextShortcutsCallbacks.push(cb);
  return () => {
    this.contextShortcutsCallbacks = this.contextShortcutsCallbacks.filter((c) => c !== cb);
  };
}

onContextProfiles(cb: ContextProfilesCallback): () => void {
  this.contextProfilesCallbacks.push(cb);
  return () => {
    this.contextProfilesCallbacks = this.contextProfilesCallbacks.filter((c) => c !== cb);
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/services/websocket.service.ts
git commit -m "feat(mobile): handle CONTEXT_SHORTCUTS and context profile messages in WebSocketService"
```

---

## Task 8: ContextStrip component

**Files:**
- Create: `apps/mobile/src/components/ContextStrip.tsx`

- [ ] **Step 1: Create ContextStrip**

Create `apps/mobile/src/components/ContextStrip.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ContextShortcut, ContextShortcutsMessage } from '../types/schema';

interface Props {
  msg: ContextShortcutsMessage | null;
  onTapShortcut: (shortcut: ContextShortcut) => void;
  onAddShortcut: (shortcut: Omit<ContextShortcut, 'id'>) => void;
}

const STRIP_HEIGHT = 120;
const MODIFIERS = ['Ctrl', 'Shift', 'Alt', 'Meta'];

export function ContextStrip({ msg, onTapShortcut, onAddShortcut }: Props) {
  const slideAnim = useRef(new Animated.Value(STRIP_HEIGHT)).current;
  const [dismissed, setDismissed] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [addKeys, setAddKeys] = useState<string[]>([]);
  const [addKeyInput, setAddKeyInput] = useState('');

  const visible = !!msg && msg.shortcuts.length > 0 && !dismissed;

  // Reset dismissed when a new app context arrives
  useEffect(() => {
    setDismissed(false);
  }, [msg?.appLabel]);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue:         visible ? 0 : STRIP_HEIGHT,
      duration:        260,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  if (!msg) return null;

  const handleSaveShortcut = () => {
    if (!addLabel.trim() || addKeys.length === 0) return;
    onAddShortcut({ label: addLabel.trim(), keys: addKeys, description: '' });
    setAddLabel('');
    setAddKeys([]);
    setAddKeyInput('');
    setShowAddForm(false);
  };

  const toggleModifier = (mod: string) => {
    setAddKeys((prev) =>
      prev.includes(mod) ? prev.filter((k) => k !== mod) : [...prev, mod],
    );
  };

  const handleKeyInputSubmit = () => {
    const k = addKeyInput.trim();
    if (k && !addKeys.includes(k)) setAddKeys((prev) => [...prev, k]);
    setAddKeyInput('');
  };

  const renderShortcut = ({ item }: { item: ContextShortcut }) => (
    <TouchableOpacity
      style={styles.tile}
      onPress={() => onTapShortcut(item)}
      activeOpacity={0.7}
    >
      <Text style={styles.tileKeys}>{item.keys.join('+')}</Text>
      <Text style={styles.tileLabel} numberOfLines={2}>{item.label}</Text>
    </TouchableOpacity>
  );

  const addTile = (
    <TouchableOpacity style={[styles.tile, styles.addTile]} onPress={() => setShowAddForm(true)} activeOpacity={0.7}>
      <Text style={styles.addTileIcon}>+</Text>
      <Text style={styles.tileLabel}>Add</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <Animated.View style={[styles.strip, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.header}>
          <Text style={styles.appLabel}>{msg.appLabel}</Text>
          {msg.shortcuts.length > 0 && (
            <Text style={styles.aiBadge}>AI</Text>
          )}
          <TouchableOpacity onPress={() => setDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.dismiss}>✕</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={msg.shortcuts}
          keyExtractor={(item) => item.id}
          renderItem={renderShortcut}
          horizontal
          showsHorizontalScrollIndicator={false}
          ListFooterComponent={addTile}
          contentContainerStyle={styles.list}
          fadingEdgeLength={32}
        />
      </Animated.View>

      <Modal visible={showAddForm} transparent animationType="slide" onRequestClose={() => setShowAddForm(false)}>
        <View style={styles.formBackdrop}>
          <View style={styles.formSheet}>
            <Text style={styles.formTitle}>Add Shortcut for {msg.appLabel}</Text>

            <Text style={styles.formLabel}>Label</Text>
            <TextInput
              style={styles.formInput}
              value={addLabel}
              onChangeText={setAddLabel}
              placeholder="e.g. Push to Talk"
              placeholderTextColor="#555"
            />

            <Text style={styles.formLabel}>Modifiers</Text>
            <View style={styles.modifierRow}>
              {MODIFIERS.map((mod) => (
                <TouchableOpacity
                  key={mod}
                  style={[styles.modifierChip, addKeys.includes(mod) && styles.modifierChipActive]}
                  onPress={() => toggleModifier(mod)}
                >
                  <Text style={[styles.modifierText, addKeys.includes(mod) && styles.modifierTextActive]}>
                    {mod}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Key</Text>
            <TextInput
              style={styles.formInput}
              value={addKeyInput}
              onChangeText={setAddKeyInput}
              onSubmitEditing={handleKeyInputSubmit}
              placeholder="e.g. M  then press return"
              placeholderTextColor="#555"
              autoCapitalize="none"
            />
            {addKeys.length > 0 && (
              <Text style={styles.keysPreview}>{addKeys.join(' + ')}</Text>
            )}

            <TouchableOpacity style={styles.saveButton} onPress={handleSaveShortcut} activeOpacity={0.8}>
              <Text style={styles.saveButtonText}>Save Shortcut</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddForm(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  strip: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    height:          STRIP_HEIGHT,
    backgroundColor: '#13132A',
    borderTopWidth:  1,
    borderTopColor:  'rgba(91,79,232,0.4)',
    paddingBottom:   8,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap:            8,
  },
  appLabel:  { color: '#FFFFFF', fontSize: 12, fontWeight: '700', flex: 1 },
  aiBadge: {
    color:           '#5B4FE8',
    fontSize:        9,
    fontWeight:      '800',
    borderWidth:     1,
    borderColor:     '#5B4FE8',
    borderRadius:    4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  dismiss:   { color: '#6B6B8A', fontSize: 14, paddingLeft: 4 },
  list:      { paddingHorizontal: 10, gap: 6 },
  tile: {
    width:           72,
    backgroundColor: '#1E1E35',
    borderRadius:    10,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap:             4,
    minHeight:       62,
  },
  addTile:      { borderWidth: 1, borderColor: '#2A2A4A', borderStyle: 'dashed' },
  addTileIcon:  { color: '#4A4A7A', fontSize: 20 },
  tileKeys:     { color: '#5B4FE8', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  tileLabel:    { color: '#CCCCEE', fontSize: 10, textAlign: 'center' },
  formBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  formSheet: {
    backgroundColor:    '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding:            24,
    paddingBottom:      40,
  },
  formTitle:    { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  formLabel:    { color: '#8888AA', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  formInput: {
    backgroundColor: '#0F0F1E',
    borderRadius:    8,
    padding:         12,
    color:           '#FFFFFF',
    fontSize:        14,
    borderWidth:     1,
    borderColor:     '#2A2A4A',
  },
  modifierRow:        { flexDirection: 'row', gap: 8 },
  modifierChip: {
    paddingHorizontal: 12,
    paddingVertical:   8,
    borderRadius:      8,
    backgroundColor:   '#0F0F1E',
    borderWidth:       1,
    borderColor:       '#2A2A4A',
  },
  modifierChipActive: { backgroundColor: '#5B4FE8', borderColor: '#5B4FE8' },
  modifierText:       { color: '#8888AA', fontSize: 13, fontWeight: '600' },
  modifierTextActive: { color: '#FFFFFF' },
  keysPreview:  { color: '#5B4FE8', fontSize: 12, marginTop: 6 },
  saveButton: {
    backgroundColor: '#5B4FE8',
    borderRadius:    10,
    paddingVertical: 14,
    alignItems:      'center',
    marginTop:       20,
  },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  cancelButton:   { alignItems: 'center', paddingVertical: 12 },
  cancelButtonText: { color: '#6B6B8A', fontSize: 14 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/ContextStrip.tsx
git commit -m "feat(mobile): add ContextStrip component with animated slide and inline add form"
```

---

## Task 9: DeckScreen — integrate ContextStrip

**Files:**
- Modify: `apps/mobile/src/screens/DeckScreen.tsx`

- [ ] **Step 1: Import ContextStrip and new types**

At the top of `DeckScreen.tsx`, add:

```ts
import { ContextStrip } from '../components/ContextStrip';
import { ContextShortcutsMessage, ContextShortcut } from '../types/schema';
```

- [ ] **Step 2: Add contextMsg state**

Inside `DeckScreen()`, alongside the existing `useState` calls:

```ts
const [contextMsg, setContextMsg] = useState<ContextShortcutsMessage | null>(null);
```

- [ ] **Step 3: Subscribe in the WebSocket effect**

Inside the Effect 2 block (where `ws` is created), after `ws.onDeckConfig(...)`:

```ts
const unsubscribeContext = ws.onContextShortcuts((msg) => {
  setContextMsg(msg.shortcuts.length > 0 ? msg : null);
});
```

And in the cleanup return of that effect, add:

```ts
unsubscribeContext();
```

- [ ] **Step 4: Add tap handler for context shortcuts**

Inside `DeckScreen()`, after `handleTogglePinned`:

```ts
const handleContextShortcutTap = (shortcut: ContextShortcut) => {
  wsRef.current?.tap(`ctx-${shortcut.id}`, { kind: 'KEYSTROKE', keys: shortcut.keys });
};

const handleAddContextShortcut = (shortcut: Omit<ContextShortcut, 'id'>) => {
  if (!contextMsg) return;
  wsRef.current?.addContextShortcut(
    contextMsg.processName,
    contextMsg.appLabel,
    contextMsg.iconId,
    shortcut,
  );
};
```

- [ ] **Step 5: Render ContextStrip**

Inside the main `return (...)` of `DeckScreen`, just before the closing `</SafeAreaView>` tag (after all Modals), add:

```tsx
<ContextStrip
  msg={contextMsg}
  onTapShortcut={handleContextShortcutTap}
  onAddShortcut={handleAddContextShortcut}
/>
```

Also update the `grid` content container padding bottom so tiles don't hide behind the strip when it's visible. Find `contentContainerStyle={styles.grid}` and change the style value:

```ts
// in StyleSheet.create:
grid: { padding: 8, paddingBottom: 140 },  // was 80
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/DeckScreen.tsx
git commit -m "feat(mobile): integrate ContextStrip into DeckScreen"
```

---

## Task 10: ContextShortcutsScreen — profile management

**Files:**
- Create: `apps/mobile/src/screens/ContextShortcutsScreen.tsx`

- [ ] **Step 1: Create ContextShortcutsScreen**

Create `apps/mobile/src/screens/ContextShortcutsScreen.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ContextProfileSummary,
  ContextShortcut,
  ContextProfilesMessage,
  ContextShortcutsMessage,
} from '../types/schema';
import { WebSocketService } from '../services/websocket.service';

interface Props {
  ws: WebSocketService;
  onDismiss: () => void;
}

const MODIFIERS = ['Ctrl', 'Shift', 'Alt', 'Meta'];

export function ContextShortcutsScreen({ ws, onDismiss }: Props) {
  const [profiles, setProfiles] = useState<ContextProfileSummary[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ContextShortcutsMessage | null>(null);
  const [showAddApp, setShowAddApp] = useState(false);
  const [showAddShortcut, setShowAddShortcut] = useState(false);

  // Add-app form state
  const [newAppLabel, setNewAppLabel] = useState('');
  const [newProcessName, setNewProcessName] = useState('');
  const [newShortcutLabel, setNewShortcutLabel] = useState('');
  const [newShortcutKeys, setNewShortcutKeys] = useState<string[]>([]);
  const [newKeyInput, setNewKeyInput] = useState('');

  // Add-shortcut form state
  const [addLabel, setAddLabel] = useState('');
  const [addKeys, setAddKeys] = useState<string[]>([]);
  const [addKeyInput, setAddKeyInput] = useState('');

  useEffect(() => {
    const unsub = ws.onContextProfiles((msg: ContextProfilesMessage) => {
      setProfiles(msg.profiles);
    });
    ws.requestContextProfiles();
    return unsub;
  }, [ws]);

  const handleSelectProfile = (summary: ContextProfileSummary) => {
    // ContextProfileSummary includes full shortcuts — use them directly
    setSelectedProfile({
      type:        'CONTEXT_SHORTCUTS',
      processName: summary.processName,
      appLabel:    summary.appLabel,
      iconId:      summary.iconId,
      shortcuts:   summary.shortcuts,
    });
  };

  const handleRemoveShortcut = (shortcutId: string) => {
    if (!selectedProfile) return;
    const processName = profiles.find((p) => p.appLabel === selectedProfile.appLabel)?.processName ?? '';
    ws.removeContextShortcut(processName, shortcutId);
    ws.requestContextProfiles();
    setSelectedProfile(null);
  };

  const handleAddShortcut = () => {
    if (!selectedProfile || !addLabel.trim() || addKeys.length === 0) return;
    const processName = profiles.find((p) => p.appLabel === selectedProfile.appLabel)?.processName ?? '';
    ws.addContextShortcut(processName, selectedProfile.appLabel, selectedProfile.iconId, {
      label: addLabel.trim(),
      keys: addKeys,
      description: '',
    });
    setAddLabel('');
    setAddKeys([]);
    setShowAddShortcut(false);
    ws.requestContextProfiles();
    setSelectedProfile(null);
  };

  const handleAddApp = () => {
    if (!newAppLabel.trim() || !newProcessName.trim() || !newShortcutLabel.trim() || newShortcutKeys.length === 0) return;
    ws.addContextShortcut(newProcessName.trim(), newAppLabel.trim(), 'custom', {
      label: newShortcutLabel.trim(),
      keys: newShortcutKeys,
      description: '',
    });
    setNewAppLabel('');
    setNewProcessName('');
    setNewShortcutLabel('');
    setNewShortcutKeys([]);
    setShowAddApp(false);
    ws.requestContextProfiles();
  };

  const toggleModifier = (mod: string, keys: string[], setKeys: (k: string[]) => void) => {
    setKeys(keys.includes(mod) ? keys.filter((k) => k !== mod) : [...keys, mod]);
  };

  const renderProfile = ({ item }: { item: ContextProfileSummary }) => (
    <TouchableOpacity style={styles.row} onPress={() => handleSelectProfile(item)} activeOpacity={0.75}>
      <View style={styles.rowIcon}>
        <Text style={styles.rowIconText}>{item.appLabel[0]}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{item.appLabel}</Text>
        <Text style={styles.rowSub}>{item.shortcutCount} shortcuts · {item.source === 'user' ? 'Manual' : 'AI'}</Text>
      </View>
      <Text style={styles.rowChevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onDismiss}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Context Shortcuts</Text>
      </View>

      <FlatList
        data={profiles}
        keyExtractor={(item) => item.processName}
        renderItem={renderProfile}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No profiles yet. Focus a known app to auto-generate shortcuts.</Text>}
        ListFooterComponent={
          <TouchableOpacity style={styles.addAppRow} onPress={() => setShowAddApp(true)} activeOpacity={0.75}>
            <Text style={styles.addAppText}>+ Add app manually</Text>
          </TouchableOpacity>
        }
      />

      {/* Profile detail modal */}
      <Modal visible={selectedProfile !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedProfile(null)}>
        {selectedProfile && (
          <SafeAreaView style={styles.container}>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => setSelectedProfile(null)}>
                <Text style={styles.back}>←</Text>
              </TouchableOpacity>
              <Text style={styles.title}>{selectedProfile.appLabel}</Text>
            </View>
            <FlatList
              data={selectedProfile.shortcuts}
              keyExtractor={(s) => s.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }: { item: ContextShortcut }) => (
                <View style={styles.shortcutRow}>
                  <View style={styles.shortcutBody}>
                    <Text style={styles.shortcutLabel}>{item.label}</Text>
                    <Text style={styles.shortcutKeys}>{item.keys.join(' + ')}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveShortcut(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.deleteBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListFooterComponent={
                <TouchableOpacity style={styles.addAppRow} onPress={() => setShowAddShortcut(true)} activeOpacity={0.75}>
                  <Text style={styles.addAppText}>+ Add shortcut</Text>
                </TouchableOpacity>
              }
            />
          </SafeAreaView>
        )}
      </Modal>

      {/* Add shortcut modal */}
      <Modal visible={showAddShortcut} transparent animationType="slide" onRequestClose={() => setShowAddShortcut(false)}>
        <View style={styles.formBackdrop}>
          <View style={styles.formSheet}>
            <Text style={styles.formTitle}>Add Shortcut</Text>
            <TextInput style={styles.formInput} value={addLabel} onChangeText={setAddLabel} placeholder="Label" placeholderTextColor="#555" />
            <View style={styles.modifierRow}>
              {MODIFIERS.map((mod) => (
                <TouchableOpacity key={mod} style={[styles.chip, addKeys.includes(mod) && styles.chipActive]} onPress={() => toggleModifier(mod, addKeys, setAddKeys)}>
                  <Text style={[styles.chipText, addKeys.includes(mod) && styles.chipTextActive]}>{mod}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.formInput} value={addKeyInput} onChangeText={setAddKeyInput} onSubmitEditing={() => { if (addKeyInput.trim()) { setAddKeys((k) => [...k, addKeyInput.trim()]); setAddKeyInput(''); } }} placeholder="Key (press return to add)" placeholderTextColor="#555" autoCapitalize="none" />
            {addKeys.length > 0 && <Text style={styles.preview}>{addKeys.join(' + ')}</Text>}
            <TouchableOpacity style={styles.saveButton} onPress={handleAddShortcut}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddShortcut(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add app modal */}
      <Modal visible={showAddApp} transparent animationType="slide" onRequestClose={() => setShowAddApp(false)}>
        <View style={styles.formBackdrop}>
          <View style={styles.formSheet}>
            <Text style={styles.formTitle}>Add App Manually</Text>
            <TextInput style={styles.formInput} value={newAppLabel} onChangeText={setNewAppLabel} placeholder="App name (e.g. Photoshop)" placeholderTextColor="#555" />
            <TextInput style={styles.formInput} value={newProcessName} onChangeText={setNewProcessName} placeholder="Process name (e.g. Photoshop.exe)" placeholderTextColor="#555" autoCapitalize="none" />
            <Text style={styles.hint}>Find the process name in Task Manager → Details tab</Text>
            <TextInput style={styles.formInput} value={newShortcutLabel} onChangeText={setNewShortcutLabel} placeholder="First shortcut label" placeholderTextColor="#555" />
            <View style={styles.modifierRow}>
              {MODIFIERS.map((mod) => (
                <TouchableOpacity key={mod} style={[styles.chip, newShortcutKeys.includes(mod) && styles.chipActive]} onPress={() => toggleModifier(mod, newShortcutKeys, setNewShortcutKeys)}>
                  <Text style={[styles.chipText, newShortcutKeys.includes(mod) && styles.chipTextActive]}>{mod}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.formInput} value={newKeyInput} onChangeText={setNewKeyInput} onSubmitEditing={() => { if (newKeyInput.trim()) { setNewShortcutKeys((k) => [...k, newKeyInput.trim()]); setNewKeyInput(''); } }} placeholder="Key" placeholderTextColor="#555" autoCapitalize="none" />
            {newShortcutKeys.length > 0 && <Text style={styles.preview}>{newShortcutKeys.join(' + ')}</Text>}
            <TouchableOpacity style={styles.saveButton} onPress={handleAddApp}><Text style={styles.saveText}>Add App</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddApp(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0F0F14' },
  header:       { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  back:         { color: '#5B4FE8', fontSize: 20 },
  title:        { color: '#FFFFFF', fontSize: 18, fontWeight: '700', flex: 1 },
  list:         { padding: 12 },
  row: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#1A1A2E',
    borderRadius:    10,
    padding:         12,
    marginBottom:    8,
    gap:             12,
  },
  rowIcon: {
    width:           36,
    height:          36,
    borderRadius:    8,
    backgroundColor: '#5B4FE8',
    alignItems:      'center',
    justifyContent:  'center',
  },
  rowIconText:  { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  rowBody:      { flex: 1 },
  rowLabel:     { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  rowSub:       { color: '#6B6B8A', fontSize: 12, marginTop: 2 },
  rowChevron:   { color: '#4A4A6A', fontSize: 18 },
  addAppRow:    { padding: 16, alignItems: 'center' },
  addAppText:   { color: '#5B4FE8', fontSize: 14, fontWeight: '600' },
  empty:        { color: '#6B6B8A', fontSize: 13, textAlign: 'center', padding: 24 },
  shortcutRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A2E', borderRadius: 10, padding: 12, marginBottom: 8 },
  shortcutBody: { flex: 1 },
  shortcutLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  shortcutKeys:  { color: '#5B4FE8', fontSize: 11, marginTop: 2 },
  deleteBtn:    { color: '#6B6B8A', fontSize: 14, padding: 4 },
  formBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  formSheet:    { backgroundColor: '#1A1A2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  formTitle:    { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  formInput:    { backgroundColor: '#0F0F1E', borderRadius: 8, padding: 12, color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: '#2A2A4A', marginBottom: 10 },
  hint:         { color: '#6B6B8A', fontSize: 11, marginBottom: 10 },
  modifierRow:  { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip:         { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#0F0F1E', borderWidth: 1, borderColor: '#2A2A4A' },
  chipActive:   { backgroundColor: '#5B4FE8', borderColor: '#5B4FE8' },
  chipText:     { color: '#8888AA', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  preview:      { color: '#5B4FE8', fontSize: 12, marginBottom: 8 },
  saveButton:   { backgroundColor: '#5B4FE8', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveText:     { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  cancelBtn:    { alignItems: 'center', paddingVertical: 12 },
  cancelText:   { color: '#6B6B8A', fontSize: 14 },
});
```

- [ ] **Step 2: Expose ContextShortcutsScreen via a button in DeckScreen settings**

Open `apps/mobile/src/screens/DeckScreen.tsx` and add state + modal for the settings screen. In the imports add:

```ts
import { ContextShortcutsScreen } from './ContextShortcutsScreen';
```

Add state:

```ts
const [showContextSettings, setShowContextSettings] = useState(false);
```

Add a "Context Shortcuts" option button somewhere accessible (e.g. alongside the existing FAB — add a second FAB or a menu item in the header). The simplest approach: add a small ⚙ button to the header next to "KDeck":

In the header `<View>`, after the title `<Text>` and before the status badge, add:

```tsx
{wsService && (
  <TouchableOpacity onPress={() => setShowContextSettings(true)} style={{ paddingHorizontal: 8 }} activeOpacity={0.7}>
    <Text style={{ color: '#6B6B8A', fontSize: 18 }}>⚙</Text>
  </TouchableOpacity>
)}
```

Add the modal at the end of the return (after all existing Modals):

```tsx
<Modal
  visible={showContextSettings}
  animationType="slide"
  presentationStyle="pageSheet"
  onRequestClose={() => setShowContextSettings(false)}
>
  {wsService && (
    <ContextShortcutsScreen
      ws={wsService}
      onDismiss={() => setShowContextSettings(false)}
    />
  )}
</Modal>
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/ContextShortcutsScreen.tsx apps/mobile/src/screens/DeckScreen.tsx
git commit -m "feat(mobile): add ContextShortcutsScreen and settings entry point"
```

---

## Task 11: Full build verification

**Files:** none — compile-only check

- [ ] **Step 1: Build agent**

```bash
npm run build --workspace=apps/agent
```

Expected: no TypeScript errors.

- [ ] **Step 2: Build shared**

```bash
cd packages/shared && npx tsc --build
```

Expected: no errors.

- [ ] **Step 3: Run all agent tests**

```bash
npm test --workspace=apps/agent
```

Expected: all tests PASS with no regressions.

- [ ] **Step 4: Commit if anything was unstaged**

```bash
git status
```

If clean, nothing to do. Otherwise commit any missed files before Task 12.

---

## Task 12: End-to-end smoke test

- [ ] **Step 1: Run all agent tests**

```bash
npm test --workspace=apps/agent
```

Expected: all tests PASS (no regressions in existing tests)

- [ ] **Step 2: Build agent**

```bash
npm run build --workspace=apps/agent
```

Expected: no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

1. Start the agent: `npm run agent`
2. Open a known app on your desktop (e.g. Discord)
3. Wait 2 seconds
4. Check agent console — should print something like `[Agent] appChanged: Discord.exe → generating shortcuts...`
5. Start the mobile app: `npm run mobile`
6. Connect — the context strip should slide up at the bottom of the deck showing Discord shortcuts
7. Tap a shortcut tile — verify the keystroke fires on the desktop
8. Switch to an unknown app — strip should slide away
9. Switch back to Discord — strip should reappear instantly (loaded from cache, no LLM call)

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: context-aware deck — active window detection and LLM shortcut generation"
```
