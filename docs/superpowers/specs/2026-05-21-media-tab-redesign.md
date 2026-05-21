# Media Tab Redesign Spec

**Date:** 2026-05-21  
**Status:** Approved  
**Scope:** `apps/agent/src/media/` + `apps/mobile/src/screens/MediaTab.tsx` + `apps/mobile/src/components/Media*`

---

## Problem

The current media tab has two compounding issues:

1. **Layout sparseness** — paginated 4-per-page grid leaves visible gaps when the page isn't full. The hero card and pagination dots consume space without adding density.
2. **Noise in the source list** — the agent dumps all WASAPI audio sessions with zero filtering. System processes like `rtkUWP.exe` (Realtek audio service), `audiodg.exe` (Windows Audio Device Graph), `QEMU.exe`, and other virtual/subsystem audio appear alongside real user apps, giving a confusing first impression.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Filter philosophy | Smart mixer | Auto-filter to real apps; system junk never appears |
| Filter mechanism | Heuristic + blocklist | Heuristic catches unknown junk automatically; blocklist mops up known edge cases |
| Layout | Hero + adaptive grid | Keeps focused "active app" hero; 3-column grid fills space without pagination |
| App icons | Real icons from exe | Agent extracts icon per PID; recognizable apps at a glance |
| Volume control | Slider in hero + hardware buttons | Direct touch control in hero; hardware buttons remain as ±5% shortcut |

---

## Architecture

### Agent Side

#### 1. Smart Filter

Two-layer filter applied in `MediaService.getSessions()` before building state:

**Layer 1 — Heuristic** (catches unknown system processes):
- Exclude processes with no visible window (check via `tasklist /FI "WINDOWTITLE ne N/A"` or equivalent)
- Exclude processes whose exe path is under `System32`, `SysWOW64`, or `\Windows\`

**Layer 2 — Blocklist** (known offenders that slip past the heuristic):
```ts
const BLOCKED_PROCESS_NAMES = [
  'audiodg',       // Windows Audio Device Graph Isolation
  'rtkuwp',        // Realtek audio UWP service
  'svchost',       // Generic Windows service host
  'rundll32',      // DLL host
  'conhost',       // Console window host
  'qemu-system',   // QEMU virtual machine audio
  'vmware-vmx',    // VMware VM audio
  'vboxheadless',  // VirtualBox headless VM
  'wlanext',       // Windows WLAN extension
];
```
Match is case-insensitive, prefix-based (e.g., `qemu-system` matches `qemu-system-x86_64.exe`).

#### 2. Icon Pipeline

New `IconService` (or method within `MediaService`) responsible for:

1. Resolve exe path from PID using `tasklist /FO CSV /NH /FI "PID eq <pid>"` or a native Node module (e.g. `pidusage` + `process-list`)
2. Extract icon from exe using `extract-file-icon` npm package → returns PNG `Buffer`
3. Base64-encode and cache result in a `Map<processName, string>` — icons don't change per session
4. Attach `iconBase64` to `MediaSession` before broadcast
5. If extraction fails (system stub, access denied): `iconBase64` stays `undefined`; mobile falls back to colored letter avatar

Cache is invalidated only on agent restart (icons are stable per app install).

#### 3. Data Shape (no schema changes needed)

`MediaSession.iconBase64` is already defined in the shared schema. No new fields required.

---

### Mobile Side

#### 1. MediaTab Layout

Remove the paginated `FlatList` + pagination dots entirely. Replace with:

```
┌─────────────────────────────────┐
│  [tab bar: AI Tools / Apps / Media ③] │
├─────────────────────────────────┤
│  ┌─────────────────────────────┐ │
│  │  HERO CARD (active app)     │ │
│  │  [icon] Name        [mute]  │ │
│  │  ────────●──────────  72%   │ │  ← slider
│  └─────────────────────────────┘ │
│                                  │
│  ALL SOURCES · 3 ACTIVE          │
│  ┌──────┐ ┌──────┐ ┌──────┐     │
│  │  ♪   │ │  💬  │ │  🌐  │     │
│  │Spotify│ │Discord│ │Chrome│    │
│  │  72% │ │  45% │ │  🔇  │     │
│  └──────┘ └──────┘ └──────┘     │
│  ┌──────┐ ┌──────┐              │
│  │  🎬  │ │      │              │
│  │ VLC  │ │  +   │              │
│  │ 📌   │ │ pin  │              │
│  └──────┘ └──────┘              │
└─────────────────────────────────┘
```

- Grid is a `FlatList` with `numColumns={3}`, no paging, vertical scroll
- No pagination dots
- Tab badge shows count of sessions with `volume > 0` after filtering (i.e. currently making sound — muted sessions still count)

#### 2. Hero Card (`MediaHeroCard`)

Changes from current:
- Replace SVG ring meter with a **horizontal volume slider** (React Native `Slider` or custom `PanResponder` implementation)
- Track: full-width, 6px tall, rounded; fill is purple gradient left-to-right
- Draggable thumb (14px white circle with purple glow)
- Slider `onValueChange` → debounced `MEDIA_SET_VOLUME` message to agent (new message type, see below)
- Hardware volume buttons remain: `MEDIA_VOLUME_DELTA` ±0.05 still fires on button press
- Mute button (top-right): tap → `MEDIA_SET_MUTE`; red tint + 🔇 icon when active app is muted
- Real icon: `<Image source={{ uri: \`data:image/png;base64,\${iconBase64}\` }}>`; fallback to colored circle with first letter of app name
- When active app is muted: hero border turns red-tinted, icon opacity 0.5, slider opacity 0.4

#### 3. Grid Card (`MediaAppCard`)

Changes from current:
- Remove SVG ring; replace with a 2px mini-bar below the app name (same fill % as volume)
- Real icon (same fallback as hero)
- Tap → promote app to hero (set `activeProcessName`)
- Long-press → action sheet (Pin/Unpin, unchanged)
- Muted state: card opacity 0.5, red-tinted background, 🔇 instead of volume %
- Pinned-offline state: dashed border, dimmed icon, 📌 label, no mini-bar

#### 4. Empty State

When `filteredSessions.length === 0` AND no pinned apps: full-screen friendly message:
```
🎵
Nothing playing right now
Start playing audio in any app
and it'll appear here
```

When nothing playing but pinned apps exist: show empty message in the hero area + pinned apps in the grid below.

#### 5. New Agent Message: `MEDIA_SET_VOLUME`

```ts
// Mobile → Agent
{ type: 'MEDIA_SET_VOLUME', processName: string, volume: number /* 0–1 */ }
```

Agent handler: calls `mixer.setAudioSessionVolume(pid, volume)` for the matching session. This is the absolute-set counterpart to the existing `MEDIA_VOLUME_DELTA`.

---

## Filtering Logic (Mobile, secondary)

After receiving `MEDIA_STATE`, mobile applies a client-side filter as a safety net:

```ts
function isVisibleSession(session: MediaSession): boolean {
  if (session.pinned) return true; // pinned always shown
  if (session.volume === 0 && !session.pinned) return false; // hide truly silent non-pinned
  return true;
}
```

Primary filtering happens on the agent. This is just a guard.

---

## Interaction Summary

| Gesture | Target | Result |
|---|---|---|
| Tap grid card | Inactive app | Promotes to hero |
| Tap mute button | Hero card | Toggles mute on active app |
| Drag/tap slider | Hero card | Sets absolute volume (debounced) |
| Hardware vol up/down | Any | ±5% delta on active app |
| Long-press grid card | Any app | Action sheet: Pin/Unpin |

---

## Out of Scope

- macOS: no change (macOS path already degrades to single "System Volume" session; icon fetching is Windows-only)
- Per-app EQ or effects
- Grouping by app type (browser tabs, media players, comms)
- Search or sort controls
- Notification/alert when an app starts playing

---

## Files Affected

| File | Change |
|---|---|
| `apps/agent/src/media/media.service.ts` | Add filter logic, icon extraction, cache |
| `apps/agent/src/media/icon.service.ts` | New — icon extraction + caching |
| `apps/agent/src/ws/ws.gateway.ts` | Handle `MEDIA_SET_VOLUME` message |
| `apps/mobile/src/screens/MediaTab.tsx` | Replace paged FlatList with 3-col grid |
| `apps/mobile/src/components/MediaHeroCard.tsx` | Slider replaces ring, real icon, mute btn redesign |
| `apps/mobile/src/components/MediaAppCard.tsx` | Mini-bar replaces ring, real icon, pinned state |
| `apps/mobile/src/types/schema.ts` | Add `MEDIA_SET_VOLUME` message type |
| `apps/mobile/src/services/websocket.service.ts` | Add `sendSetVolume()` method |
