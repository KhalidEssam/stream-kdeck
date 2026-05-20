# PeekFab — Design Spec
**Date:** 2026-05-20
**Status:** Approved

## Overview

Replace the current circular FAB (floating action button) in `DeckScreen` with a "peek" style squircle button that starts half off-screen on the right edge, slides in on drag or tap, then opens `AddTileScreen` on a second tap. Adapts the interaction pattern from the Rawaq "Peek Action Button" HTML design, using the app's own purple color scheme.

---

## Component Structure

**New file:** `apps/mobile/src/components/PeekFab.tsx`

```ts
interface Props {
  onPress: () => void;   // called when tapped while expanded → opens AddTileScreen
  showBadge: boolean;    // true when packRegistry has entries
}
```

**DeckScreen changes:**
- Remove the existing `TouchableOpacity` FAB (currently lines 406–408)
- Remove `styles.fab` and `styles.fabText`
- Add `<PeekFab onPress={() => setShowAddTile(true)} showBadge={!!packRegistry?.length} />`
- On `AddTileScreen` modal close (`onDismiss`), reset FAB to peeking state via `useImperativeHandle` ref

---

## Visual Design

| Property | Value |
|---|---|
| Size | 64 × 64 |
| Shape | Squircle — `borderRadius: 20` |
| Background | `#5B4FE8` (app primary purple) |
| Top-edge highlight | Inner `View` — `borderTopWidth: 1`, `borderTopColor: rgba(255,255,255,0.25)` |
| Bottom-edge shadow | `shadowColor: '#3D34C4'` via `elevation` layering |
| Icon | White `+`, fontSize 28, inside a counter-rotating `Animated.View` |
| Shadow | `shadowColor: '#5B4FE8'`, `shadowOpacity: 0.45`, `shadowRadius: 14`, `elevation: 10` |
| Badge | 10 × 10 white circle, `top: 8, right: 8`, `borderWidth: 2, borderColor: '#5B4FE8'` |

---

## State & Position

| State | `rightOffset` | Rotation |
|---|---|---|
| Peeking (rest) | `-32` px (half off screen) | `-12deg` |
| Expanded | `16` px (screen-edge margin) | `0deg` |

Position is driven by `Animated.Value` (`rightOffset`), applied via `useAnimatedStyle` on an absolutely-positioned outer `Animated.View`.

Rotation interpolates live as position changes:
```
inputRange:  [-32, 16]
outputRange: ['-12deg', '0deg']
```

The `+` icon lives in a child `Animated.View` with the **inverse** rotation so it stays visually upright at all times.

---

## Behavior

### Drag (PanResponder)
- `onStartShouldSetPanResponder: () => true`
- On move: `newRight = startRight - dx`, clamped to `[-32, 16]`
- On release: if `rightOffset >= -16` → snap to expanded; else → snap to peeking
- Snap uses `Animated.spring` with `tension: 80, friction: 10`

### Tap
- Detected when total movement during gesture `< 5px`
- **Peeking → tapped:** snap to expanded (does NOT open AddTileScreen yet)
- **Expanded → tapped:** call `onPress` → opens AddTileScreen

### Wiggle hint
- `Animated.sequence` of small left/right `translateX` translations (`-6 → 0 → -3 → 0`)
- Plays after `1.2s` on mount
- Repeats every `8s` via `setInterval` while `hasInteracted === false`
- `hasInteracted` ref set to `true` on first drag or tap
- Interval cleared on unmount

### Reset to peeking
- When `AddTileScreen` modal closes (`onDismiss`), FAB snaps back to peeking state
- Implemented by exposing a `resetToPeeking` function via `useImperativeHandle`, called from `DeckScreen`'s `onDismiss` handler

---

## Edge Cases

| Case | Handling |
|---|---|
| AddTileScreen open | FAB is behind the modal; stays expanded, snaps to peeking on close |
| Badge when no packs | `showBadge={false}` → badge has `opacity: 0`, no layout shift |
| Wiggle after interact | `hasInteracted` ref stops all future wiggle intervals |
| Unmount cleanup | `useEffect` cleanup clears wiggle `setInterval` |
| Android bottom nav | `bottom: 80` to clear the bottom nav bar (button is 64px tall) |
| PanResponder conflict | FAB is `position: absolute`, outside scroll area — no conflict |

---

## Files Changed

| File | Change |
|---|---|
| `apps/mobile/src/components/PeekFab.tsx` | **New** — full component |
| `apps/mobile/src/screens/DeckScreen.tsx` | Remove old FAB, add `<PeekFab>`, wire `resetToPeeking` ref |
