# Trackpad Double-Click-Drag Selection

**Date:** 2026-05-24  
**File:** `apps/mobile/src/screens/TrackpadScreen.tsx`  
**Status:** Approved for implementation

---

## Overview

Add a "double-click-drag to select" gesture to the existing React Native trackpad screen. The gesture mirrors macOS trackpad behavior: tap once, tap again and hold the second tap, then drag. While dragging, the trackpad surface shows a blue tint with a "Selecting..." label. Releasing the finger ends the selection.

No changes are required to the desktop agent — it already handles the `MOUSE_CLICK left down` → `MOUSE_MOVE` → `MOUSE_CLICK left up` sequence as a valid drag.

---

## Approach

Extend the existing `PanResponder` in `TrackpadScreen.tsx` with three new refs and one new React state bit. No new dependencies. No restructuring of existing gesture logic — new behavior is added as branches alongside existing paths.

---

## New Constants

```ts
const DOUBLE_TAP_WINDOW_MS = 300; // ms between first tap release and second tap down
```

Add alongside existing constants (`THROTTLE_MS`, `TAP_MOVEMENT_THRESHOLD`, `LONG_PRESS_DELAY_MS`).

---

## New State & Refs

```ts
// React state — drives visual re-render only
const [isDraggingSelection, setIsDraggingSelection] = useState(false);

// Refs — gesture state, no re-renders
const lastTapTimeRef             = useRef<number | null>(null);
const isDoubleTapHeldRef         = useRef(false);
const isDoubleClickDraggingRef   = useRef(false);
```

---

## Gesture State Machine

### States

| State | Description |
|---|---|
| `IDLE` | Default. All existing gestures work normally. |
| `DOUBLE_TAP_HELD` | Second tap is down within the window. Waiting to see movement or lift. |
| `DOUBLE_CLICK_DRAGGING` | Left button held down, streaming mouse moves. |

### Transitions

**`IDLE → DOUBLE_TAP_HELD`**  
Condition in `onPanResponderGrant`:
- `fingerCountRef.current === 1`
- `lastTapTimeRef.current !== null`
- `Date.now() - lastTapTimeRef.current <= DOUBLE_TAP_WINDOW_MS`

Action: set `isDoubleTapHeldRef.current = true`. Do NOT start the long-press timer.

**`DOUBLE_TAP_HELD → DOUBLE_CLICK_DRAGGING`**  
Condition in `onPanResponderMove`:
- `isDoubleTapHeldRef.current === true`
- `totalMovementRef.current > TAP_MOVEMENT_THRESHOLD`

Actions:
1. `ws.clickMouse('left', 'down')`
2. `isDoubleClickDraggingRef.current = true`
3. `isDoubleTapHeldRef.current = false`
4. `setIsDraggingSelection(true)`
5. Stream `ws.moveMouse(dx, dy)` (same throttle as regular drag)

**`DOUBLE_TAP_HELD → IDLE`** (second tap released without dragging = double-click complete)  
Condition in `onPanResponderRelease`:
- `isDoubleTapHeldRef.current === true`
- `totalMovementRef.current <= TAP_MOVEMENT_THRESHOLD`

Actions:
1. `ws.clickMouse('left', 'click')`
2. `lastTapTimeRef.current = Date.now()`
3. `isDoubleTapHeldRef.current = false`

**`DOUBLE_CLICK_DRAGGING → IDLE`**  
Condition in `onPanResponderRelease` or `onPanResponderTerminate`:
- `isDoubleClickDraggingRef.current === true`

Actions:
1. `ws.clickMouse('left', 'up')`
2. `isDoubleClickDraggingRef.current = false`
3. `setIsDraggingSelection(false)`

**`IDLE → IDLE`** (single tap, existing behavior)  
On `onPanResponderRelease` where `totalMovement <= TAP_MOVEMENT_THRESHOLD` and not in double-tap state:
- Existing: send `MOUSE_CLICK left click`
- **New addition:** set `lastTapTimeRef.current = Date.now()`

---

## WebSocket Message Sequences

### Double-click-drag (selection)

```
1. First tap release    → MOUSE_CLICK { button: 'left', action: 'click' }
2. Second tap held      → [no message — waiting]
3. Finger moves         → MOUSE_CLICK { button: 'left', action: 'down' }
4. Drag (×N, throttled) → MOUSE_MOVE  { dx, dy }
5. Finger lifts         → MOUSE_CLICK { button: 'left', action: 'up' }
```

### Double-click (no drag)

```
1. First tap release    → MOUSE_CLICK { button: 'left', action: 'click' }
2. Second tap release   → MOUSE_CLICK { button: 'left', action: 'click' }
```

---

## Visual Feedback

An `Animated.View` overlay is rendered absolutely over the trackpad surface with `pointerEvents="none"`.

- **Color:** `rgba(59, 130, 246, 0.12)` fill + `rgba(59, 130, 246, 0.4)` border (1.5px)
- **Label:** `"Selecting..."` — small, centered at the bottom of the overlay
- **Animation:** opacity fades in/out over 150ms using `Animated.timing`
- **Trigger:** driven by `isDraggingSelection` state

The animation value (`selectionOverlayAnim`) is a `useRef(new Animated.Value(0))`. When `isDraggingSelection` flips true, run fade-in; when false, run fade-out.

---

## Edge Case Handling

| Scenario | Behavior |
|---|---|
| Long-press during double-tap window | `isDoubleTapHeldRef` is checked first in `onGrant` — long-press timer is not started |
| Two-finger second tap within window | `fingerCountRef.current !== 1` check prevents entering `DOUBLE_TAP_HELD` — right-click fires normally |
| WebSocket disconnected mid-drag | `onTerminate` fires; `ws.clickMouse` guards on `ws.readyState === OPEN`; refs reset to IDLE cleanly |
| App backgrounds mid-drag | Same as above — `onTerminate` handles cleanup |
| First tap exceeded movement threshold | First tap is treated as a move, not a tap — `lastTapTimeRef` is not set, so no double-tap window opens |
| Rapid triple-tap | Third tap finds `lastTapTimeRef` set from second tap's release — enters another double-tap-held cycle |

---

## Files Changed

| File | Change |
|---|---|
| `apps/mobile/src/screens/TrackpadScreen.tsx` | Add constant, refs, state, gesture branches, overlay JSX |

No other files require changes.
