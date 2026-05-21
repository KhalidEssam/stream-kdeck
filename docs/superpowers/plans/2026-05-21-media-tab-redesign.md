# Media Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-WASAPI media tab with a smart mixer: heuristic+blocklist filter on the agent, real exe icons, hero card with drag slider, and a 3-column adaptive grid replacing the paginated layout.

**Architecture:** Agent gains an `IconService` that resolves exe paths + extracts icons via Electron's `app.getFileIcon()` and caches per processName. `MediaService` injects `IconService` to filter sessions and attach icons before broadcast. Mobile replaces the paged `FlatList` with a `numColumns={3}` grid, rewrites `MediaHeroCard` to use a `PanResponder` slider, and rewrites `MediaAppCard` to use a mini progress bar with a letter-avatar fallback.

**Tech Stack:** NestJS (agent), Electron `app.getFileIcon` (icon extraction), React Native `PanResponder` (slider), TypeScript throughout.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/shared/src/schema.ts` | Modify | Add `MediaSetVolumeMessage`, extend `MobileMessage` union |
| `apps/mobile/src/types/schema.ts` | Modify | Mirror same additions (local copy) |
| `apps/agent/src/media/icon.service.ts` | **Create** | Exe path resolution, icon extraction, filter logic, caching |
| `apps/agent/src/media/media.module.ts` | Modify | Register `IconService` as provider |
| `apps/agent/src/media/media.service.ts` | Modify | Inject `IconService`, filter sessions, attach icons, add `setVolume()` |
| `apps/agent/src/media/media.service.spec.ts` | Modify | Tests for filter + setVolume |
| `apps/agent/src/websocket/ws.gateway.ts` | Modify | Handle `MEDIA_SET_VOLUME` message |
| `apps/mobile/src/services/websocket.service.ts` | Modify | Add `sendSetVolume()` |
| `apps/mobile/src/components/MediaAppCard.tsx` | Modify | Mini-bar, letter avatar, pinned-offline state |
| `apps/mobile/src/components/MediaHeroCard.tsx` | Modify | Slider, letter avatar, mute button, new props |
| `apps/mobile/src/screens/MediaTab.tsx` | Modify | 3-col grid, client filter, auto-select, wired handlers |

---

## Task 1: Add `MediaSetVolumeMessage` to shared schema and mobile types

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Modify: `apps/mobile/src/types/schema.ts`

- [ ] **Step 1: Add the interface and extend MobileMessage in shared schema**

In `packages/shared/src/schema.ts`, add after `MediaPinAppMessage` (after line 271) and extend the `MobileMessage` union:

```ts
export interface MediaSetVolumeMessage {
  type: 'MEDIA_SET_VOLUME';
  processName: string;
  volume: number; // 0–1
}
```

Then in the `MobileMessage` union (around line 302–305), add `| MediaSetVolumeMessage` at the end:

```ts
export type MobileMessage =
  // ... existing members ...
  | MediaVolumeDeltaMessage
  | MediaSetMuteMessage
  | MediaBringToFrontMessage
  | MediaPinAppMessage
  | MediaSetVolumeMessage;
```

- [ ] **Step 2: Mirror in mobile local schema**

In `apps/mobile/src/types/schema.ts`, add after `MediaPinAppMessage` (after line 282):

```ts
export interface MediaSetVolumeMessage {
  type: 'MEDIA_SET_VOLUME';
  processName: string;
  volume: number; // 0–1
}
```

Extend the `MobileMessage` union (line 301–304):

```ts
export type MobileMessage =
  // ... existing members ...
  | MediaVolumeDeltaMessage
  | MediaSetMuteMessage
  | MediaBringToFrontMessage
  | MediaPinAppMessage
  | MediaSetVolumeMessage;
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schema.ts apps/mobile/src/types/schema.ts
git commit -m "feat(schema): add MediaSetVolumeMessage for absolute volume control"
```

---

## Task 2: Add `setVolume()` to `MediaService` and wire it in the gateway

**Files:**
- Modify: `apps/agent/src/media/media.service.ts`
- Modify: `apps/agent/src/media/media.service.spec.ts`
- Modify: `apps/agent/src/websocket/ws.gateway.ts`

- [ ] **Step 1: Write the failing test**

In `apps/agent/src/media/media.service.spec.ts`, add after the last `it(...)` block (before the closing `}`):

```ts
it('setVolume clamps to 0-1 and calls mixer', () => {
  (service as any).prevSnapshot = [{ pid: 1, name: 'Spotify.exe', volume: 0.5, muted: false }];
  mockSetVolume.mockClear();
  service.setVolume('Spotify.exe', 1.5);
  expect(mockSetVolume).toHaveBeenCalledWith(1, 1.0);
});

it('setVolume does nothing when session not found', () => {
  (service as any).prevSnapshot = [];
  mockSetVolume.mockClear();
  service.setVolume('Unknown.exe', 0.5);
  expect(mockSetVolume).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/agent && npx jest --runInBand media.service.spec.ts
```

Expected: FAIL — `service.setVolume is not a function`

- [ ] **Step 3: Add `setVolume()` to `MediaService`**

In `apps/agent/src/media/media.service.ts`, add after the `adjustVolume()` method (after line 168):

```ts
setVolume(processName: string, volume: number): void {
  const session = this.prevSnapshot.find(s => s.name.toLowerCase() === processName.toLowerCase());
  const clamped = Math.max(0, Math.min(1, volume));
  if (platform() === 'win32') {
    if (!session) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NodeAudioVolumeMixer: mixer } = require('node-audio-volume-mixer') as {
      NodeAudioVolumeMixer: { setAudioSessionVolumeLevelScalar: (pid: number, vol: number) => void };
    };
    mixer.setAudioSessionVolumeLevelScalar(session.pid, clamped);
  } else {
    if (!session && processName !== 'system') return;
    try { execSync(`osascript -e 'set volume output volume ${Math.round(clamped * 100)}'`); } catch {}
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/agent && npx jest --runInBand media.service.spec.ts
```

Expected: all tests PASS

- [ ] **Step 5: Handle `MEDIA_SET_VOLUME` in the gateway**

In `apps/agent/src/websocket/ws.gateway.ts`, locate the block handling `MEDIA_PIN_APP` (around line 228). Add immediately after it:

```ts
if (data.type === 'MEDIA_SET_VOLUME') {
  const d = data as MediaSetVolumeMessage;
  this.mediaService.setVolume(d.processName, d.volume);
  return;
}
```

Also add `MediaSetVolumeMessage` to the import from `@control-surface/shared` at the top of the file (find the existing media message imports and add it).

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/media/media.service.ts apps/agent/src/media/media.service.spec.ts apps/agent/src/websocket/ws.gateway.ts
git commit -m "feat(agent): add setVolume absolute volume control + gateway handler"
```

---

## Task 3: Add `sendSetVolume()` to mobile `WebSocketService`

**Files:**
- Modify: `apps/mobile/src/services/websocket.service.ts`

- [ ] **Step 1: Add `sendSetVolume()` after `sendMediaPinApp()`**

In `apps/mobile/src/services/websocket.service.ts`, add after `sendMediaPinApp()` (after line 251):

```ts
sendSetVolume(processName: string, volume: number): void {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
  const msg: MediaSetVolumeMessage = { type: 'MEDIA_SET_VOLUME', processName, volume };
  this.ws.send(JSON.stringify(msg));
}
```

Make sure `MediaSetVolumeMessage` is imported from `../types/schema`.

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/services/websocket.service.ts
git commit -m "feat(mobile): add sendSetVolume to WebSocketService"
```

---

## Task 4: Create `IconService`

**Files:**
- Create: `apps/agent/src/media/icon.service.ts`

- [ ] **Step 1: Write the file**

Create `apps/agent/src/media/icon.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { platform } from 'os';
import { execSync } from 'child_process';

const BLOCKED_PROCESS_NAMES = [
  'audiodg',
  'rtkuwp',
  'svchost',
  'rundll32',
  'conhost',
  'qemu-system',
  'vmware-vmx',
  'vboxheadless',
  'wlanext',
];

@Injectable()
export class IconService {
  private readonly exePathCache = new Map<string, string | undefined>();
  private readonly iconCache = new Map<string, string | undefined>();

  async shouldInclude(pid: number, processName: string): Promise<boolean> {
    if (platform() !== 'win32') return true;
    const base = processName.replace(/\.exe$/i, '').toLowerCase();
    if (BLOCKED_PROCESS_NAMES.some(b => base.startsWith(b))) return false;
    const exePath = await this.resolveExePath(pid, processName);
    if (!exePath) return false;
    if (exePath.toLowerCase().includes('\\windows\\')) return false;
    return true;
  }

  async getIconBase64(pid: number, processName: string): Promise<string | undefined> {
    if (platform() !== 'win32') return undefined;
    if (this.iconCache.has(processName)) return this.iconCache.get(processName);
    const exePath = await this.resolveExePath(pid, processName);
    if (!exePath) {
      this.iconCache.set(processName, undefined);
      return undefined;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { app } = require('electron') as typeof import('electron');
      const icon = await app.getFileIcon(exePath, { size: 'normal' });
      const b64 = icon.toPNG().toString('base64');
      this.iconCache.set(processName, b64);
      return b64;
    } catch {
      this.iconCache.set(processName, undefined);
      return undefined;
    }
  }

  private async resolveExePath(pid: number, processName: string): Promise<string | undefined> {
    if (this.exePathCache.has(processName)) return this.exePathCache.get(processName);
    try {
      const result = execSync(
        `powershell -command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path"`,
        { encoding: 'utf-8', timeout: 2000 },
      ).trim();
      const exePath = result.length > 0 ? result : undefined;
      this.exePathCache.set(processName, exePath);
      return exePath;
    } catch {
      this.exePathCache.set(processName, undefined);
      return undefined;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent/src/media/icon.service.ts
git commit -m "feat(agent): add IconService — exe path resolution, icon extraction, filter logic"
```

---

## Task 5: Register `IconService` in `media.module.ts`

**Files:**
- Modify: `apps/agent/src/media/media.module.ts`

- [ ] **Step 1: Add IconService to providers and exports**

Replace the entire file content:

```ts
import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { IconService } from './icon.service';

@Module({
  providers: [MediaService, IconService],
  exports: [MediaService, IconService],
})
export class MediaModule {}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent/src/media/media.module.ts
git commit -m "feat(agent): register IconService in MediaModule"
```

---

## Task 6: Integrate filter + icon pipeline into `MediaService`

**Files:**
- Modify: `apps/agent/src/media/media.service.ts`
- Modify: `apps/agent/src/media/media.service.spec.ts`

- [ ] **Step 1: Write the failing filter tests**

In `apps/agent/src/media/media.service.spec.ts`, add mocks for `IconService` at the top of the file, before the existing `jest.mock` call:

```ts
const mockShouldInclude = jest.fn(async () => true);
const mockGetIconBase64 = jest.fn(async () => undefined as string | undefined);
const mockIconService = {
  shouldInclude: mockShouldInclude,
  getIconBase64: mockGetIconBase64,
};
```

Add to the `beforeEach`:
```ts
beforeEach(() => {
  service = new MediaService(mockIconService as any);
  // reset mocks
  mockShouldInclude.mockImplementation(async () => true);
  mockGetIconBase64.mockImplementation(async () => undefined);
});
```

Add new test cases after the existing ones:

```ts
it('getSessions filters out sessions where shouldInclude returns false', async () => {
  mockShouldInclude.mockImplementation(async (_pid: number, name: string) =>
    name !== 'audiodg.exe',
  );
  mockGetAudioSessionProcesses.mockReturnValueOnce([
    { pid: 1, name: 'Spotify.exe' },
    { pid: 2, name: 'audiodg.exe' },
  ]);
  const sessions = await service.getSessions();
  expect(sessions).toHaveLength(1);
  expect(sessions[0].name).toBe('Spotify.exe');
});

it('getSessions attaches iconBase64 from IconService', async () => {
  mockGetIconBase64.mockImplementation(async () => 'abc123');
  const sessions = await service.getSessions();
  expect(sessions[0].iconBase64).toBe('abc123');
});

it('buildMediaState includes iconBase64 in output', () => {
  const input = [{ pid: 1, name: 'Spotify.exe', volume: 0.7, muted: false, iconBase64: 'abc123' }];
  const state = (service as any).buildMediaState(input);
  expect(state[0].iconBase64).toBe('abc123');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/agent && npx jest --runInBand media.service.spec.ts
```

Expected: FAIL — constructor doesn't accept `IconService`

- [ ] **Step 3: Update `MediaService` to inject `IconService` and apply filter + icons**

In `apps/agent/src/media/media.service.ts`:

**a) Add import:**
```ts
import { IconService } from './icon.service';
```

**b) Update the `AudioSession` interface** (add `iconBase64`):
```ts
interface AudioSession {
  pid: number;
  name: string;
  volume: number;
  muted: boolean;
  iconBase64?: string;
}
```

**c) Inject `IconService` via constructor** (replace the existing constructor):
```ts
constructor(private readonly iconService: IconService) {
  this.configPath = path.join(
    process.env.USER_DATA_PATH ?? path.join(__dirname, '../../'),
    'media.config.json',
  );
  this.loadConfig();
}
```

**d) Replace the Windows branch of `getSessions()`** (lines 95–109):
```ts
async getSessions(): Promise<AudioSession[]> {
  if (platform() === 'win32') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NodeAudioVolumeMixer: mixer } = require('node-audio-volume-mixer') as {
      NodeAudioVolumeMixer: {
        getAudioSessionProcesses: () => Array<{ pid: number; name: string }>;
        getAudioSessionVolumeLevelScalar: (pid: number) => number;
        isAudioSessionMuted: (pid: number) => boolean;
      };
    };
    const raw = mixer.getAudioSessionProcesses().map(p => ({
      pid: p.pid,
      name: p.name,
      volume: mixer.getAudioSessionVolumeLevelScalar(p.pid),
      muted: mixer.isAudioSessionMuted(p.pid),
    }));
    const result: AudioSession[] = [];
    for (const s of raw) {
      if (!await this.iconService.shouldInclude(s.pid, s.name)) continue;
      const iconBase64 = await this.iconService.getIconBase64(s.pid, s.name);
      result.push({ ...s, iconBase64 });
    }
    return result;
  }
  const vol = this.getMacSystemVolume();
  return [{ pid: 0, name: 'system', volume: vol, muted: false }];
}
```

**e) Update `buildMediaState()` to pass `iconBase64`** — in the `.map()` call (around line 137), add `iconBase64: s.iconBase64,`:
```ts
const result: MediaSession[] = sessions.map(s => ({
  processName: s.name,
  label: s.name.replace(/\.exe$/i, ''),
  iconBase64: s.iconBase64,
  volume: s.volume,
  muted: s.muted,
  pinned: pinnedMediaApps.some(
    p => p.processName.toLowerCase() === s.name.toLowerCase(),
  ),
}));
```

- [ ] **Step 4: Run all agent tests**

```bash
cd apps/agent && npx jest --runInBand media.service.spec.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/media/media.service.ts apps/agent/src/media/media.service.spec.ts
git commit -m "feat(agent): integrate IconService filter + icon pipeline into MediaService"
```

---

## Task 7: Redesign `MediaAppCard`

**Files:**
- Modify: `apps/mobile/src/components/MediaAppCard.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
import React from 'react';
import { TouchableOpacity, View, Text, Image, StyleSheet } from 'react-native';
import { MediaSession } from '../types/schema';

interface Props {
  session: MediaSession;
  isActive: boolean;
  onTap: (session: MediaSession) => void;
  onLongPress: (session: MediaSession) => void;
}

const AVATAR_PALETTE = ['#5B4FE8', '#E85B7F', '#4FC8E8', '#E8A84F', '#7FE85B', '#B84FE8'];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function AppIcon({ session, size }: { session: MediaSession; size: number }) {
  if (session.iconBase64) {
    return (
      <Image
        source={{ uri: `data:image/png;base64,${session.iconBase64}` }}
        style={{ width: size, height: size, borderRadius: size * 0.25 }}
      />
    );
  }
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size * 0.25, backgroundColor: avatarColor(session.processName) },
      ]}
    >
      <Text style={[styles.avatarLetter, { fontSize: size * 0.45 }]}>
        {session.label.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function MediaAppCard({ session, isActive, onTap, onLongPress }: Props) {
  const isPinnedOffline = session.pinned && session.volume === 0;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isActive && styles.cardActive,
        session.muted && !isPinnedOffline && styles.cardMuted,
        isPinnedOffline && styles.cardPinned,
      ]}
      onPress={() => onTap(session)}
      onLongPress={() => onLongPress(session)}
      activeOpacity={0.75}
    >
      <View style={styles.iconWrap}>
        <AppIcon session={session} size={32} />
      </View>
      <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
        {session.label}
      </Text>
      {isPinnedOffline ? (
        <Text style={styles.pinnedLabel}>📌</Text>
      ) : session.muted ? (
        <Text style={styles.mutedLabel}>🔇</Text>
      ) : (
        <Text style={[styles.volLabel, isActive && styles.volLabelActive]}>
          {Math.round(session.volume * 100)}%
        </Text>
      )}
      {!isPinnedOffline && (
        <View style={styles.miniBar}>
          <View
            style={[
              styles.miniBarFill,
              {
                width: `${Math.round(session.volume * 100)}%`,
                backgroundColor: session.muted ? '#ff444466' : isActive ? '#5B4FE8' : '#3a3a6a',
              },
            ]}
          />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#111120',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1a2e',
    minWidth: 0,
  },
  cardActive: {
    backgroundColor: '#13133a',
    borderColor: '#5B4FE8',
  },
  cardMuted: {
    opacity: 0.5,
    backgroundColor: '#130d0d',
    borderColor: '#1a1010',
  },
  cardPinned: {
    backgroundColor: '#0c0c18',
    borderColor: '#22223a',
    borderStyle: 'dashed',
  },
  iconWrap: {
    marginBottom: 5,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#fff',
    fontWeight: '700',
  },
  label: {
    color: '#888',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
    marginBottom: 2,
  },
  labelActive: { color: '#fff' },
  volLabel: { color: '#555', fontSize: 9, marginBottom: 3 },
  volLabelActive: { color: '#9b8fff' },
  mutedLabel: { fontSize: 9, marginBottom: 3 },
  pinnedLabel: { fontSize: 9, marginBottom: 3, color: '#555' },
  miniBar: {
    width: '100%',
    height: 2,
    backgroundColor: '#1e1e38',
    borderRadius: 1,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 1,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/MediaAppCard.tsx
git commit -m "feat(mobile): redesign MediaAppCard — mini-bar, letter avatar, pinned state"
```

---

## Task 8: Redesign `MediaHeroCard`

**Files:**
- Modify: `apps/mobile/src/components/MediaHeroCard.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
} from 'react-native';
import { MediaSession } from '../types/schema';

interface Props {
  session: MediaSession | null;
  platform: 'win32' | 'darwin' | null;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
}

const AVATAR_PALETTE = ['#5B4FE8', '#E85B7F', '#4FC8E8', '#E8A84F', '#7FE85B', '#B84FE8'];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function AppIcon({ session, size }: { session: MediaSession; size: number }) {
  if (session.iconBase64) {
    return (
      <Image
        source={{ uri: `data:image/png;base64,${session.iconBase64}` }}
        style={{ width: size, height: size, borderRadius: size * 0.22 }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        backgroundColor: avatarColor(session.processName),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.45, fontWeight: '700' }}>
        {session.label.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const THUMB_RADIUS = 7;

export function MediaHeroCard({ session, platform, onVolumeChange, onMuteToggle }: Props) {
  const [sliderWidth, setSliderWidth] = useState(0);
  const sliderWidthRef = useRef(0);

  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        if (sliderWidthRef.current === 0) return;
        onVolumeChange(Math.max(0, Math.min(1, e.nativeEvent.locationX / sliderWidthRef.current)));
      },
      onPanResponderMove: (e) => {
        if (sliderWidthRef.current === 0) return;
        onVolumeChange(Math.max(0, Math.min(1, e.nativeEvent.locationX / sliderWidthRef.current)));
      },
    }),
  [onVolumeChange]);

  if (!session) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Tap an app to control its volume</Text>
      </View>
    );
  }

  const isMuted = session.muted;
  const vol = session.volume;
  const fillPct = `${Math.round(vol * 100)}%`;
  const thumbLeft = Math.max(0, vol * sliderWidth - THUMB_RADIUS);

  return (
    <View style={[styles.card, isMuted && styles.cardMuted]}>
      {/* Top row: icon + name + mute button */}
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, isMuted && styles.iconWrapMuted]}>
          <AppIcon session={session} size={48} />
        </View>
        <View style={styles.meta}>
          <Text style={[styles.name, isMuted && styles.nameMuted]} numberOfLines={1}>
            {session.label}
          </Text>
          <Text style={[styles.status, isMuted && styles.statusMuted]}>
            {isMuted ? 'muted · tap 🔇 to unmute' : 'tap card below to switch'}
          </Text>
          {platform === 'darwin' && session.processName === 'system' && (
            <Text style={styles.macNote}>Per-app volume: Windows only</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.muteBtn, isMuted && styles.muteBtnActive]}
          onPress={onMuteToggle}
          activeOpacity={0.75}
        >
          <Text style={styles.muteIcon}>{isMuted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
      </View>

      {/* Slider row */}
      <View style={[styles.sliderRow, isMuted && styles.sliderRowMuted]}>
        <Text style={styles.sliderEdge}>0</Text>
        <View
          style={styles.sliderTrack}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            sliderWidthRef.current = w;
            setSliderWidth(w);
          }}
          {...panResponder.panHandlers}
        >
          <View
            style={[
              styles.sliderFill,
              { width: fillPct, backgroundColor: isMuted ? '#882222' : '#5B4FE8' },
            ]}
          />
          {sliderWidth > 0 && (
            <View style={[styles.sliderThumb, { left: thumbLeft }]} />
          )}
        </View>
        <Text style={styles.sliderEdge}>100</Text>
        <Text style={[styles.volPct, isMuted && styles.volPctMuted]}>
          {Math.round(vol * 100)}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2e2e50',
    padding: 16,
    marginHorizontal: 12,
    marginBottom: 12,
    gap: 14,
  },
  cardMuted: {
    borderColor: '#441a1a',
    backgroundColor: '#160d0d',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    marginHorizontal: 12,
    marginBottom: 12,
  },
  emptyText: { color: '#6B6B8A', fontSize: 13 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: { flexShrink: 0 },
  iconWrapMuted: { opacity: 0.5 },
  meta: { flex: 1, gap: 2 },
  name: { color: '#fff', fontSize: 15, fontWeight: '700' },
  nameMuted: { color: '#ff6666' },
  status: { color: '#555577', fontSize: 10 },
  statusMuted: { color: '#663333' },
  macNote: { color: '#6B6B8A', fontSize: 9, marginTop: 2 },
  muteBtn: {
    width: 34,
    height: 34,
    backgroundColor: '#1e1e38',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2e2e50',
    flexShrink: 0,
  },
  muteBtnActive: {
    backgroundColor: '#1a0d0d',
    borderColor: '#441a1a',
  },
  muteIcon: { fontSize: 15 },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sliderRowMuted: { opacity: 0.45 },
  sliderEdge: { color: '#444', fontSize: 9, minWidth: 8, textAlign: 'center' },
  sliderTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#1e1e38',
    borderRadius: 3,
    overflow: 'visible',
    position: 'relative',
  },
  sliderFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: 3,
  },
  sliderThumb: {
    position: 'absolute',
    top: -THUMB_RADIUS + 3,
    width: THUMB_RADIUS * 2,
    height: THUMB_RADIUS * 2,
    borderRadius: THUMB_RADIUS,
    backgroundColor: '#fff',
    shadowColor: '#5B4FE8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  volPct: { color: '#5B4FE8', fontSize: 12, fontWeight: '700', minWidth: 32, textAlign: 'right' },
  volPctMuted: { color: '#ff4444' },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/MediaHeroCard.tsx
git commit -m "feat(mobile): redesign MediaHeroCard — PanResponder slider, letter avatar, mute button"
```

---

## Task 9: Redesign `MediaTab` layout

**Files:**
- Modify: `apps/mobile/src/screens/MediaTab.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
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

function isVisible(s: MediaSession): boolean {
  if (s.pinned) return true;
  return s.volume > 0;
}

export function MediaTab({ sessions, platform, ws }: Props) {
  const [activeProcessName, setActiveProcessName] = useState<string | null>(null);
  const [localSessions, setLocalSessions] = useState<MediaSession[]>(sessions);
  const [actionSession, setActionSession] = useState<MediaSession | null>(null);
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setLocalSessions(sessions);
    setActiveProcessName(prev => {
      if (prev && sessions.some(s => s.processName === prev)) return prev;
      return sessions.find(s => s.volume > 0)?.processName ?? null;
    });
  }, [sessions]);

  const visibleSessions = localSessions.filter(isVisible);
  const activeSession = localSessions.find(s => s.processName === activeProcessName) ?? null;
  const activeCount = visibleSessions.filter(s => s.volume > 0).length;

  const handleDelta = useCallback((delta: number) => {
    if (!activeProcessName || !ws) return;
    ws.sendMediaVolumeDelta(activeProcessName, delta);
    setLocalSessions(prev =>
      prev.map(s =>
        s.processName === activeProcessName
          ? { ...s, volume: Math.max(0, Math.min(1, s.volume + delta)) }
          : s,
      ),
    );
  }, [activeProcessName, ws]);

  useVolumeButtons({ enabled: !!activeProcessName, onDelta: handleDelta });

  const handleVolumeChange = useCallback((volume: number) => {
    if (!activeProcessName || !ws) return;
    setLocalSessions(prev =>
      prev.map(s => s.processName === activeProcessName ? { ...s, volume } : s),
    );
    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(() => {
      ws.sendSetVolume(activeProcessName, volume);
    }, 50);
  }, [activeProcessName, ws]);

  const handleMuteToggle = useCallback(() => {
    if (!activeProcessName || !ws) return;
    const session = localSessions.find(s => s.processName === activeProcessName);
    if (!session) return;
    const newMuted = !session.muted;
    ws.sendMediaSetMute(activeProcessName, newMuted);
    setLocalSessions(prev =>
      prev.map(s => s.processName === activeProcessName ? { ...s, muted: newMuted } : s),
    );
  }, [activeProcessName, ws, localSessions]);

  const handleTap = useCallback((session: MediaSession) => {
    if (session.processName !== activeProcessName) {
      setActiveProcessName(session.processName);
    }
  }, [activeProcessName]);

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

  const hasAnySessions = visibleSessions.length > 0;

  return (
    <View style={styles.container}>
      <MediaHeroCard
        session={activeSession}
        platform={platform}
        onVolumeChange={handleVolumeChange}
        onMuteToggle={handleMuteToggle}
      />

      {!hasAnySessions ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎵</Text>
          <Text style={styles.emptyText}>Nothing playing right now</Text>
          <Text style={styles.emptyHint}>Start playing audio in any app and it'll appear here</Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionLabel}>
            ALL SOURCES · {activeCount} ACTIVE
          </Text>
          <FlatList
            data={visibleSessions}
            numColumns={3}
            keyExtractor={(item) => item.processName}
            renderItem={({ item }) => (
              <View style={styles.gridCell}>
                <MediaAppCard
                  session={item}
                  isActive={item.processName === activeProcessName}
                  onTap={handleTap}
                  onLongPress={handleLongPress}
                />
              </View>
            )}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

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
  sectionLabel: {
    color: '#44446a',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginHorizontal: 14,
    marginBottom: 8,
  },
  gridContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    gap: 7,
  },
  row: { gap: 7 },
  gridCell: { flex: 1 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  emptyIcon: { fontSize: 36 },
  emptyText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
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

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/MediaTab.tsx
git commit -m "feat(mobile): redesign MediaTab — 3-col grid, smart filter, auto-select, volume slider wiring"
```

---

## Task 10: Update `DeckScreen` tab badge

**Files:**
- Modify: `apps/mobile/src/screens/DeckScreen.tsx`

- [ ] **Step 1: Find the media tab badge count**

Search for `mediaSessions.length` in `apps/mobile/src/screens/DeckScreen.tsx`. It's used for the tab badge count.

- [ ] **Step 2: Replace with filtered active count**

Find the line that reads something like:
```tsx
{mediaSessions.length > 0 && <Text ...>{mediaSessions.length}</Text>}
```

Replace the count with sessions that have `volume > 0` (i.e., currently making sound):
```tsx
{mediaSessions.filter(s => s.volume > 0).length > 0 && (
  <Text ...>{mediaSessions.filter(s => s.volume > 0).length}</Text>
)}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/DeckScreen.tsx
git commit -m "feat(mobile): media tab badge shows active (volume > 0) session count"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Heuristic filter (no visible window / system path) | Task 4 — `IconService.shouldInclude` |
| Blocklist filter (rtkuwp, audiodg, etc.) | Task 4 — `BLOCKED_PROCESS_NAMES` |
| Real icon from exe via Electron | Task 4 — `app.getFileIcon` |
| Letter avatar fallback | Tasks 7 + 8 |
| Hero card slider | Task 8 |
| Mute button in hero | Task 8 |
| Hardware buttons still work | Task 9 — `useVolumeButtons` preserved |
| 3-col adaptive grid | Task 9 |
| No pagination | Task 9 — `FlatList numColumns={3}` |
| Auto-select first session | Task 9 — `useEffect` sets first `volume > 0` session |
| Pinned-offline state in grid | Task 7 |
| Empty state when nothing playing | Task 9 |
| `MEDIA_SET_VOLUME` message | Tasks 1–3 |
| Tab badge count fix | Task 10 |
| `setVolume` agent method | Task 2 |
| Gateway handler for `MEDIA_SET_VOLUME` | Task 2 |
