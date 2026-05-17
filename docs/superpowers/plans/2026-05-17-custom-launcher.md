# Custom App/Game Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add any installed desktop app or PC game to their deck by searching (Start Menu + Steam + Epic Games) or pasting an exe path — the agent scans the PC, extracts the app icon, and streams results back to the mobile UI.

**Architecture:** Mobile sends `SEARCH_APPS` or `VALIDATE_PATH` over the existing WebSocket. A new NestJS `AppSearchService` uses PowerShell (via `child_process.execSync`) to scan Start Menu `.lnk` files, parse Steam `appmanifest_*.acf` files, parse Epic `.item` manifests, and extract exe icons as base64 PNG. Results flow back as `SEARCH_APPS_RESULT` / `VALIDATE_PATH_RESULT`. Mobile adds a "Games" tab to `AddTileScreen` with a search-then-add flow plus a paste-path fallback.

**Tech Stack:** NestJS `AppSearchService` + PowerShell, new `EXEC` action kind in shared schema, React Native `GamesTab` component.

**Assumes:** The shortcuts plan (`2026-05-17-shortcuts.md`) has been executed — `AddTileScreen` already has a two-tab bar (Apps | Shortcuts) and `ShortcutTab` exists at `apps/mobile/src/screens/ShortcutTab.tsx`. This plan adds a third "Games" tab.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/shared/src/schema.ts` | Modify | Add `EXEC` action, `AppSearchResult`, search/validate message types, `iconBase64` on `TileConfig` |
| `apps/mobile/src/types/schema.ts` | Modify | Mirror shared schema changes |
| `apps/agent/src/app-search/app-search.service.ts` | Create | Start Menu + Steam + Epic scanning, `validatePath`, `extractIcon` |
| `apps/agent/tests/app-search.service.test.ts` | Create | Tests for `validatePath` and `searchApps` |
| `apps/agent/src/command/command.service.ts` | Modify | Add `EXEC` case |
| `apps/agent/src/websocket/ws.gateway.ts` | Modify | Handle `SEARCH_APPS` and `VALIDATE_PATH` messages |
| `apps/agent/src/app.module.ts` | Modify | Register `AppSearchService` |
| `apps/mobile/src/services/websocket.service.ts` | Modify | `searchApps()`, `validatePath()`, result callbacks with cleanup |
| `apps/mobile/src/components/AppTile.tsx` | Modify | Render `iconBase64`, style `custom` kind |
| `apps/mobile/src/screens/GamesTab.tsx` | Create | Search UI + results list + paste-path validation section |
| `apps/mobile/src/screens/AddTileScreen.tsx` | Modify | Add "Games" third tab, accept `ws` prop |
| `apps/mobile/src/screens/DeckScreen.tsx` | Modify | Pass `ws` to `AddTileScreen` |

---

### Task 1: Schema additions

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Modify: `apps/mobile/src/types/schema.ts`

- [ ] **Step 1: Update shared schema**

Replace the full contents of `packages/shared/src/schema.ts`:

```ts
// Mobile → Agent
export interface ButtonTapMessage {
  type: 'BUTTON_TAP';
  buttonId: string;
  action: ButtonAction;
}

export type ButtonAction =
  | { kind: 'AI_CLIPBOARD'; prompt: string; outputMode: 'clipboard' | 'autopaste' | 'viewer' }
  | { kind: 'KEYSTROKE'; keys: string[] }
  | { kind: 'APP_LAUNCH'; appId: string }
  | { kind: 'URL_OPEN'; url: string }
  | { kind: 'CLIPBOARD_WRITE'; text: string }
  | { kind: 'EXEC'; exePath: string };

// Agent → Mobile
export interface ActionResultMessage {
  type: 'ACTION_RESULT';
  buttonId: string;
  success: boolean;
  output?: string;
  error?: string;
}

export interface ConnectedMessage {
  type: 'CONNECTED';
  agentVersion: string;
  platform: 'darwin' | 'win32' | 'linux';
}

export interface TileConfig {
  id: string;
  kind: 'app' | 'url' | 'ai' | 'shortcut' | 'custom';
  label: string;
  iconId: string;
  color?: string;
  iconBase64?: string;
  action: ButtonAction;
}

export interface DeckConfigMessage {
  type: 'DECK_CONFIG';
  tiles: TileConfig[];
}

export interface AddTileMessage {
  type: 'ADD_TILE';
  tile: Omit<TileConfig, 'id'>;
}

export interface RemoveTileMessage {
  type: 'REMOVE_TILE';
  tileId: string;
}

// Custom launcher messages
export interface AppSearchResult {
  name: string;
  exePath: string;          // absolute exe path, OR steam://rungameid/{id}
  source: 'startmenu' | 'steam' | 'epic';
  iconBase64?: string;
}

export interface SearchAppsMessage {
  type: 'SEARCH_APPS';
  query: string;
}

export interface ValidatePathMessage {
  type: 'VALIDATE_PATH';
  exePath: string;
}

export interface SearchAppsResultMessage {
  type: 'SEARCH_APPS_RESULT';
  results: AppSearchResult[];
}

export interface ValidatePathResultMessage {
  type: 'VALIDATE_PATH_RESULT';
  valid: boolean;
  label?: string;
  iconBase64?: string;
  error?: string;
}

export type AgentMessage =
  | ActionResultMessage
  | ConnectedMessage
  | DeckConfigMessage
  | SearchAppsResultMessage
  | ValidatePathResultMessage;

export type MobileMessage =
  | ButtonTapMessage
  | AddTileMessage
  | RemoveTileMessage
  | SearchAppsMessage
  | ValidatePathMessage;
```

- [ ] **Step 2: Mirror the schema in the mobile app**

Replace the full contents of `apps/mobile/src/types/schema.ts` with the identical content from Step 1.

- [ ] **Step 3: Build shared package**

Run: `cd packages/shared && npx tsc --build`
Expected: exits 0 with no errors

- [ ] **Step 4: Commit**

```
git add packages/shared/src/schema.ts apps/mobile/src/types/schema.ts
git commit -m "feat: add EXEC action, AppSearchResult, search/validate messages to schema"
```

---

### Task 2: AppSearchService

**Files:**
- Create: `apps/agent/src/app-search/app-search.service.ts`
- Create: `apps/agent/tests/app-search.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/agent/tests/app-search.service.test.ts`:

```ts
import * as fs from 'fs';
import { execSync } from 'child_process';
import { AppSearchService } from '../src/app-search/app-search.service';

jest.mock('fs');
jest.mock('child_process', () => ({ execSync: jest.fn() }));

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedExecSync = execSync as jest.Mock;

describe('AppSearchService', () => {
  let service: AppSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppSearchService();
  });

  describe('validatePath', () => {
    it('returns valid=false when file does not exist', async () => {
      mockedFs.existsSync.mockReturnValue(false);
      const result = await service.validatePath('C:\\NoSuch\\app.exe');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('returns valid=false for non-exe file', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      const result = await service.validatePath('C:\\Apps\\readme.txt');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Not an executable file');
    });

    it('returns valid=true with label and iconBase64 for existing exe', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedExecSync.mockReturnValue(Buffer.from('FAKEBASE64'));
      const result = await service.validatePath('C:\\Apps\\MyGame.exe');
      expect(result.valid).toBe(true);
      expect(result.label).toBe('MyGame');
      expect(result.iconBase64).toBe('FAKEBASE64');
    });

    it('returns valid=true even when icon extraction throws', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedExecSync.mockImplementation(() => { throw new Error('No icon'); });
      const result = await service.validatePath('C:\\Apps\\MyGame.exe');
      expect(result.valid).toBe(true);
      expect(result.label).toBe('MyGame');
      expect(result.iconBase64).toBeUndefined();
    });
  });

  describe('searchApps', () => {
    it('returns empty array when Start Menu PS returns null and no Steam/Epic dirs exist', async () => {
      mockedExecSync.mockReturnValue(Buffer.from('null'));
      mockedFs.existsSync.mockReturnValue(false);
      const results = await service.searchApps('anything');
      expect(results).toEqual([]);
    });

    it('caps results at 30', async () => {
      mockedExecSync.mockReturnValue(Buffer.from('null'));
      const manifests = Array.from({ length: 35 }, (_, i) => `appmanifest_${i}.acf`);
      mockedFs.existsSync.mockImplementation((p: any) => String(p).includes('steamapps'));
      mockedFs.readdirSync.mockReturnValue(manifests as any);
      mockedFs.readFileSync.mockImplementation((p: any) => {
        const m = String(p).match(/appmanifest_(\d+)\.acf/);
        const id = m?.[1] ?? '0';
        return `"AppState"\n{\n"appid"\t"${id}"\n"name"\t"Game ${id}"\n}\n`;
      });
      const results = await service.searchApps('game');
      expect(results.length).toBeLessThanOrEqual(30);
    });

    it('returns steam results matching the query', async () => {
      mockedExecSync.mockReturnValue(Buffer.from('null'));
      mockedFs.existsSync.mockImplementation((p: any) => String(p).includes('steamapps'));
      mockedFs.readdirSync.mockReturnValue(['appmanifest_570.acf'] as any);
      mockedFs.readFileSync.mockReturnValue(
        '"AppState"\n{\n"appid"\t"570"\n"name"\t"Dota 2"\n}\n'
      );
      const results = await service.searchApps('dota');
      const steam = results.find((r) => r.source === 'steam');
      expect(steam?.name).toBe('Dota 2');
      expect(steam?.exePath).toBe('steam://rungameid/570');
    });

    it('skips steam manifest when name does not match query', async () => {
      mockedExecSync.mockReturnValue(Buffer.from('null'));
      mockedFs.existsSync.mockImplementation((p: any) => String(p).includes('steamapps'));
      mockedFs.readdirSync.mockReturnValue(['appmanifest_1.acf'] as any);
      mockedFs.readFileSync.mockReturnValue(
        '"AppState"\n{\n"appid"\t"1"\n"name"\t"Portal"\n}\n'
      );
      const results = await service.searchApps('dota');
      expect(results).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run to confirm tests fail**

Run: `cd apps/agent && npx jest tests/app-search.service.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../src/app-search/app-search.service'`

- [ ] **Step 3: Create AppSearchService**

Create `apps/agent/src/app-search/app-search.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { AppSearchResult } from '@control-surface/shared';

@Injectable()
export class AppSearchService {
  async searchApps(query: string): Promise<AppSearchResult[]> {
    const q = query.toLowerCase().trim();
    const results: AppSearchResult[] = [];

    try { results.push(...this.searchStartMenu(q)); } catch { /* skip on error */ }
    try { results.push(...this.searchSteam(q)); } catch { /* skip on error */ }
    try { results.push(...this.searchEpic(q)); } catch { /* skip on error */ }

    return results.slice(0, 30);
  }

  private searchStartMenu(query: string): AppSearchResult[] {
    const ps = `
$shell = New-Object -ComObject WScript.Shell
$paths = @([System.Environment]::GetFolderPath('StartMenu') + '\\Programs', 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs')
$out = @()
foreach ($p in $paths) {
  if (Test-Path $p) {
    Get-ChildItem -Path $p -Recurse -Filter '*.lnk' | ForEach-Object {
      try {
        $sc = $shell.CreateShortcut($_.FullName)
        if ($sc.TargetPath -match '\\.exe$' -and (Test-Path $sc.TargetPath)) {
          $out += [PSCustomObject]@{ name = $_.BaseName; exePath = $sc.TargetPath }
        }
      } catch {}
    }
  }
}
if ($out.Count -gt 0) { $out | ConvertTo-Json -Compress } else { 'null' }
`;
    const encoded = Buffer.from(ps, 'utf16le').toString('base64');
    const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 15000 })
      .toString()
      .trim();
    if (!raw || raw === 'null') return [];
    const items = JSON.parse(raw);
    const arr: Array<{ name: string; exePath: string }> = Array.isArray(items) ? items : [items];
    return arr
      .filter((item) => item.name.toLowerCase().includes(query))
      .map((item) => ({ name: item.name, exePath: item.exePath, source: 'startmenu' as const }));
  }

  private searchSteam(query: string): AppSearchResult[] {
    const defaultLib = 'C:\\Program Files (x86)\\Steam\\steamapps';
    const libraryPaths = new Set<string>([defaultLib]);

    const vdfCandidates = [
      path.join(defaultLib, 'libraryfolders.vdf'),
      path.join(homedir(), 'AppData', 'Local', 'Steam', 'steamapps', 'libraryfolders.vdf'),
    ];
    for (const vdfPath of vdfCandidates) {
      if (!fs.existsSync(vdfPath)) continue;
      const content = fs.readFileSync(vdfPath, 'utf-8');
      for (const match of content.matchAll(/"path"\s+"([^"]+)"/g)) {
        libraryPaths.add(path.join(match[1], 'steamapps'));
      }
    }

    const results: AppSearchResult[] = [];
    for (const libPath of libraryPaths) {
      if (!fs.existsSync(libPath)) continue;
      const manifests = fs
        .readdirSync(libPath)
        .filter((f) => /^appmanifest_\d+\.acf$/.test(f));
      for (const manifest of manifests) {
        try {
          const content = fs.readFileSync(path.join(libPath, manifest), 'utf-8');
          const nameMatch = content.match(/"name"\s+"([^"]+)"/);
          const appIdMatch = content.match(/"appid"\s+"(\d+)"/);
          if (!nameMatch || !appIdMatch) continue;
          const name = nameMatch[1];
          if (!name.toLowerCase().includes(query)) continue;
          results.push({
            name,
            exePath: `steam://rungameid/${appIdMatch[1]}`,
            source: 'steam',
          });
        } catch { /* skip malformed acf */ }
      }
    }
    return results;
  }

  private searchEpic(query: string): AppSearchResult[] {
    const manifestDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
    if (!fs.existsSync(manifestDir)) return [];

    const results: AppSearchResult[] = [];
    const files = fs.readdirSync(manifestDir).filter((f) => f.endsWith('.item'));
    for (const file of files) {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(manifestDir, file), 'utf-8'));
        const name: string = manifest.DisplayName ?? '';
        if (!name.toLowerCase().includes(query)) continue;
        const exePath = path.join(
          manifest.InstallLocation ?? '',
          manifest.LaunchExecutable ?? '',
        );
        if (!fs.existsSync(exePath)) continue;
        results.push({ name, exePath, source: 'epic' });
      } catch { /* skip malformed .item */ }
    }
    return results;
  }

  async validatePath(
    exePath: string,
  ): Promise<{ valid: boolean; label?: string; iconBase64?: string; error?: string }> {
    if (!fs.existsSync(exePath)) return { valid: false, error: 'File not found' };
    if (!exePath.toLowerCase().endsWith('.exe')) {
      return { valid: false, error: 'Not an executable file' };
    }
    const label = path.basename(exePath, '.exe');
    let iconBase64: string | undefined;
    try {
      iconBase64 = this.extractIcon(exePath);
    } catch { /* icon is optional */ }
    return { valid: true, label, iconBase64 };
  }

  extractIcon(exePath: string): string {
    const safePath = exePath.replace(/'/g, "''");
    const ps = `
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${safePath}')
$bmp = $icon.ToBitmap()
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
[Convert]::ToBase64String($ms.ToArray())
`;
    const encoded = Buffer.from(ps, 'utf16le').toString('base64');
    return execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 5000 })
      .toString()
      .trim();
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd apps/agent && npx jest tests/app-search.service.test.ts --no-coverage`
Expected: PASS — 8 tests pass

- [ ] **Step 5: Commit**

```
git add apps/agent/src/app-search/app-search.service.ts apps/agent/tests/app-search.service.test.ts
git commit -m "feat: AppSearchService — Start Menu, Steam, Epic scan + validatePath + extractIcon"
```

---

### Task 3: CommandService EXEC + WsGateway handlers + AppModule

**Files:**
- Modify: `apps/agent/src/command/command.service.ts`
- Modify: `apps/agent/src/websocket/ws.gateway.ts`
- Modify: `apps/agent/src/app.module.ts`

- [ ] **Step 1: Write failing EXEC tests**

Add these two tests to the end of the `describe` block in `apps/agent/tests/command.service.test.ts`:

```ts
it('executes EXEC action via shell.openPath', async () => {
  const result = await service.execute({ kind: 'EXEC', exePath: 'C:\\Games\\Game.exe' });
  expect(result.success).toBe(true);
  expect(shell.openPath).toHaveBeenCalledWith('C:\\Games\\Game.exe');
});

it('returns failure when shell.openPath returns error string for EXEC', async () => {
  (shell.openPath as jest.Mock).mockResolvedValue('No such file');
  const result = await service.execute({ kind: 'EXEC', exePath: 'C:\\Bad\\game.exe' });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/Failed to launch/);
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `cd apps/agent && npx jest tests/command.service.test.ts --no-coverage`
Expected: FAIL — 2 new tests fail (EXEC hits the `default: never` branch)

- [ ] **Step 3: Add EXEC case to CommandService**

In `apps/agent/src/command/command.service.ts`, add this case before the `default` case in the `switch`:

```ts
case 'EXEC': {
  const err = await shell.openPath(action.exePath);
  if (err) return { success: false, error: `Failed to launch: ${err}` };
  return { success: true };
}
```

Also add the `shell` import at the top of the file (alongside existing imports):

```ts
import { shell } from 'electron';
```

- [ ] **Step 4: Run command tests to confirm they pass**

Run: `cd apps/agent && npx jest tests/command.service.test.ts --no-coverage`
Expected: PASS — all tests pass (the `default: never` exhaustive check also passes because EXEC is now handled)

- [ ] **Step 5: Update WsGateway**

Full updated `apps/agent/src/websocket/ws.gateway.ts`:

```ts
import { WebSocketGateway, OnGatewayConnection, WebSocketServer } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { platform } from 'os';
import {
  ConnectedMessage,
  MobileMessage,
  ActionResultMessage,
  DeckConfigMessage,
  SearchAppsResultMessage,
  ValidatePathResultMessage,
} from '@control-surface/shared';
import { CommandService } from '../command/command.service';
import { AppRegistryService } from '../app-launch/app-registry.service';
import { AppSearchService } from '../app-search/app-search.service';

@WebSocketGateway()
export class WsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly commandService: CommandService,
    private readonly appRegistry: AppRegistryService,
    private readonly appSearch: AppSearchService,
  ) {}

  private sendDeckConfig(client: WebSocket): void {
    const msg: DeckConfigMessage = {
      type: 'DECK_CONFIG',
      tiles: this.appRegistry.getTiles(),
    };
    client.send(JSON.stringify(msg));
  }

  handleConnection(client: WebSocket): void {
    const connected: ConnectedMessage = {
      type: 'CONNECTED',
      agentVersion: '0.1.0',
      platform: platform() as 'darwin' | 'win32' | 'linux',
    };
    client.send(JSON.stringify(connected));
    this.sendDeckConfig(client);

    console.log('[Agent] Mobile client connected');

    client.on('message', async (raw) => {
      let data: MobileMessage;
      try {
        data = JSON.parse(raw.toString()) as MobileMessage;
      } catch {
        return;
      }

      if (data.type === 'ADD_TILE') {
        this.appRegistry.addTile(data.tile);
        this.sendDeckConfig(client);
        return;
      }

      if (data.type === 'REMOVE_TILE') {
        this.appRegistry.removeTile(data.tileId);
        this.sendDeckConfig(client);
        return;
      }

      if (data.type === 'SEARCH_APPS') {
        const results = await this.appSearch.searchApps(data.query);
        const response: SearchAppsResultMessage = { type: 'SEARCH_APPS_RESULT', results };
        client.send(JSON.stringify(response));
        return;
      }

      if (data.type === 'VALIDATE_PATH') {
        const outcome = await this.appSearch.validatePath(data.exePath);
        const response: ValidatePathResultMessage = { type: 'VALIDATE_PATH_RESULT', ...outcome };
        client.send(JSON.stringify(response));
        return;
      }

      if (data.type !== 'BUTTON_TAP') return;

      console.log(`[Agent] BUTTON_TAP ${data.buttonId} (${data.action.kind})`);
      const result = await this.commandService.execute(data.action);

      if (!result.success) {
        console.error(`[Agent] Action failed: ${result.error}`);
      }

      const response: ActionResultMessage = {
        type: 'ACTION_RESULT',
        buttonId: data.buttonId,
        success: result.success,
        output: result.output,
        error: result.error,
      };
      client.send(JSON.stringify(response));
    });
  }
}
```

- [ ] **Step 6: Register AppSearchService in AppModule**

Replace `apps/agent/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { WsGateway } from './websocket/ws.gateway';
import { ClipboardService } from './clipboard/clipboard.service';
import { AiRouterService } from './ai/ai-router.service';
import { CommandService } from './command/command.service';
import { AppLaunchService } from './app-launch/app-launch.service';
import { AppRegistryService } from './app-launch/app-registry.service';
import { AppSearchService } from './app-search/app-search.service';

@Module({
  providers: [
    WsGateway,
    ClipboardService,
    AiRouterService,
    CommandService,
    AppLaunchService,
    AppRegistryService,
    AppSearchService,
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Run all agent tests**

Run: `cd apps/agent && npx jest --no-coverage`
Expected: PASS — all tests pass (the ws.gateway.test.ts passes because AppSearchService is injected with a mock in the test module)

Note: if `ws.gateway.test.ts` fails due to missing `AppSearchService` in the test module, add a stub to the test:
```ts
const mockSearch = { searchApps: jest.fn().mockResolvedValue([]), validatePath: jest.fn().mockResolvedValue({ valid: true }) };
// In the Test.createTestingModule providers array:
{ provide: AppSearchService, useValue: mockSearch },
```

- [ ] **Step 8: Commit**

```
git add apps/agent/src/command/command.service.ts apps/agent/src/websocket/ws.gateway.ts apps/agent/src/app.module.ts
git commit -m "feat: EXEC action in CommandService, SEARCH_APPS/VALIDATE_PATH in WsGateway"
```

---

### Task 4: Mobile WebSocketService additions

**Files:**
- Modify: `apps/mobile/src/services/websocket.service.ts`

- [ ] **Step 1: Replace websocket.service.ts with the updated version**

Full updated `apps/mobile/src/services/websocket.service.ts`:

```ts
import {
  AgentMessage,
  ButtonAction,
  ButtonTapMessage,
  ActionResultMessage,
  DeckConfigMessage,
  TileConfig,
  AddTileMessage,
  RemoveTileMessage,
  SearchAppsMessage,
  ValidatePathMessage,
  SearchAppsResultMessage,
  ValidatePathResultMessage,
} from '../types/schema';

type Status = 'connecting' | 'connected' | 'disconnected';
type StatusCallback = (status: Status) => void;
type ResultCallback = (msg: ActionResultMessage) => void;
type DeckConfigCallback = (msg: DeckConfigMessage) => void;
type SearchAppsResultCallback = (msg: SearchAppsResultMessage) => void;
type ValidatePathResultCallback = (msg: ValidatePathResultMessage) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private statusCallbacks: StatusCallback[] = [];
  private resultCallbacks: ResultCallback[] = [];
  private deckConfigCallbacks: DeckConfigCallback[] = [];
  private searchAppsCallbacks: SearchAppsResultCallback[] = [];
  private validatePathCallbacks: ValidatePathResultCallback[] = [];

  constructor(private readonly url: string) {
    this.connect();
  }

  private connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.notifyStatus('connecting');
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const msg: AgentMessage = JSON.parse(event.data as string);
      if (msg.type === 'CONNECTED') {
        this.notifyStatus('connected');
      } else if (msg.type === 'ACTION_RESULT') {
        this.resultCallbacks.forEach((cb) => cb(msg));
      } else if (msg.type === 'DECK_CONFIG') {
        this.deckConfigCallbacks.forEach((cb) => cb(msg));
      } else if (msg.type === 'SEARCH_APPS_RESULT') {
        this.searchAppsCallbacks.forEach((cb) => cb(msg));
      } else if (msg.type === 'VALIDATE_PATH_RESULT') {
        this.validatePathCallbacks.forEach((cb) => cb(msg));
      }
    };

    this.ws.onclose = () => {
      this.notifyStatus('disconnected');
    };
  }

  tap(buttonId: string, action: ButtonAction): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: ButtonTapMessage = { type: 'BUTTON_TAP', buttonId, action };
    this.ws.send(JSON.stringify(msg));
  }

  addTile(tile: Omit<TileConfig, 'id'>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: AddTileMessage = { type: 'ADD_TILE', tile };
    this.ws.send(JSON.stringify(msg));
  }

  removeTile(tileId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: RemoveTileMessage = { type: 'REMOVE_TILE', tileId };
    this.ws.send(JSON.stringify(msg));
  }

  searchApps(query: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: SearchAppsMessage = { type: 'SEARCH_APPS', query };
    this.ws.send(JSON.stringify(msg));
  }

  validatePath(exePath: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: ValidatePathMessage = { type: 'VALIDATE_PATH', exePath };
    this.ws.send(JSON.stringify(msg));
  }

  onStatusChange(cb: StatusCallback): void {
    this.statusCallbacks.push(cb);
  }

  onResult(cb: ResultCallback): void {
    this.resultCallbacks.push(cb);
  }

  onDeckConfig(cb: DeckConfigCallback): void {
    this.deckConfigCallbacks.push(cb);
  }

  onSearchAppsResult(cb: SearchAppsResultCallback): () => void {
    this.searchAppsCallbacks.push(cb);
    return () => {
      this.searchAppsCallbacks = this.searchAppsCallbacks.filter((c) => c !== cb);
    };
  }

  onValidatePathResult(cb: ValidatePathResultCallback): () => void {
    this.validatePathCallbacks.push(cb);
    return () => {
      this.validatePathCallbacks = this.validatePathCallbacks.filter((c) => c !== cb);
    };
  }

  reconnect(): void {
    this.disconnect();
    this.notifyStatus('connecting');
    this.connect();
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private notifyStatus(status: Status): void {
    this.statusCallbacks.forEach((cb) => cb(status));
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exits 0

- [ ] **Step 3: Commit**

```
git add apps/mobile/src/services/websocket.service.ts
git commit -m "feat: add searchApps, validatePath, and result callbacks to WebSocketService"
```

---

### Task 5: AppTile — iconBase64 + custom kind

**Files:**
- Modify: `apps/mobile/src/components/AppTile.tsx`

- [ ] **Step 1: Add custom kind to color maps**

In `apps/mobile/src/components/AppTile.tsx`, add `custom` to `TILE_BG` and `BRAND_COLORS`:

```ts
const TILE_BG: Record<string, string> = {
  ai:     '#1A1A2E',
  app:    '#1E1E2E',
  url:    '#0D2B45',
  custom: '#0A2010',   // dark green — custom/game tiles
};

// In BRAND_COLORS add:
  custom: '#2D5A27',
```

- [ ] **Step 2: Wire iconBase64 rendering**

In the `AppTile` function body, replace the variables block and icon badge JSX:

```tsx
const showBase64 = !!tile.iconBase64;
const logoDomain = !showBase64 && tile.kind !== 'ai' && tile.kind !== 'shortcut' && tile.kind !== 'custom'
  ? LOGO_DOMAINS[tile.iconId]
  : undefined;
const logoUri = logoDomain ? `https://logo.clearbit.com/${logoDomain}` : undefined;
const showLogo = !!logoUri && !logoError;

// Icon badge content:
{tile.kind === 'ai' ? (
  <Text style={styles.aiIcon}>✦</Text>
) : tile.kind === 'shortcut' ? (
  <Text style={styles.shortcutIcon}>⌨</Text>
) : showBase64 ? (
  <Image
    source={{ uri: `data:image/png;base64,${tile.iconBase64}` }}
    style={styles.logo}
  />
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
```

Also update the `brandColor` computation to cover `custom`:

```ts
const brandColor =
  tile.kind === 'ai'
    ? (tile.color ?? '#2D1B69')
    : tile.kind === 'shortcut'
    ? '#1A3A1A'
    : (BRAND_COLORS[tile.iconId] ?? BRAND_COLORS[tile.kind] ?? '#3A3A5C');
```

Add the `shortcutIcon` style (if not already present from shortcuts plan):

```ts
shortcutIcon: { color: '#FFFFFF', fontSize: 24, opacity: 0.9 },
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exits 0

- [ ] **Step 4: Commit**

```
git add apps/mobile/src/components/AppTile.tsx
git commit -m "feat: AppTile renders iconBase64 and custom kind with game-green styling"
```

---

### Task 6: GamesTab component

**Files:**
- Create: `apps/mobile/src/screens/GamesTab.tsx`

- [ ] **Step 1: Create GamesTab.tsx**

```tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AppSearchResult, TileConfig } from '../types/schema';
import { WebSocketService } from '../services/websocket.service';

const SOURCE_LABEL: Record<AppSearchResult['source'], string> = {
  startmenu: 'App',
  steam:     'Steam',
  epic:      'Epic',
};

const SOURCE_COLOR: Record<AppSearchResult['source'], string> = {
  startmenu: '#4A4A6A',
  steam:     '#1B2838',
  epic:      '#0060cc',
};

interface Props {
  ws: WebSocketService;
  onAdd: (tile: Omit<TileConfig, 'id'>) => void;
}

export function GamesTab({ ws, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AppSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [pastePath, setPastePath] = useState('');
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{
    valid: boolean;
    label?: string;
    iconBase64?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    const unsub1 = ws.onSearchAppsResult((msg) => {
      setResults(msg.results);
      setSearching(false);
      setSearched(true);
    });
    const unsub2 = ws.onValidatePathResult((msg) => {
      setValidation(msg);
      setValidating(false);
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [ws]);

  const handleSearch = () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    setSearched(false);
    ws.searchApps(query.trim());
  };

  const handleValidate = () => {
    if (!pastePath.trim()) return;
    setValidating(true);
    setValidation(null);
    ws.validatePath(pastePath.trim());
  };

  const handleAddResult = (item: AppSearchResult) => {
    const isProtocol = item.exePath.startsWith('steam://') || item.exePath.startsWith('epic://');
    onAdd({
      kind: 'custom',
      label: item.name,
      iconId: 'custom',
      iconBase64: item.iconBase64,
      action: isProtocol
        ? { kind: 'URL_OPEN', url: item.exePath }
        : { kind: 'EXEC', exePath: item.exePath },
    });
  };

  const handleAddPath = () => {
    if (!validation?.valid || !validation.label) return;
    onAdd({
      kind: 'custom',
      label: validation.label,
      iconId: 'custom',
      iconBase64: validation.iconBase64,
      action: { kind: 'EXEC', exePath: pastePath.trim() },
    });
    setPastePath('');
    setValidation(null);
  };

  return (
    <View style={styles.container}>
      {/* Search section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Search installed apps & games</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="Cyberpunk, Spotify, Slack…"
            placeholderTextColor="#6B6B8A"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity
            style={[styles.btn, !query.trim() && styles.btnDisabled]}
            onPress={handleSearch}
            disabled={!query.trim() || searching}
          >
            {searching ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.btnText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>

        {results.length > 0 && (
          <FlatList
            data={results}
            keyExtractor={(item, i) => `${item.source}-${i}`}
            style={styles.resultsList}
            renderItem={({ item }) => (
              <View style={styles.resultRow}>
                <View style={[styles.sourceBadge, { backgroundColor: SOURCE_COLOR[item.source] }]}>
                  <Text style={styles.sourceBadgeText}>{SOURCE_LABEL[item.source]}</Text>
                </View>
                <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                <TouchableOpacity style={styles.addBtn} onPress={() => handleAddResult(item)}>
                  <Text style={styles.addBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}

        {!searching && searched && results.length === 0 && (
          <Text style={styles.noResults}>No results — try a different name</Text>
        )}
      </View>

      <View style={styles.divider} />

      {/* Paste path section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Or paste an exe path</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="C:\Games\MyGame\game.exe"
            placeholderTextColor="#6B6B8A"
            value={pastePath}
            onChangeText={(t) => { setPastePath(t); setValidation(null); }}
            autoCapitalize="none"
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.btn, !pastePath.trim() && styles.btnDisabled]}
            onPress={handleValidate}
            disabled={!pastePath.trim() || validating}
          >
            {validating ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.btnText}>Check</Text>
            )}
          </TouchableOpacity>
        </View>

        {validation && (
          <View style={styles.validationRow}>
            <Text
              style={[styles.validationText, validation.valid ? styles.validOk : styles.validErr]}
            >
              {validation.valid ? `✓ ${validation.label}` : `✗ ${validation.error}`}
            </Text>
            {validation.valid && (
              <TouchableOpacity style={styles.addBtn} onPress={handleAddPath}>
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { paddingHorizontal: 12, paddingVertical: 10 },
  sectionTitle: {
    color: '#6B6B8A',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  btn: {
    backgroundColor: '#5B4FE8',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  resultsList: { marginTop: 8, maxHeight: 220 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: 8,
  },
  sourceBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  sourceBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  resultName: { flex: 1, color: '#CCC', fontSize: 13 },
  addBtn: {
    backgroundColor: '#5B4FE8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  noResults: { color: '#6B6B8A', textAlign: 'center', marginTop: 16, fontSize: 13 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 12 },
  validationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  validationText: { flex: 1, fontSize: 13 },
  validOk: { color: '#4CAF50' },
  validErr: { color: '#F44336' },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exits 0

- [ ] **Step 3: Commit**

```
git add apps/mobile/src/screens/GamesTab.tsx
git commit -m "feat: GamesTab — search results + paste-path validation UI"
```

---

### Task 7: Wire GamesTab into AddTileScreen + DeckScreen

**Files:**
- Modify: `apps/mobile/src/screens/AddTileScreen.tsx`
- Modify: `apps/mobile/src/screens/DeckScreen.tsx`

**Context:** After the shortcuts plan, `AddTileScreen` has a two-tab bar (`Tab = 'apps' | 'shortcut'`) and renders `AppsTab` and `ShortcutTab`. This task adds the third "Games" tab.

- [ ] **Step 1: Add ws prop and Games tab to AddTileScreen**

In `apps/mobile/src/screens/AddTileScreen.tsx`:

**a) Add import:**
```ts
import { WebSocketService } from '../services/websocket.service';
import { GamesTab } from './GamesTab';
```

**b) Extend the Tab type:**
```ts
type Tab = 'apps' | 'shortcut' | 'games';
```

**c) Add `ws` to the Props interface:**
```ts
interface Props {
  currentTiles: TileConfig[];
  onAdd: (tile: Omit<TileConfig, 'id'>) => void;
  onRemove: (tileId: string) => void;
  onDismiss: () => void;
  ws: WebSocketService;
}
```

**d) Destructure `ws` in the component function:**
```ts
export function AddTileScreen({ currentTiles, onAdd, onRemove, onDismiss, ws }: Props) {
```

**e) Add the Games tab button to the tab bar** (next to the existing Shortcuts button):
```tsx
<TouchableOpacity
  style={[styles.tab, activeTab === 'games' && styles.tabActive]}
  onPress={() => setActiveTab('games')}
>
  <Text style={[styles.tabText, activeTab === 'games' && styles.tabTextActive]}>
    Games
  </Text>
</TouchableOpacity>
```

**f) Add the GamesTab render** (after the ShortcutTab block):
```tsx
{activeTab === 'games' && <GamesTab ws={ws} onAdd={onAdd} />}
```

- [ ] **Step 2: Pass ws to AddTileScreen in DeckScreen**

In `apps/mobile/src/screens/DeckScreen.tsx`, update the `AddTileScreen` usage inside the `Modal`:

```tsx
<AddTileScreen
  currentTiles={tiles ?? []}
  onAdd={handleAddTile}
  onRemove={handleRemoveTile}
  onDismiss={() => setShowAddTile(false)}
  ws={wsRef.current!}
/>
```

Note: `wsRef.current!` is safe here because the FAB button (which opens the modal) is only shown after the WebSocket service is created in the `useEffect`, and the ref is set before any user interaction is possible.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exits 0

- [ ] **Step 4: Commit**

```
git add apps/mobile/src/screens/AddTileScreen.tsx apps/mobile/src/screens/DeckScreen.tsx
git commit -m "feat: Games tab in AddTileScreen — search + paste-path launcher"
```

---

### Task 8: Full build verification

**Files:** No changes — verify everything compiles and tests pass.

- [ ] **Step 1: Build shared package**

Run: `cd packages/shared && npx tsc --build`
Expected: exits 0

- [ ] **Step 2: Run all agent tests**

Run: `cd apps/agent && npx jest --no-coverage`
Expected: PASS — all tests pass

- [ ] **Step 3: Type-check mobile app**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exits 0

- [ ] **Step 4: Final commit if any fixups were needed**

```
git add -p
git commit -m "fix: build verification fixups for custom launcher"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| Search Start Menu apps | Task 2 (`searchStartMenu`) |
| Search Steam games (protocol launch via `steam://`) | Task 2 (`searchSteam`) |
| Search Epic games (exe launch) | Task 2 (`searchEpic`) |
| Extract exe icon as base64 PNG | Task 2 (`extractIcon`) |
| Paste exe path + validate it exists | Task 2 (`validatePath`), Task 6 |
| Results sent back to mobile | Task 3 (gateway) |
| Mobile search UI with results list | Task 6 (`GamesTab`) |
| Mobile paste-path UI with validation feedback | Task 6 (`GamesTab`) |
| Custom tiles rendered with iconBase64 | Task 5 (`AppTile`) |
| EXEC action launches exe via `shell.openPath` | Task 3 (`CommandService`) |
| Steam games launch via `URL_OPEN` (protocol) | Task 6 (`handleAddResult` logic) |

**Placeholder scan:** None found — all steps contain complete code.

**Type consistency:** `AppSearchResult`, `SearchAppsMessage`, `SearchAppsResultMessage`, `ValidatePathMessage`, `ValidatePathResultMessage` defined once in schema (Task 1) and referenced consistently in Tasks 2–6. `EXEC` action uses `exePath: string` throughout.
