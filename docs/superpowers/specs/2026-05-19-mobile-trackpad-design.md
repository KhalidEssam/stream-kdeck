# Mobile Trackpad — Design Spec

**Date:** 2026-05-19
**Status:** Approved

---

## 0. Context

KDeck's mobile app currently acts as a button-based control surface. This spec adds a **full-screen trackpad mode** that turns the phone into a wireless desktop mouse — supporting relative cursor movement, left/right click, two-finger scroll, long-press drag, and a floating keyboard toggle that pipes keystrokes through the existing `KeystrokeService`. Entry point is a mouse icon in the `DeckScreen` header.

Reference: core architecture at `docs/superpowers/specs/2026-05-13-control-surface-platform-design.md`.

---

## 1. User-Facing Behaviour

1. User opens KDeck on their phone while connected to the desktop agent.
2. User taps the mouse icon (header, right of settings gear) on `DeckScreen`.
3. Full-screen `TrackpadScreen` opens.
4. User drags one finger → desktop cursor moves proportionally (trackpad-style relative delta).
5. User taps (no movement) → left click fires on desktop.
6. User taps with two fingers → right click fires on desktop.
7. User scrolls with two fingers → desktop scroll fires.
8. User long-presses then drags → mouse-down fires, cursor tracks finger, mouse-up fires on release.
9. Sensitivity slider at bottom of screen adjusts movement speed (0.3×–3.0×, default 1.0×, persisted locally).
10. User taps keyboard icon (bottom-right FAB) → native mobile keyboard appears; each key press sends a keystroke through the existing `BUTTON_TAP + KEYSTROKE` path.
11. User taps back arrow → returns to `DeckScreen`.
12. On macOS, if Accessibility permission is missing, a toast is shown: *"Enable Accessibility for KDeck in System Preferences → Privacy → Accessibility"*.

---

## 2. Architecture

```
Mobile TrackpadScreen
  │  gesture events (PanGestureHandler, TapGestureHandler)
  │  delta × sensitivity multiplier (applied on device)
  ▼
WebSocketService
  │  MOUSE_MOVE  { dx, dy }
  │  MOUSE_CLICK { button, type }
  │  MOUSE_SCROLL { dx, dy }
  │  BUTTON_TAP  { action: KEYSTROKE } (existing path, reused for keyboard)
  ▼
WsGateway (agent)
  │
  ├─ MOUSE_MOVE  → MouseService.moveMouse(dx, dy)
  ├─ MOUSE_CLICK → MouseService.clickMouse(button, type)
  ├─ MOUSE_SCROLL → MouseService.scrollMouse(dx, dy)
  └─ BUTTON_TAP  → CommandService → KeystrokeService (unchanged)
        │
        ▼
   @nut-tree-fork/nut-js
        │
        ▼
   OS mouse / keyboard API (Windows + macOS)
```

No changes to the web app, Supabase, or licensing. The existing WebSocket connection and mDNS discovery are reused unchanged.

---

## 3. Message Protocol

Three new message types added to `packages/shared/src/schema.ts`:

```ts
// Mobile → Agent
export interface MouseMoveMessage {
  type: 'MOUSE_MOVE';
  dx: number;  // pixel delta after sensitivity applied on mobile
  dy: number;
}

export interface MouseClickMessage {
  type: 'MOUSE_CLICK';
  button: 'left' | 'right' | 'middle';
  type: 'click' | 'down' | 'up';  // 'click' = instant press+release
}

export interface MouseScrollMessage {
  type: 'MOUSE_SCROLL';
  dx: number;  // horizontal scroll delta
  dy: number;  // vertical scroll delta (negative = scroll up)
}
```

Keyboard keystrokes reuse the existing `BUTTON_TAP` message with `action: { kind: 'KEYSTROKE', keys: [...] }` — no new message type needed.

Updated union:
```ts
export type MobileMessage = ... | MouseMoveMessage | MouseClickMessage | MouseScrollMessage;
```

**Note:** `MouseClickMessage` has a field named `type` that conflicts with the discriminant. In implementation, use `action: 'click' | 'down' | 'up'` for the click sub-type and keep `type: 'MOUSE_CLICK'` as the discriminant.

---

## 4. Agent — New Service

### 4a. `MouseService` (`src/mouse/mouse.service.ts`)

Uses `@nut-tree-fork/nut-js` (already installed). All three methods are `async`.

```ts
@Injectable()
export class MouseService {
  async moveMouse(dx: number, dy: number): Promise<void>
  // Gets current position via mouse.getPosition()
  // Adds delta, clamps to screen bounds
  // Calls mouse.setPosition(newPos)

  async clickMouse(button: 'left' | 'right' | 'middle', action: 'click' | 'down' | 'up'): Promise<void>
  // Maps button string → nut-js Button enum (Button.LEFT / RIGHT / MIDDLE)
  // 'click'  → mouse.click(button)
  // 'down'   → mouse.pressButton(button)
  // 'up'     → mouse.releaseButton(button)

  async scrollMouse(dx: number, dy: number): Promise<void>
  // dy < 0 → mouse.scrollUp(Math.abs(dy))
  // dy > 0 → mouse.scrollDown(dy)
  // dx < 0 → mouse.scrollLeft(Math.abs(dx))
  // dx > 0 → mouse.scrollRight(dx)
}
```

**macOS permission check:** On `onModuleInit`, attempt `mouse.getPosition()`. If it throws an Accessibility error, set an internal `permissionMissing: true` flag. All methods check this flag — if set, throw a descriptive error that `WsGateway` converts to `ACTION_RESULT { success: false, error: 'accessibility_permission' }`.

### 4b. `MouseModule` (`src/mouse/mouse.module.ts`)

NestJS module exporting `MouseService`. Imported into `AppModule`.

### 4c. `WsGateway` additions (`src/websocket/ws.gateway.ts`)

```ts
@SubscribeMessage('MOUSE_MOVE')
async handleMouseMove(@MessageBody() msg: MouseMoveMessage) {
  await this.mouseService.moveMouse(msg.dx, msg.dy);
  // no response — fire and forget
}

@SubscribeMessage('MOUSE_CLICK')
async handleMouseClick(@MessageBody() msg: MouseClickMessage) {
  try {
    await this.mouseService.clickMouse(msg.button, msg.action);
  } catch (e) {
    // only respond on error
    client.send(JSON.stringify({ type: 'ACTION_RESULT', success: false, error: e.message }));
  }
}

@SubscribeMessage('MOUSE_SCROLL')
async handleMouseScroll(@MessageBody() msg: MouseScrollMessage) {
  await this.mouseService.scrollMouse(msg.dx, msg.dy);
}
```

`BUTTON_TAP + KEYSTROKE` is entirely unchanged.

---

## 5. Mobile — New Screen & Components

### 5a. Entry Point — `DeckScreen` header change (`src/screens/DeckScreen.tsx`)

Add a mouse icon button to the right of the existing settings gear icon:

```tsx
<TouchableOpacity onPress={() => navigation.navigate('Trackpad')}>
  <MousePointerIcon size={22} color={colors.icon} />
</TouchableOpacity>
```

### 5b. `TrackpadScreen` (`src/screens/TrackpadScreen.tsx`)

Full-screen dark surface. Layout:

```
┌─────────────────────────────────────────┐
│  ←   Trackpad                      ⌨️   │  ← header: back + keyboard FAB
│                                         │
│                                         │
│         [gesture capture area]          │
│         fills remaining height          │
│                                         │
│                                         │
│  ●●●  sensitivity  ━━━━━○━━━  3.0×     │  ← bottom strip
└─────────────────────────────────────────┘
```

**Gesture handlers** (React Native Gesture Handler, already in Expo):

| Gesture | Event fired |
|---|---|
| Single-finger pan | `MOUSE_MOVE { dx: Δx × sensitivity, dy: Δy × sensitivity }` on each frame |
| Single tap (< 5px travel) | `MOUSE_CLICK { button: 'left', action: 'click' }` |
| Two-finger tap | `MOUSE_CLICK { button: 'right', action: 'click' }` |
| Two-finger pan | `MOUSE_SCROLL { dx: -Δx, dy: -Δy }` |
| Long-press start | `MOUSE_CLICK { button: 'left', action: 'down' }` |
| Long-press + pan | `MOUSE_MOVE` stream (drag) |
| Long-press release | `MOUSE_CLICK { button: 'left', action: 'up' }` |

**Visual feedback:** small translucent dot rendered at touch point during pan, fades out on lift.

**Throttling:** `MOUSE_MOVE` messages throttled to 60/s (16ms minimum interval) to avoid flooding the WebSocket.

### 5c. Sensitivity Slider

- `Slider` component (React Native community slider or Expo equivalent)
- Range: `0.3` – `3.0`, step `0.1`, default `1.0`
- Value label shown on right (e.g. `1.5×`)
- On change: updates in-memory state + writes to `AsyncStorage` under key `trackpad_sensitivity`
- On screen mount: loads from `AsyncStorage`; falls back to `1.0` if not set

### 5d. Keyboard Toggle

- Floating button (keyboard icon) in top-right of header
- Toggles a hidden `TextInput` with `autoFocus` — this pops the native OS keyboard
- `onKeyPress` handler intercepts each keystroke and calls:
  ```ts
  websocketService.tap('keyboard-key', {
    kind: 'KEYSTROKE',
    keys: [normalizeKey(event.nativeEvent.key)]
  });
  ```
- `normalizeKey` maps React Native key names to nut-js-compatible strings (e.g. `'Backspace'` → `'backspace'`, `'Enter'` → `'return'`)
- TextInput value is always cleared after each key — it is not a real text field, only a keyboard hook

---

## 6. Sensitivity Persistence

| Key | Type | Default | Range |
|---|---|---|---|
| `trackpad_sensitivity` | `float` (AsyncStorage string → parseFloat) | `1.0` | `0.3` – `3.0` |

Stored on the mobile device only. No server-side persistence. Delta multiplication happens on mobile before sending — the agent receives already-scaled values.

---

## 7. Error Handling

| Scenario | Behaviour |
|---|---|
| macOS Accessibility permission missing | `MouseService` sets `permissionMissing` flag on init; subsequent calls return `ACTION_RESULT { success: false, error: 'accessibility_permission' }` → mobile toast: *"Enable Accessibility for KDeck in System Preferences"* |
| Windows — nut-js mouse fails | Exception caught in `WsGateway`; `ACTION_RESULT { success: false }` sent; mobile shows generic toast |
| WebSocket not connected | `TrackpadScreen` checks `websocketService.isConnected`; if false, disables gesture area and shows *"Not connected — open from the deck screen"* |
| Rapid gesture events exceed 60/s | Client-side throttle drops excess frames; no queue buildup |
| Long-press drag — connection drops mid-drag | `MOUSE_CLICK up` never sent; agent leaves button held. Mitigation: on `WebSocket.onclose`, agent calls `mouse.releaseButton(Button.LEFT)` as cleanup |
| Keyboard key not mappable | `normalizeKey` returns `null`; keystroke silently dropped |

---

## 8. Component Breakdown Summary

### Agent — new files

| File | Responsibility |
|---|---|
| `src/mouse/mouse.service.ts` | nut-js mouse control: move, click, scroll, permission check |
| `src/mouse/mouse.module.ts` | NestJS module wiring |

### Agent — changed files

| File | Change |
|---|---|
| `src/websocket/ws.gateway.ts` | Add `MOUSE_MOVE`, `MOUSE_CLICK`, `MOUSE_SCROLL` handlers; inject `MouseService` |
| `src/app.module.ts` | Import `MouseModule` |

### Mobile — new files

| File | Responsibility |
|---|---|
| `src/screens/TrackpadScreen.tsx` | Full-screen gesture capture, sensitivity slider, keyboard toggle |

### Mobile — changed files

| File | Change |
|---|---|
| `src/screens/DeckScreen.tsx` | Add mouse icon button to header |
| `src/services/websocket.service.ts` | Add `moveMouse()`, `clickMouse()`, `scrollMouse()` helper methods |
| `src/navigation/AppNavigator.tsx` | Register `Trackpad` route |

### Shared — changed files

| File | Change |
|---|---|
| `packages/shared/src/schema.ts` | Add `MouseMoveMessage`, `MouseClickMessage`, `MouseScrollMessage`; update `MobileMessage` union |

---

## 9. Out of Scope

- Bluetooth / WebRTC transport (Wi-Fi WebSocket only for now)
- Gyroscope "air mouse" mode — deferred
- Middle-click scroll emulation
- macOS trackpad haptic feedback
- Pointer acceleration curves (linear scaling only)
- Multi-monitor awareness (cursor clamping uses primary screen bounds)
- Syncing sensitivity preference across devices
