# Multimedia Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Media tab to KDeck mobile that shows per-app desktop audio sessions with circular ring volume meters, controlled via hardware volume buttons.

**Architecture:** Desktop agent polls Windows WASAPI (`node-audio-volume-mixer`) every 300ms and pushes `MEDIA_STATE` over the existing WebSocket. Mobile intercepts hardware volume buttons (`react-native-volume-manager`) when a session is active and sends `MEDIA_VOLUME_DELTA`. macOS degrades to single system-volume session via `osascript`.

**Tech Stack:** `node-audio-volume-mixer` (native addon, agent), `react-native-volume-manager` (mobile), NestJS `MediaService`, React Native SVG arc rings via `Animated`.

---

## File Map

**Create:**
- `apps/agent/src/media/media.service.ts` — poll loop, diff, WASAPI/macOS control
- `apps/agent/src/media/media.module.ts` — NestJS module
- `apps/mobile/src/hooks/useVolumeButtons.ts` — hardware button interception
- `apps/mobile/src/components/MediaAppCard.tsx` — compact card + SVG ring
- `apps/mobile/src/components/MediaHeroCard.tsx` — large featured card + animated ring
- `apps/mobile/src/screens/MediaTab.tsx` — paged list + hero + pin picker

**Modify:**
- `packages/shared/src/schema.ts` — add `MediaSession` + 5 message types, update union types
- `apps/mobile/src/types/schema.ts` — mirror new types (mobile maintains its own copy)
- `apps/agent/src/app.module.ts` — import `MediaModule`
- `apps/agent/src/websocket/ws.gateway.ts` — add `broadcastMediaState` + 4 message handlers
- `apps/mobile/src/services/websocket.service.ts` — add `onMediaState` + 4 send methods
- `apps/mobile/src/screens/DeckScreen.tsx` — add `'media'` tab, subscribe `onMediaState`, pass `ws` to `MediaTab`

---

## Task 1: Install dependencies

**Files:**
- Modify: `apps/agent/package.json`
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Install agent native addon**

```bash
cd apps/agent
npm install node-audio-volume-mixer
```

Expected: `node-audio-volume-mixer` appears in `dependencies`.

- [ ] **Step 2: Add electron-rebuild to agent devDependencies**

```bash
cd apps/agent
npm install --save-dev @electron/rebuild
```

- [ ] **Step 3: Add postinstall script to rebuild native addon for Electron**

In `apps/agent/package.json`, add to `"scripts"`:
```json
"postinstall": "electron-rebuild -f -w node-audio-volume-mixer"
```

Then run it once manually:
```bash
cd apps/agent
npx @electron/rebuild -f -w node-audio-volume-mixer
```

Expected: `.node` file compiled successfully in `node_modules/node-audio-volume-mixer`.

- [ ] **Step 4: Install mobile volume manager**

```bash
cd apps/mobile
npm install react-native-volume-manager
```

- [ ] **Step 5: Rebuild native mobile modules**

```bash
cd apps/mobile
npx expo run:android   # or: npx expo run:ios
```

Expected: Build succeeds with `react-native-volume-manager` linked.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/package.json apps/agent/package-lock.json apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "feat(deps): add node-audio-volume-mixer and react-native-volume-manager"
```

---

## Task 2: Shared schema — new message types

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Modify: `apps/mobile/src/types/schema.ts`

- [ ] **Step 1: Add types to `packages/shared/src/schema.ts`**

Add after the existing `MouseScrollMessage` interface and before the `AgentMessage` union:

```ts
// --- Media / Audio Session messages ---

export interface MediaSession {
  processName: string;   // e.g. "Spotify.exe" / "Discord.exe" / "system"
  label: string;         // Display name (processName with .exe stripped)
  iconBase64?: string;
  volume: number;        // 0–1
  muted: boolean;
  pinned: boolean;
}

// Agent → Mobile
export interface MediaStateMessage {
  type: 'MEDIA_STATE';
  sessions: MediaSession[];
  platform: 'win32' | 'darwin';
}

// Mobile → Agent
export interface MediaVolumeDeltaMessage {
  type: 'MEDIA_VOLUME_DELTA';
  processName: string;
  delta: number;         // ±0.05 typical
}

export interface MediaSetMuteMessage {
  type: 'MEDIA_SET_MUTE';
  processName: string;
  muted: boolean;
}

export interface MediaBringToFrontMessage {
  type: 'MEDIA_BRING_TO_FRONT';
  processName: string;
}

export interface MediaPinAppMessage {
  type: 'MEDIA_PIN_APP';
  processName: string;
  label: string;
  pinned: boolean;
}
```

- [ ] **Step 2: Update `AgentMessage` union in `packages/shared/src/schema.ts`**

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
  | ContextProfilesMessage
  | PackRegistryMessage
  | MediaStateMessage;
```

- [ ] **Step 3: Update `MobileMessage` union in `packages/shared/src/schema.ts`**

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
  | GetContextProfilesMessage
  | MouseMoveMessage
  | MouseClickMessage
  | MouseScrollMessage
  | MediaVolumeDeltaMessage
  | MediaSetMuteMessage
  | MediaBringToFrontMessage
  | MediaPinAppMessage;
```

- [ ] **Step 4: Mirror new types in `apps/mobile/src/types/schema.ts`**

The mobile app maintains its own copy of the schema. Add the same block from Step 1 to the end of `apps/mobile/src/types/schema.ts`, then update its `AgentMessage` and `MobileMessage` unions to match Steps 2 and 3.

- [ ] **Step 5: Build shared package to verify no type errors**

```bash
cd packages/shared
npx tsc --noEmit
```

Expected: exits 0 with no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schema.ts apps/mobile/src/types/schema.ts
git commit -m "feat(shared): add MediaSession and media control message types"
```

---

## Task 3: MediaService — agent audio polling

**Files:**
- Create: `apps/agent/src/media/media.service.ts`

- [ ] **Step 1: Write failing unit test**

Create `apps/agent/src/media/media.service.spec.ts`:

```ts
import { MediaService } from './media.service';

// Mock node-audio-volume-mixer
jest.mock('node-audio-volume-mixer', () => ({
  getAudioSessions: jest.fn(() => [
    { pid: 1, name: 'Spotify.exe', volume: 0.7, muted: false },
    { pid: 2, name: 'Discord.exe', volume: 0.5, muted: false },
  ]),
  setAudioSessionVolume: jest.fn(),
  setAudioSessionMuted: jest.fn(),
}), { virtual: true });

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(() => {
    service = new MediaService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('builds media state with live sessions', async () => {
    const state = await (service as any).getSessions();
    expect(state).toHaveLength(2);
    expect(state[0].name).toBe('Spotify.exe');
  });

  it('buildMediaState strips .exe from label', async () => {
    const sessions = await (service as any).getSessions();
    const state = (service as any).buildMediaState(sessions);
    expect(state[0].label).toBe('Spotify');
  });

  it('adjustVolume clamps to 0-1', () => {
    jest.spyOn(service as any, 'getSessions');
    (service as any).prevSnapshot = [{ pid: 1, name: 'Spotify.exe', volume: 0.95, muted: false }];
    const audioMixer = require('node-audio-volume-mixer');
    service.adjustVolume('Spotify.exe', 0.5); // would exceed 1.0
    expect(audioMixer.setAudioSessionVolume).toHaveBeenCalledWith(1, 1.0);
  });

  it('adjustVolume clamps to minimum 0', () => {
    (service as any).prevSnapshot = [{ pid: 1, name: 'Spotify.exe', volume: 0.02, muted: false }];
    const audioMixer = require('node-audio-volume-mixer');
    service.adjustVolume('Spotify.exe', -0.5);
    expect(audioMixer.setAudioSessionVolume).toHaveBeenCalledWith(1, 0);
  });

  it('pinned apps not currently playing appear in state at volume 0', () => {
    (service as any).config.pinnedMediaApps = [
      { processName: 'vlc.exe', label: 'VLC' },
    ];
    const state = (service as any).buildMediaState([]);
    expect(state).toHaveLength(1);
    expect(state[0].processName).toBe('vlc.exe');
    expect(state[0].volume).toBe(0);
    expect(state[0].pinned).toBe(true);
  });

  it('hasChanged returns false for identical snapshots', () => {
    const snap = [{ pid: 1, name: 'Spotify.exe', volume: 0.7, muted: false }];
    (service as any).prevSnapshot = snap;
    expect((service as any).hasChanged(snap)).toBe(false);
  });

  it('hasChanged returns true when volume changes', () => {
    (service as any).prevSnapshot = [{ pid: 1, name: 'Spotify.exe', volume: 0.7, muted: false }];
    expect((service as any).hasChanged([{ pid: 1, name: 'Spotify.exe', volume: 0.8, muted: false }])).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/agent
npx jest src/media/media.service.spec.ts --no-coverage
```

Expected: FAIL — `MediaService` does not exist yet.

- [ ] **Step 3: Create `apps/agent/src/media/media.service.ts`**

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { platform } from 'os';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { MediaSession } from '@control-surface/shared';

interface AudioSession {
  pid: number;
  name: string;
  volume: number;
  muted: boolean;
}

interface MediaConfig {
  pinnedMediaApps: Array<{ processName: string; label: string }>;
}

@Injectable()
export class MediaService implements OnModuleInit, OnModuleDestroy {
  private pollInterval: NodeJS.Timeout | null = null;
  prevSnapshot: AudioSession[] = [];
  config: MediaConfig = { pinnedMediaApps: [] };
  private readonly configPath: string;
  private broadcastFn: ((sessions: MediaSession[], plt: 'win32' | 'darwin') => void) | null = null;

  constructor() {
    this.configPath = path.join(
      process.env.USER_DATA_PATH ?? path.join(__dirname, '../../'),
      'media.config.json',
    );
    this.loadConfig();
  }

  setBroadcastFn(fn: (sessions: MediaSession[], plt: 'win32' | 'darwin') => void): void {
    this.broadcastFn = fn;
  }

  onModuleInit(): void {
    this.pollInterval = setInterval(() => void this.tick(), 300);
  }

  onModuleDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private loadConfig(): void {
    if (fs.existsSync(this.configPath)) {
      try {
        this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8')) as MediaConfig;
      } catch {
        this.config = { pinnedMediaApps: [] };
      }
    }
  }

  private persistConfig(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[MediaService] persist failed:', e);
    }
  }

  private async tick(): Promise<void> {
    try {
      const sessions = await this.getSessions();
      if (this.hasChanged(sessions)) {
        this.prevSnapshot = sessions;
        const mediaState = this.buildMediaState(sessions);
        this.broadcastFn?.(mediaState, platform() as 'win32' | 'darwin');
      }
    } catch (e) {
      console.error('[MediaService] poll error:', e);
      this.broadcastFn?.([], platform() as 'win32' | 'darwin');
    }
  }

  async getSessions(): Promise<AudioSession[]> {
    if (platform() === 'win32') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const audioMixer = require('node-audio-volume-mixer') as {
        getAudioSessions: () => AudioSession[];
      };
      return audioMixer.getAudioSessions();
    }
    // macOS: single synthetic system session
    const vol = this.getMacSystemVolume();
    return [{ pid: 0, name: 'system', volume: vol, muted: false }];
  }

  private getMacSystemVolume(): number {
    try {
      const out = execSync(`osascript -e 'output volume of (get volume settings)'`, { encoding: 'utf-8' }).trim();
      return Number(out) / 100;
    } catch {
      return 0;
    }
  }

  hasChanged(next: AudioSession[]): boolean {
    if (next.length !== this.prevSnapshot.length) return true;
    for (let i = 0; i < next.length; i++) {
      const a = next[i], b = this.prevSnapshot[i];
      if (!b || a.pid !== b.pid || Math.abs(a.volume - b.volume) > 0.001 || a.muted !== b.muted) return true;
    }
    return false;
  }

  buildMediaState(sessions: AudioSession[]): MediaSession[] {
    const liveKeys = new Set(sessions.map(s => s.name.toLowerCase()));
    const result: MediaSession[] = sessions.map(s => ({
      processName: s.name,
      label: s.name.replace(/\.exe$/i, ''),
      volume: s.volume,
      muted: s.muted,
      pinned: this.config.pinnedMediaApps.some(
        p => p.processName.toLowerCase() === s.name.toLowerCase(),
      ),
    }));
    // Pinned apps not currently producing audio
    for (const p of this.config.pinnedMediaApps) {
      if (!liveKeys.has(p.processName.toLowerCase())) {
        result.push({ processName: p.processName, label: p.label, volume: 0, muted: false, pinned: true });
      }
    }
    return result;
  }

  adjustVolume(processName: string, delta: number): void {
    const session = this.prevSnapshot.find(s => s.name.toLowerCase() === processName.toLowerCase());
    const current = session?.volume ?? 0;
    const newVol = Math.max(0, Math.min(1, current + delta));
    if (platform() === 'win32') {
      if (!session) return;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const audioMixer = require('node-audio-volume-mixer') as {
        setAudioSessionVolume: (pid: number, vol: number) => void;
      };
      audioMixer.setAudioSessionVolume(session.pid, newVol);
    } else {
      try { execSync(`osascript -e 'set volume output volume ${Math.round(newVol * 100)}'`); } catch {}
    }
  }

  setMute(processName: string, muted: boolean): void {
    const session = this.prevSnapshot.find(s => s.name.toLowerCase() === processName.toLowerCase());
    if (platform() === 'win32') {
      if (!session) return;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const audioMixer = require('node-audio-volume-mixer') as {
        setAudioSessionMuted: (pid: number, muted: boolean) => void;
      };
      audioMixer.setAudioSessionMuted(session.pid, muted);
    } else {
      try { execSync(`osascript -e 'set volume ${muted ? 'with' : 'without'} output muted'`); } catch {}
    }
  }

  bringToFront(processName: string): void {
    const name = processName.replace(/\.exe$/i, '');
    if (platform() === 'win32') {
      try {
        execSync(`powershell -command "(New-Object -ComObject WScript.Shell).AppActivate('${name}')"`, { timeout: 3000 });
      } catch {}
    } else {
      try {
        execSync(`osascript -e 'tell application "${name}" to activate'`, { timeout: 3000 });
      } catch {}
    }
  }

  pinApp(processName: string, label: string, pinned: boolean): void {
    if (pinned) {
      if (!this.config.pinnedMediaApps.some(p => p.processName === processName)) {
        this.config.pinnedMediaApps.push({ processName, label });
      }
    } else {
      this.config.pinnedMediaApps = this.config.pinnedMediaApps.filter(p => p.processName !== processName);
    }
    this.persistConfig();
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/agent
npx jest src/media/media.service.spec.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/media/media.service.ts apps/agent/src/media/media.service.spec.ts
git commit -m "feat(agent): add MediaService with WASAPI polling and macOS fallback"
```

---

## Task 4: MediaModule + AppModule registration

**Files:**
- Create: `apps/agent/src/media/media.module.ts`
- Modify: `apps/agent/src/app.module.ts`

- [ ] **Step 1: Create `apps/agent/src/media/media.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { MediaService } from './media.service';

@Module({
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
```

- [ ] **Step 2: Register `MediaModule` in `apps/agent/src/app.module.ts`**

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
import { MouseModule } from './mouse/mouse.module';
import { PackRegistryService } from './packs/pack-registry.service';
import { MediaModule } from './media/media.module';

@Module({
  imports: [LicenseModule, NetworkModule, ContextModule, MouseModule, MediaModule],
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

- [ ] **Step 3: Build to confirm no errors**

```bash
cd apps/agent
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/media/media.module.ts apps/agent/src/app.module.ts
git commit -m "feat(agent): register MediaModule in AppModule"
```

---

## Task 5: WsGateway — broadcastMediaState + 4 message handlers

**Files:**
- Modify: `apps/agent/src/websocket/ws.gateway.ts`

- [ ] **Step 1: Add `MediaService` import and constructor injection to `ws.gateway.ts`**

Add to the imports at the top:
```ts
import { MediaService } from '../media/media.service';
import {
  MediaVolumeDeltaMessage,
  MediaSetMuteMessage,
  MediaBringToFrontMessage,
  MediaPinAppMessage,
  MediaStateMessage,
  MediaSession,
} from '@control-surface/shared';
```

Add `mediaService: MediaService` to the constructor parameters (after `packRegistry`):
```ts
constructor(
  private readonly commandService: CommandService,
  private readonly appRegistry: AppRegistryService,
  private readonly appSearch: AppSearchService,
  private readonly licenseService: LicenseService,
  private readonly activationDialog: ActivationDialogService,
  private readonly activeWindow: ActiveWindowService,
  private readonly contextProfile: ContextProfileService,
  private readonly mouseService: MouseService,
  private readonly packRegistry: PackRegistryService,
  private readonly mediaService: MediaService,
) {
  this.activationDialog.onActivated?.(() => this.broadcastLicenseStatus());
  this.activeWindow.on('appChanged', (processName: string | null) => {
    void this.handleAppChanged(processName);
  });
  this.appRegistry.on('tilesUpdated', () => this.broadcastDeckConfig());
  void this.packRegistry.load();
  this.mediaService.setBroadcastFn((sessions, plt) => this.broadcastMediaState(sessions, plt));
}
```

- [ ] **Step 2: Add `broadcastMediaState` and `sendMediaState` methods**

Add after `sendPackRegistry`:
```ts
private broadcastMediaState(sessions: MediaSession[], plt: 'win32' | 'darwin'): void {
  const msg: MediaStateMessage = { type: 'MEDIA_STATE', sessions, platform: plt };
  const payload = JSON.stringify(msg);
  this.server.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

private sendMediaState(client: WebSocket): void {
  void this.mediaService.getSessions().then((sessions) => {
    const msg: MediaStateMessage = {
      type: 'MEDIA_STATE',
      sessions: this.mediaService.buildMediaState(sessions),
      platform: platform() as 'win32' | 'darwin',
    };
    client.send(JSON.stringify(msg));
  });
}
```

- [ ] **Step 3: Call `sendMediaState` on new connection**

In `handleConnection`, after `this.sendPackRegistry(client)`:
```ts
this.sendMediaState(client);
```

- [ ] **Step 4: Add 4 message handlers inside `client.on('message', ...)`**

Add before the `if (data.type !== 'BUTTON_TAP') return;` line:

```ts
if (data.type === 'MEDIA_VOLUME_DELTA') {
  const d = data as MediaVolumeDeltaMessage;
  this.mediaService.adjustVolume(d.processName, d.delta);
  return;
}

if (data.type === 'MEDIA_SET_MUTE') {
  const d = data as MediaSetMuteMessage;
  this.mediaService.setMute(d.processName, d.muted);
  return;
}

if (data.type === 'MEDIA_BRING_TO_FRONT') {
  const d = data as MediaBringToFrontMessage;
  this.mediaService.bringToFront(d.processName);
  return;
}

if (data.type === 'MEDIA_PIN_APP') {
  const d = data as MediaPinAppMessage;
  this.mediaService.pinApp(d.processName, d.label, d.pinned);
  return;
}
```

- [ ] **Step 5: Build to confirm no errors**

```bash
cd apps/agent
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/websocket/ws.gateway.ts
git commit -m "feat(agent): wire MediaService into WsGateway with broadcast and 4 handlers"
```

---

## Task 6: WebSocketService — mobile additions

**Files:**
- Modify: `apps/mobile/src/services/websocket.service.ts`

- [ ] **Step 1: Add new imports to `websocket.service.ts`**

Add to the existing import from `'../types/schema'`:
```ts
import {
  // ... existing imports ...
  MediaStateMessage,
  MediaVolumeDeltaMessage,
  MediaSetMuteMessage,
  MediaBringToFrontMessage,
  MediaPinAppMessage,
} from '../types/schema';
```

- [ ] **Step 2: Add callback type and array for `MEDIA_STATE`**

After `type PackRegistryCallback = ...`:
```ts
type MediaStateCallback = (msg: MediaStateMessage) => void;
```

After `private packRegistryCallbacks: PackRegistryCallback[] = [];`:
```ts
private mediaStateCallbacks: MediaStateCallback[] = [];
```

- [ ] **Step 3: Handle `MEDIA_STATE` in `onmessage`**

Add after the `'PACK_REGISTRY'` branch in `ws.onmessage`:
```ts
} else if (msg.type === 'MEDIA_STATE') {
  this.mediaStateCallbacks.forEach((cb) => cb(msg));
}
```

- [ ] **Step 4: Add `onMediaState` subscription method**

After `onPackRegistry`:
```ts
onMediaState(cb: MediaStateCallback): () => void {
  this.mediaStateCallbacks.push(cb);
  return () => {
    this.mediaStateCallbacks = this.mediaStateCallbacks.filter((c) => c !== cb);
  };
}
```

- [ ] **Step 5: Add 4 send methods**

After `scrollMouse`:
```ts
sendMediaVolumeDelta(processName: string, delta: number): void {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
  const msg: MediaVolumeDeltaMessage = { type: 'MEDIA_VOLUME_DELTA', processName, delta };
  this.ws.send(JSON.stringify(msg));
}

sendMediaSetMute(processName: string, muted: boolean): void {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
  const msg: MediaSetMuteMessage = { type: 'MEDIA_SET_MUTE', processName, muted };
  this.ws.send(JSON.stringify(msg));
}

sendMediaBringToFront(processName: string): void {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
  const msg: MediaBringToFrontMessage = { type: 'MEDIA_BRING_TO_FRONT', processName };
  this.ws.send(JSON.stringify(msg));
}

sendMediaPinApp(processName: string, label: string, pinned: boolean): void {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
  const msg: MediaPinAppMessage = { type: 'MEDIA_PIN_APP', processName, label, pinned };
  this.ws.send(JSON.stringify(msg));
}
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/services/websocket.service.ts
git commit -m "feat(mobile): add onMediaState and media send methods to WebSocketService"
```

---

## Task 7: `useVolumeButtons` hook

**Files:**
- Create: `apps/mobile/src/hooks/useVolumeButtons.ts`

- [ ] **Step 1: Write failing unit test**

Create `apps/mobile/src/hooks/useVolumeButtons.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react-hooks';

// Mock react-native-volume-manager
const mockAddVolumeListener = jest.fn();
const mockRemoveListener = jest.fn();
const mockShowNativeVolumeUI = jest.fn();
const mockSetVolume = jest.fn();

jest.mock('react-native-volume-manager', () => ({
  __esModule: true,
  default: {
    addVolumeListener: mockAddVolumeListener.mockReturnValue({ remove: mockRemoveListener }),
    showNativeVolumeUI: mockShowNativeVolumeUI,
    setVolume: mockSetVolume,
  },
}));

import { useVolumeButtons } from './useVolumeButtons';

describe('useVolumeButtons', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not register listener when disabled', () => {
    renderHook(() => useVolumeButtons({ enabled: false, onDelta: jest.fn() }));
    expect(mockAddVolumeListener).not.toHaveBeenCalled();
  });

  it('registers listener when enabled', () => {
    renderHook(() => useVolumeButtons({ enabled: true, onDelta: jest.fn() }));
    expect(mockAddVolumeListener).toHaveBeenCalled();
    expect(mockShowNativeVolumeUI).toHaveBeenCalledWith({ enabled: false });
  });

  it('calls onDelta(+0.05) when volume increases', () => {
    const onDelta = jest.fn();
    renderHook(() => useVolumeButtons({ enabled: true, onDelta }));
    const listener = mockAddVolumeListener.mock.calls[0][0] as (r: { volume: number }) => void;
    // Simulate vol up from 0.5 neutral
    act(() => listener({ volume: 0.6 }));
    expect(onDelta).toHaveBeenCalledWith(0.05);
  });

  it('calls onDelta(-0.05) when volume decreases', () => {
    const onDelta = jest.fn();
    renderHook(() => useVolumeButtons({ enabled: true, onDelta }));
    const listener = mockAddVolumeListener.mock.calls[0][0] as (r: { volume: number }) => void;
    act(() => listener({ volume: 0.4 }));
    expect(onDelta).toHaveBeenCalledWith(-0.05);
  });

  it('removes listener and restores HUD on cleanup', () => {
    const { unmount } = renderHook(() =>
      useVolumeButtons({ enabled: true, onDelta: jest.fn() }),
    );
    unmount();
    expect(mockRemoveListener).toHaveBeenCalled();
    expect(mockShowNativeVolumeUI).toHaveBeenCalledWith({ enabled: true });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/mobile
npx jest src/hooks/useVolumeButtons.test.ts --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `apps/mobile/src/hooks/useVolumeButtons.ts`**

```ts
import { useEffect, useRef } from 'react';
import VolumeManager from 'react-native-volume-manager';

const NEUTRAL_VOLUME = 0.5;

export function useVolumeButtons(options: {
  enabled: boolean;
  onDelta: (delta: number) => void;
}): void {
  const { enabled, onDelta } = options;
  const onDeltaRef = useRef(onDelta);
  onDeltaRef.current = onDelta;

  useEffect(() => {
    if (!enabled) return;

    VolumeManager.showNativeVolumeUI({ enabled: false });
    void VolumeManager.setVolume(NEUTRAL_VOLUME, { type: 'music' });

    const subscription = VolumeManager.addVolumeListener((result) => {
      const delta = result.volume - NEUTRAL_VOLUME;
      // Reset to neutral so repeated presses always fire a delta
      void VolumeManager.setVolume(NEUTRAL_VOLUME, { type: 'music' });
      if (Math.abs(delta) > 0.01) {
        onDeltaRef.current(delta > 0 ? 0.05 : -0.05);
      }
    });

    return () => {
      subscription.remove();
      VolumeManager.showNativeVolumeUI({ enabled: true });
    };
  }, [enabled]);
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/mobile
npx jest src/hooks/useVolumeButtons.test.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/useVolumeButtons.ts apps/mobile/src/hooks/useVolumeButtons.test.ts
git commit -m "feat(mobile): add useVolumeButtons hook for hardware button interception"
```

---

## Task 8: `MediaAppCard` component

**Files:**
- Create: `apps/mobile/src/components/MediaAppCard.tsx`

- [ ] **Step 1: Create `apps/mobile/src/components/MediaAppCard.tsx`**

```tsx
import React from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  Image,
  StyleSheet,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MediaSession } from '../types/schema';

interface Props {
  session: MediaSession;
  isActive: boolean;
  onTap: (session: MediaSession) => void;
  onLongPress: (session: MediaSession) => void;
}

const RING_SIZE = 36;
const RADIUS = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ringColor(isActive: boolean, muted: boolean): string {
  if (muted) return '#FF4444';
  if (isActive) return '#5B4FE8';
  return '#3A3A5A';
}

export function MediaAppCard({ session, isActive, onTap, onLongPress }: Props) {
  const arc = CIRCUMFERENCE * Math.max(0, Math.min(1, session.volume));
  const gap = CIRCUMFERENCE - arc;

  return (
    <TouchableOpacity
      style={[styles.card, isActive && styles.cardActive, session.muted && styles.cardMuted]}
      onPress={() => onTap(session)}
      onLongPress={() => onLongPress(session)}
      activeOpacity={0.75}
    >
      <View style={styles.ringContainer}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.svg}>
          {/* Track */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke="#2A2040"
            strokeWidth={3}
            fill="none"
          />
          {/* Volume arc */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke={ringColor(isActive, session.muted)}
            strokeWidth={3}
            fill="none"
            strokeDasharray={`${arc} ${gap}`}
            strokeLinecap="round"
            rotation={-90}
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        </Svg>
        {session.iconBase64 ? (
          <Image
            source={{ uri: `data:image/png;base64,${session.iconBase64}` }}
            style={styles.icon}
          />
        ) : (
          <Text style={styles.iconFallback}>🔊</Text>
        )}
      </View>
      <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
        {session.label}
      </Text>
      <Text style={[styles.volume, session.muted && styles.volumeMuted]}>
        {session.muted ? '🔇' : `${Math.round(session.volume * 100)}%`}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    width: 76,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cardActive: {
    backgroundColor: '#1E1030',
    borderColor: '#5B4FE8',
  },
  cardMuted: {
    opacity: 0.55,
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  svg: {
    position: 'absolute',
  },
  icon: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  iconFallback: {
    fontSize: 14,
  },
  label: {
    color: '#888AAA',
    fontSize: 8,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  labelActive: {
    color: '#FFFFFF',
  },
  volume: {
    color: '#555',
    fontSize: 7,
    marginTop: 2,
  },
  volumeMuted: {
    color: '#FF4444',
  },
});
```

- [ ] **Step 2: Install react-native-svg if not already present**

```bash
cd apps/mobile
npx expo install react-native-svg
```

Expected: `react-native-svg` added (or already present — check `package.json` first).

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/MediaAppCard.tsx
git commit -m "feat(mobile): add MediaAppCard component with SVG ring meter"
```

---

## Task 9: `MediaHeroCard` component

**Files:**
- Create: `apps/mobile/src/components/MediaHeroCard.tsx`

- [ ] **Step 1: Create `apps/mobile/src/components/MediaHeroCard.tsx`**

```tsx
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MediaSession } from '../types/schema';

interface Props {
  session: MediaSession | null;
  platform: 'win32' | 'darwin' | null;
}

const RING_SIZE = 72;
const RADIUS = 28;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function MediaHeroCard({ session, platform }: Props) {
  const animVol = useRef(new Animated.Value(session?.volume ?? 0)).current;

  useEffect(() => {
    if (session) {
      Animated.timing(animVol, {
        toValue: session.volume,
        duration: 120,
        useNativeDriver: false,
      }).start();
    }
  }, [session?.volume, animVol]);

  if (!session) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Tap an app below to control its volume</Text>
      </View>
    );
  }

  const arc = animVol.interpolate({
    inputRange: [0, 1],
    outputRange: [0, CIRCUMFERENCE],
  });

  const strokeColor = session.muted ? '#FF4444' : '#5B4FE8';

  return (
    <View style={styles.card}>
      <View style={styles.ringContainer}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.svg}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke="#2A2040"
            strokeWidth={5}
            fill="none"
          />
        </Svg>
        {/* Animated arc rendered via JS-driven Animated — use a static arc updated on value change */}
        <AnimatedArc volume={session.volume} muted={session.muted} />
        <View style={styles.iconWrapper}>
          {session.iconBase64 ? (
            <Image
              source={{ uri: `data:image/png;base64,${session.iconBase64}` }}
              style={styles.icon}
            />
          ) : (
            <Text style={styles.iconFallback}>🔊</Text>
          )}
        </View>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{session.label}</Text>
        <Text style={[styles.volume, session.muted && styles.volumeMuted]}>
          {session.muted ? '🔇 Muted' : `${Math.round(session.volume * 100)}%`}
        </Text>
        {!session.muted && (
          <Text style={styles.hint}>vol buttons active</Text>
        )}
        {platform === 'darwin' && session.processName === 'system' && (
          <Text style={styles.macNote}>Per-app volume: Windows only</Text>
        )}
      </View>
    </View>
  );
}

// Separate component so SVG re-renders on volume change without full tree re-render
function AnimatedArc({ volume, muted }: { volume: number; muted: boolean }) {
  const arc = CIRCUMFERENCE * Math.max(0, Math.min(1, volume));
  const gap = CIRCUMFERENCE - arc;
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RADIUS}
        stroke={muted ? '#FF4444' : '#5B4FE8'}
        strokeWidth={5}
        fill="none"
        strokeDasharray={`${arc} ${gap}`}
        strokeLinecap="round"
        rotation={-90}
        origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1030',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#5B4FE8',
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 10,
    gap: 16,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    marginHorizontal: 12,
    marginBottom: 10,
  },
  emptyText: {
    color: '#6B6B8A',
    fontSize: 13,
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  svg: {
    position: 'absolute',
  },
  iconWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  iconFallback: {
    fontSize: 24,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  volume: {
    color: '#9B8FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  volumeMuted: {
    color: '#FF4444',
  },
  hint: {
    color: '#555577',
    fontSize: 10,
  },
  macNote: {
    color: '#6B6B8A',
    fontSize: 9,
    marginTop: 2,
  },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/MediaHeroCard.tsx
git commit -m "feat(mobile): add MediaHeroCard component with animated SVG ring"
```

---

## Task 10: `MediaTab` screen

**Files:**
- Create: `apps/mobile/src/screens/MediaTab.tsx`

- [ ] **Step 1: Create `apps/mobile/src/screens/MediaTab.tsx`**

```tsx
import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { MediaSession } from '../types/schema';
import { WebSocketService } from '../services/websocket.service';
import { MediaHeroCard } from '../components/MediaHeroCard';
import { MediaAppCard } from '../components/MediaAppCard';
import { useVolumeButtons } from '../hooks/useVolumeButtons';

interface Props {
  sessions: MediaSession[];
  platform: 'win32' | 'darwin' | null;
  ws: WebSocketService | null;
}

const PAGE_SIZE = 4;

function chunk<T>(arr: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < arr.length; i += size) pages.push(arr.slice(i, i + size));
  return pages;
}

export function MediaTab({ sessions, platform, ws }: Props) {
  const [activeProcessName, setActiveProcessName] = useState<string | null>(null);
  const [localSessions, setLocalSessions] = useState<MediaSession[]>(sessions);
  const [currentPage, setCurrentPage] = useState(0);
  const [actionSession, setActionSession] = useState<MediaSession | null>(null);

  // Keep localSessions in sync with incoming prop, preserving optimistic updates
  React.useEffect(() => {
    setLocalSessions(sessions);
  }, [sessions]);

  const activeSession = localSessions.find(s => s.processName === activeProcessName) ?? null;

  const handleDelta = useCallback((delta: number) => {
    if (!activeProcessName || !ws) return;
    ws.sendMediaVolumeDelta(activeProcessName, delta);
    // Optimistic update
    setLocalSessions(prev =>
      prev.map(s =>
        s.processName === activeProcessName
          ? { ...s, volume: Math.max(0, Math.min(1, s.volume + delta)) }
          : s,
      ),
    );
  }, [activeProcessName, ws]);

  useVolumeButtons({ enabled: !!activeProcessName, onDelta: handleDelta });

  const handleTap = useCallback((session: MediaSession) => {
    if (session.processName === activeProcessName) {
      // Second tap = toggle mute
      const newMuted = !session.muted;
      ws?.sendMediaSetMute(session.processName, newMuted);
      setLocalSessions(prev =>
        prev.map(s => s.processName === session.processName ? { ...s, muted: newMuted } : s),
      );
    } else {
      setActiveProcessName(session.processName);
    }
  }, [activeProcessName, ws]);

  const handleLongPress = useCallback((session: MediaSession) => {
    setActionSession(session);
  }, []);

  const handleBringToFront = () => {
    if (!actionSession) return;
    ws?.sendMediaBringToFront(actionSession.processName);
    setActionSession(null);
  };

  const handleTogglePin = () => {
    if (!actionSession) return;
    ws?.sendMediaPinApp(actionSession.processName, actionSession.label, !actionSession.pinned);
    setActionSession(null);
  };

  // Build pages: all sessions + add-card at end
  const allItems: (MediaSession | 'add')[] = [...localSessions, 'add'];
  const pages = chunk(allItems, PAGE_SIZE);

  const renderPage = ({ item: page }: { item: (MediaSession | 'add')[] }) => (
    <View style={styles.page}>
      {page.map((item, idx) =>
        item === 'add' ? (
          <TouchableOpacity key="add" style={styles.addCard} activeOpacity={0.75}>
            <Text style={styles.addIcon}>＋</Text>
            <Text style={styles.addLabel}>Pin App</Text>
          </TouchableOpacity>
        ) : (
          <MediaAppCard
            key={item.processName}
            session={item}
            isActive={item.processName === activeProcessName}
            onTap={handleTap}
            onLongPress={handleLongPress}
          />
        ),
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Hero card */}
      <MediaHeroCard session={activeSession} platform={platform} />

      {/* Empty state */}
      {localSessions.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No audio sources found</Text>
          <Text style={styles.emptyHint}>Play audio on your desktop to see apps here.</Text>
        </View>
      )}

      {/* Paged row */}
      {localSessions.length > 0 && (
        <>
          <FlatList
            data={pages}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderPage}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const pageWidth = e.nativeEvent.layoutMeasurement.width;
              const offset = e.nativeEvent.contentOffset.x;
              setCurrentPage(Math.round(offset / pageWidth));
            }}
            contentContainerStyle={styles.listContent}
          />
          {/* Pagination dots */}
          {pages.length > 1 && (
            <View style={styles.dots}>
              {pages.map((_, i) => (
                <View key={i} style={[styles.dot, i === currentPage && styles.dotActive]} />
              ))}
            </View>
          )}
        </>
      )}

      {/* Long-press action sheet */}
      <Modal
        visible={actionSession !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSession(null)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{actionSession?.label}</Text>
            <TouchableOpacity style={styles.sheetBtn} onPress={handleTogglePin} activeOpacity={0.75}>
              <Text style={styles.sheetBtnText}>
                {actionSession?.pinned ? 'Unpin App' : 'Pin App'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetBtn} onPress={handleBringToFront} activeOpacity={0.75}>
              <Text style={styles.sheetBtnText}>Bring to Front</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setActionSession(null)} activeOpacity={0.7}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  page: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    width: SCREEN_WIDTH,  // Required for pagingEnabled to snap correctly
  },
  listContent: { paddingVertical: 4 },
  addCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    width: 76,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  addIcon: { color: '#444', fontSize: 18, marginBottom: 4 },
  addLabel: { color: '#444', fontSize: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 8 },
  dot: { width: 5, height: 4, borderRadius: 2, backgroundColor: '#333' },
  dotActive: { width: 14, backgroundColor: '#5B4FE8' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  emptyText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  emptyHint: { color: '#6B6B8A', fontSize: 13, textAlign: 'center' },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 10,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  sheetBtn: {
    backgroundColor: '#5B4FE8',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  sheetBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  sheetCancel: { alignItems: 'center', paddingVertical: 8 },
  sheetCancelText: { color: '#555', fontSize: 14 },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/MediaTab.tsx
git commit -m "feat(mobile): add MediaTab screen with paged list, hero card, and pin sheet"
```

---

## Task 11: Wire up DeckScreen

**Files:**
- Modify: `apps/mobile/src/screens/DeckScreen.tsx`

- [ ] **Step 1: Add `'media'` to `DECK_TABS` in `DeckScreen.tsx`**

Replace the existing `DECK_TABS` definition:
```ts
type DeckTab = 'ai' | 'apps' | 'shortcuts' | 'media';

const DECK_TABS: Array<{ key: DeckTab; label: string }> = [
  { key: 'ai', label: 'AI Tools' },
  { key: 'apps', label: 'Apps' },
  { key: 'shortcuts', label: 'Shortcuts' },
  { key: 'media', label: 'Media' },
];
```

- [ ] **Step 2: Add media state to `DeckScreen`**

After the existing `useState` declarations, add:
```ts
const [mediaSessions, setMediaSessions] = useState<import('../types/schema').MediaSession[]>([]);
const [mediaPlatform, setMediaPlatform] = useState<'win32' | 'darwin' | null>(null);
```

- [ ] **Step 3: Subscribe to `onMediaState` in Effect 2 (WebSocket effect)**

Inside the WebSocket `useEffect` (the one that creates `const ws = new WebSocketService(agentUrl)`), after the `unsubscribePackRegistry` declaration, add:
```ts
const unsubscribeMedia = ws.onMediaState((msg) => {
  setMediaSessions(msg.sessions);
  setMediaPlatform(msg.platform);
});
```

And add it to the cleanup return:
```ts
return () => {
  unsubscribeLicense();
  unsubscribeQuota();
  unsubscribeContext();
  unsubscribePackRegistry();
  unsubscribeMedia();           // ← add this line
  setContextMsg(null);
  ws.disconnect();
  wsRef.current = null;
  setWsService(null);
};
```

- [ ] **Step 4: Import `MediaTab` and add media tab body to render**

Add import at top:
```ts
import { MediaTab } from './MediaTab';
```

In the `tabCounts` memo, add the media count:
```ts
const tabCounts = useMemo(() => {
  const counts: Record<DeckTab, number> = { ai: 0, apps: 0, shortcuts: 0, media: 0 };
  for (const tile of tiles ?? []) {
    if (tile.kind === 'ai') counts.ai += 1;
    else if (tile.kind === 'shortcut') counts.shortcuts += 1;
    else counts.apps += 1;
  }
  counts.media = mediaSessions.length;
  return counts;
}, [tiles, mediaSessions]);
```

Replace the tile grid section — where `tiles === null`, `visibleTiles.length === 0`, and the `ScrollView` are rendered — with a conditional that also handles the media tab:

```tsx
{activeTab === 'media' ? (
  <MediaTab
    sessions={mediaSessions}
    platform={mediaPlatform}
    ws={wsService}
  />
) : tiles === null ? (
  <View style={styles.skeletonGrid}>
    {Array.from({ length: 6 }).map((_, i) => (
      <View key={i} style={styles.skeletonTile} />
    ))}
  </View>
) : visibleTiles.length === 0 ? (
  <View style={styles.emptyState}>
    <Text style={styles.emptyText}>{emptyCopy.title}</Text>
    <Text style={styles.emptyHint}>{emptyCopy.hint}</Text>
  </View>
) : (
  <ScrollView contentContainerStyle={styles.grid}>
    <View style={styles.tileRow}>
      {visibleTiles.map((item) => (
        <View key={item.id} style={styles.tileCell}>
          <AppTile
            tile={item}
            isLoading={item.id === loadingId}
            creditsRemaining={creditsRemaining}
            onTap={handleTap}
            onLongPress={handleRequestTileActions}
          />
        </View>
      ))}
    </View>
  </ScrollView>
)}
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Run the app and manually test**

```bash
cd apps/mobile
npx expo start --dev-client
```

Open the app, connect to the agent, navigate to the **Media** tab. Verify:
- [ ] Media tab appears in the tab bar
- [ ] Sessions from the desktop appear as cards (if audio is playing)
- [ ] Tapping a card shows it in the hero card
- [ ] Hardware volume buttons change the ring meter
- [ ] Second tap on active card mutes it (ring turns red)
- [ ] Long-press shows the action sheet with Pin / Bring to Front

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/DeckScreen.tsx
git commit -m "feat(mobile): add Media tab to DeckScreen wired to MediaService"
```
