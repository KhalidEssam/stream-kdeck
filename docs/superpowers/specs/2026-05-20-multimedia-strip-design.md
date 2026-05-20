# Multimedia Strip — Design Spec
**Date:** 2026-05-20
**Status:** Approved
**Authors:** Khalid + Claude Code (brainstorm session)

---

## 0. Summary

A new **Media tab** in the KDeck mobile app lets users see and control the volume of any desktop app producing audio. The phone's hardware volume buttons control the selected app's volume. A circular ring meter around each app icon shows the current level in real time. Users can add as many apps as they like; the tab paginates 4 at a time with swipe navigation.

---

## 1. User-Facing Behaviour

### 1.1 Media Tab placement
A fourth tab — **Media** — is added to `DeckScreen` alongside AI Tools, Apps, and Shortcuts.

### 1.2 App sources
- **Auto-detected**: The desktop agent enumerates all Windows audio sessions (WASAPI) in real time. Any app currently producing audio appears automatically.
- **Pinned**: Users can pin specific apps (e.g. Spotify) so they always appear even when not currently playing. Pinned apps are stored in the agent's existing JSON config under a new `pinnedMediaApps: Array<{ processName: string; label: string }>` field.

### 1.3 Layout — 1×4 row + active hero
The tab has two zones:

**Hero card (top):** Shown when an app is selected. Displays a large circular ring meter (~64px SVG arc), the app icon centred in the ring, the app name, current volume percentage, and a "vol buttons active" label.

**Paged compact row (below hero):** A horizontal `FlatList` with `pagingEnabled`. Each page shows 4 compact `MediaAppCard`s side by side. At the end of the last page a "+ Add" card opens a pin-app picker sheet. Pagination dots sit below the row.

### 1.4 Interaction model
| Gesture | Result |
|---|---|
| Tap unselected app | Selects it → hero card animates in, volume buttons activate |
| Tap active (selected) app | Toggles mute/unmute |
| Long-press any app | Action sheet: "Pin / Unpin" + "Bring to Front" |
| Hardware volume up/down | ±5% on selected app's volume (only when Media tab is active AND an app is selected; otherwise default OS behaviour) |
| Swipe paged row left/right | Navigate pages of 4 |

### 1.5 Visual states
- **Active**: purple border, ring arc in `#5B4FE8`→`#9B8FFF` gradient
- **Inactive**: no border, dimmed ring arc in `#3A3A5A`
- **Muted**: card opacity 0.55, ring arc in `#FF4444`, hero shows 🔇
- **Pinned + not playing**: appears with ring at 0%, slightly dimmed

### 1.6 macOS degraded mode
On macOS the agent cannot access per-app audio sessions via public APIs. A single synthetic session `{ label: 'System Volume', processName: 'system' }` is shown. Volume control adjusts master system output. The hero card shows a small note: "Per-app volume: Windows only".

---

## 2. Architecture

Three layers change:

| Layer | Changes |
|---|---|
| `packages/shared` | 5 new message types, `MediaSession` shape |
| `apps/agent` | `MediaService` + `MediaModule`, gateway additions |
| `apps/mobile` | `MediaTab`, `MediaHeroCard`, `MediaAppCard`, `useVolumeButtons` |

---

## 3. Shared Schema (`packages/shared/src/schema.ts`)

```ts
export interface MediaSession {
  processName: string;   // "Spotify.exe" / "Discord.exe" / "system"
  label: string;         // Display name
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

`MediaStateMessage` is added to `AgentMessage`. The four mobile messages are added to `MobileMessage`.

---

## 4. Desktop Agent

### 4.1 `MediaService`

```
apps/agent/src/media/media.service.ts
apps/agent/src/media/media.module.ts
```

**Dependencies:** `node-audio-volume-mixer` (npm, native addon — requires `electron-rebuild` in build pipeline).

**Lifecycle:**
- `onModuleInit`: starts 300ms `setInterval` polling `mixer.getAudioSessions()`
- Each tick: diffs result against previous snapshot; if sessions or any volume/muted state changed, calls `wsGateway.broadcastMediaState(sessions)`
- Merges `pinnedMediaApps` from config into every emitted snapshot (missing pinned apps get `volume: 0, muted: false`)
- `onModuleDestroy`: clears interval

**Methods exposed to gateway:**
```ts
setVolume(processName: string, newVolume: number): void
  // clamps 0–1, calls mixer.setAppVolume()

setMute(processName: string, muted: boolean): void
  // calls mixer.setAppMute()

bringToFront(processName: string): void
  // Windows: PowerShell (New-Object -ComObject WScript.Shell).AppActivate('processName')
  // macOS: osascript -e 'tell application "AppName" to activate'

pinApp(processName: string, label: string, pinned: boolean): void
  // updates pinnedMediaApps in config JSON, triggers immediate broadcast
```

**macOS fallback:**
```ts
if (process.platform === 'darwin') {
  // poll via: osascript -e 'output volume of (get volume settings)'
  // setVolume via: osascript -e 'set volume output volume X'
  // emit single synthetic session { processName: 'system', label: 'System Volume' }
}
```

### 4.2 Gateway additions (`ws.gateway.ts`)

Four new cases in `handleMessage`:
```
MEDIA_VOLUME_DELTA  → mediaService.setVolume(processName, clamp(current + delta))
MEDIA_SET_MUTE      → mediaService.setMute(processName, muted)
MEDIA_BRING_TO_FRONT → mediaService.bringToFront(processName)
MEDIA_PIN_APP       → mediaService.pinApp(processName, label, pinned)
```

`WebSocketService` (mobile) gains `onMediaState(cb)` and the four send methods.

### 4.3 Config schema addition

```ts
// In agent's persisted config JSON
pinnedMediaApps: Array<{ processName: string; label: string }>
```

---

## 5. Mobile Components

### 5.1 `MediaTab` (`apps/mobile/src/screens/MediaTab.tsx`)

- Owns `activeProcessName: string | null` state
- Subscribes to `ws.onMediaState()` → stores `sessions: MediaSession[]`
- Renders `MediaHeroCard` (visible when `activeProcessName !== null`)
- Renders paged `FlatList` of `MediaAppCard`s below (4 per page, `pagingEnabled`, horizontal)
- Last item in list is an "+ Add" card opening a pinned-app picker sheet
- Passes `enabled={activeProcessName !== null}` and `onDelta` to `useVolumeButtons`
- `onDelta(delta)` → sends `MEDIA_VOLUME_DELTA` then optimistically updates local session volume for instant ring feedback

### 5.2 `MediaHeroCard` (`apps/mobile/src/components/MediaHeroCard.tsx`)

Props: `session: MediaSession | null`

- Large SVG arc ring (~64px diameter), stroke animated via `Animated.Value` keyed to `session.volume`
- App icon centred in ring (from `iconBase64` or emoji fallback)
- Name, volume %, "vol buttons active" hint label
- 🔇 overlay when `session.muted`
- macOS note when `session.processName === 'system'`

### 5.3 `MediaAppCard` (`apps/mobile/src/components/MediaAppCard.tsx`)

Props: `session: MediaSession`, `isActive: boolean`, `onTap`, `onLongPress`

- Compact card (~80px wide)
- Small SVG arc ring (~36px), stroke colour: `#5B4FE8` (active) / `#3A3A5A` (inactive) / `#FF4444` (muted)
- App icon, name label, volume %
- Active: purple border + background tint
- Muted: opacity 0.55

### 5.4 `useVolumeButtons` (`apps/mobile/src/hooks/useVolumeButtons.ts`)

```ts
function useVolumeButtons(options: {
  enabled: boolean;
  onDelta: (delta: number) => void;
}): void
```

- Uses `react-native-volume-manager`
- When `enabled`: calls `VolumeManager.setNativeSilencer(true)` to suppress OS HUD, registers listener → `onDelta(±0.05)`
- When `!enabled` or on unmount: removes listener, calls `VolumeManager.setNativeSilencer(false)` to restore default

---

## 6. Data Flow

### Volume button press (end-to-end)

```
[User: vol up]
  → useVolumeButtons fires onDelta(+0.05)
  → MediaTab sends MEDIA_VOLUME_DELTA { processName: 'Spotify.exe', delta: 0.05 }
  → Optimistic update: local session volume += 0.05 (instant ring feedback)
  → Agent: newVol = clamp(current + 0.05, 0, 1), mixer.setAppVolume()
  → ≤300ms later: MEDIA_STATE arrives with confirmed volume
  → MediaTab reconciles — ring already showing correct value
```

### Session appears / disappears

```
[User opens Spotify]
  → Next 300ms poll detects new session
  → MEDIA_STATE pushed → new MediaAppCard appears in paged row

[User closes Spotify (not pinned)]
  → Next poll: session gone from diff
  → MEDIA_STATE pushed without Spotify → card removed
  → If Spotify was active: hero card fades out, activeProcessName → null
```

---

## 7. Error Handling

| Scenario | Behaviour |
|---|---|
| `node-audio-volume-mixer` unavailable / crash | `MediaService` catches, logs, emits `MEDIA_STATE { sessions: [] }` → mobile shows "No audio sources found" empty state |
| App disappears while active | Hero clears, card removed on next `MEDIA_STATE` |
| Volume delta out of range | Agent clamps 0–1 before calling mixer |
| `osascript` subprocess fails (macOS) | Emit `sessions: []` → mobile shows "Could not read system volume" |
| WebSocket disconnected while Media tab open | `useVolumeButtons` stays enabled but sends fail silently; reconnect restores state |

---

## 8. Dependencies

| Package | Side | Purpose |
|---|---|---|
| `node-audio-volume-mixer` | agent | WASAPI session enumeration + volume control (Windows) |
| `react-native-volume-manager` | mobile | Hardware volume button interception |

`node-audio-volume-mixer` is a native Node addon — `electron-rebuild` must be added to the agent's build pipeline (or `postinstall` script) if not already present.

---

## 9. Out of Scope (v1)

- macOS per-app volume (private CoreAudio API — deferred to v2)
- Linux audio (PulseAudio / PipeWire — deferred)
- Playback controls (play/pause/skip) — separate feature
- Master volume control when no app selected
- Volume level persistence across app restarts
