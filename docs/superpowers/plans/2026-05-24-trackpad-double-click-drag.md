# Trackpad Double-Click-Drag Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add macOS-style double-click-drag gesture to `TrackpadScreen` so users can select text/areas on the PC by tapping once, tapping again and holding, then dragging.

**Architecture:** Extend the existing `PanResponder` in `TrackpadScreen.tsx` with three new refs that track double-tap gesture state, plus one stable `Animated.Value` that drives a blue selection overlay. All gesture logic stays inside the existing PanResponder callbacks — no new handlers, no new dependencies. `setIsDraggingSelection` (stable React dispatcher) and `selectionOverlayAnim` (stable `Animated.Value`) are safe to close over inside the PanResponder because they never change reference.

**Tech Stack:** React Native `PanResponder`, `Animated`, existing `WebSocketService.clickMouse` / `moveMouse`

---

### Task 1: Add constant, refs, state, and Animated import

**Files:**
- Modify: `apps/mobile/src/screens/TrackpadScreen.tsx`

- [ ] **Step 1: Add `Animated` to the React Native import**

Find:
```ts
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
```

Replace with:
```ts
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  TouchableOpacity,
```

- [ ] **Step 2: Add the double-tap window constant**

Find:
```ts
const LONG_PRESS_DELAY_MS = 500;
```

Replace with:
```ts
const LONG_PRESS_DELAY_MS = 500;
const DOUBLE_TAP_WINDOW_MS = 300;
```

- [ ] **Step 3: Add `isDraggingSelection` React state**

Find:
```ts
  const [sensitivity, setSensitivity] = useState(SENSITIVITY_DEFAULT);
```

Replace with:
```ts
  const [sensitivity, setSensitivity] = useState(SENSITIVITY_DEFAULT);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
```

- [ ] **Step 4: Add the three new gesture refs and the Animated ref**

Find:
```ts
  // tracks whether a two-finger scroll actually fired, to suppress right-click on lift
  const twoFingerScrolledRef = useRef(false);
```

Replace with:
```ts
  // tracks whether a two-finger scroll actually fired, to suppress right-click on lift
  const twoFingerScrolledRef = useRef(false);
  // double-tap-drag state
  const lastTapTimeRef = useRef<number | null>(null);
  const isDoubleTapHeldRef = useRef(false);
  const isDoubleClickDraggingRef = useRef(false);
  const selectionOverlayAnim = useRef(new Animated.Value(0)).current;
```

- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/screens/TrackpadScreen.tsx
git commit -m "feat(trackpad): add double-tap-drag refs, Animated import, and constant"
```

---

### Task 2: Update `onPanResponderGrant` to detect the second tap

**Files:**
- Modify: `apps/mobile/src/screens/TrackpadScreen.tsx`

When a new single-finger touch lands within `DOUBLE_TAP_WINDOW_MS` of the last recorded tap, skip the long-press timer and enter `DOUBLE_TAP_HELD` state instead.

- [ ] **Step 1: Replace the single-finger block inside `onPanResponderGrant`**

Find:
```ts
        if (touches.length === 1) {
          lastPosRef.current = { x: touches[0].pageX, y: touches[0].pageY };

          longPressTimerRef.current = setTimeout(() => {
            if (totalMovementRef.current < TAP_MOVEMENT_THRESHOLD) {
              isDraggingRef.current = true;
              wsRef.current.clickMouse('left', 'down');
            }
            longPressTimerRef.current = null;
          }, LONG_PRESS_DELAY_MS);
        }
```

Replace with:
```ts
        if (touches.length === 1) {
          lastPosRef.current = { x: touches[0].pageX, y: touches[0].pageY };

          const now = Date.now();
          if (lastTapTimeRef.current !== null && now - lastTapTimeRef.current <= DOUBLE_TAP_WINDOW_MS) {
            // Second tap within double-tap window — enter held state, skip long-press timer
            isDoubleTapHeldRef.current = true;
          } else {
            longPressTimerRef.current = setTimeout(() => {
              if (totalMovementRef.current < TAP_MOVEMENT_THRESHOLD) {
                isDraggingRef.current = true;
                wsRef.current.clickMouse('left', 'down');
              }
              longPressTimerRef.current = null;
            }, LONG_PRESS_DELAY_MS);
          }
        }
```

- [ ] **Step 2: Commit**
```bash
git add apps/mobile/src/screens/TrackpadScreen.tsx
git commit -m "feat(trackpad): detect second tap in double-tap window on grant"
```

---

### Task 3: Update `onPanResponderMove` to start drag from double-tap-held state

**Files:**
- Modify: `apps/mobile/src/screens/TrackpadScreen.tsx`

When `isDoubleTapHeldRef` is true and movement exceeds the tap threshold, transition to `DOUBLE_CLICK_DRAGGING`: send `mouse down`, flip the flag, and animate the overlay in.

- [ ] **Step 1: Replace the threshold-cancel block inside `onPanResponderMove`**

Inside the `if (touches.length === 1 && lastPosRef.current)` block, find:
```ts
          if (totalMovementRef.current > TAP_MOVEMENT_THRESHOLD) {
            cancelLongPressRef.current();
          }
```

Replace with:
```ts
          if (totalMovementRef.current > TAP_MOVEMENT_THRESHOLD) {
            cancelLongPressRef.current();
            if (isDoubleTapHeldRef.current) {
              isDoubleTapHeldRef.current = false;
              isDoubleClickDraggingRef.current = true;
              wsRef.current.clickMouse('left', 'down');
              setIsDraggingSelection(true);
              Animated.timing(selectionOverlayAnim, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
              }).start();
            }
          }
```

- [ ] **Step 2: Commit**
```bash
git add apps/mobile/src/screens/TrackpadScreen.tsx
git commit -m "feat(trackpad): transition double-tap-held to drag on movement"
```

---

### Task 4: Update `onPanResponderRelease` to handle both new states

**Files:**
- Modify: `apps/mobile/src/screens/TrackpadScreen.tsx`

Three new cases in release:
1. Active drag → send `mouse up`, fade out overlay
2. Held but no drag → completes double-click (send click), record tap time
3. Regular single tap → same as before, but also record `lastTapTimeRef`

- [ ] **Step 1: Replace the full `onPanResponderRelease` handler**

Find the entire `onPanResponderRelease` handler:
```ts
      onPanResponderRelease: (evt: GestureResponderEvent) => {
        cancelLongPressRef.current();
        const changed = evt.nativeEvent.changedTouches;
        twoFingerStartRef.current = null;

        // Two-finger tap → right click (only if no scroll fired during this gesture)
        if (fingerCountRef.current === 2 && totalMovementRef.current < TAP_MOVEMENT_THRESHOLD && !twoFingerScrolledRef.current) {
          wsRef.current.clickMouse('right', 'click');
          lastPosRef.current = null;
          totalMovementRef.current = 0;
          return;
        }

        if (isDraggingRef.current) {
          wsRef.current.clickMouse('left', 'up');
          isDraggingRef.current = false;
        } else if (totalMovementRef.current < TAP_MOVEMENT_THRESHOLD && changed.length === 1) {
          wsRef.current.clickMouse('left', 'click');
        }

        lastPosRef.current = null;
        totalMovementRef.current = 0;
      },
```

Replace with:
```ts
      onPanResponderRelease: (evt: GestureResponderEvent) => {
        cancelLongPressRef.current();
        const changed = evt.nativeEvent.changedTouches;
        twoFingerStartRef.current = null;

        // Two-finger tap → right click (only if no scroll fired during this gesture)
        if (fingerCountRef.current === 2 && totalMovementRef.current < TAP_MOVEMENT_THRESHOLD && !twoFingerScrolledRef.current) {
          wsRef.current.clickMouse('right', 'click');
          lastPosRef.current = null;
          totalMovementRef.current = 0;
          return;
        }

        // Active double-click-drag released → send mouse up, clear overlay
        if (isDoubleClickDraggingRef.current) {
          wsRef.current.clickMouse('left', 'up');
          isDoubleClickDraggingRef.current = false;
          setIsDraggingSelection(false);
          Animated.timing(selectionOverlayAnim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }).start();
          lastPosRef.current = null;
          totalMovementRef.current = 0;
          return;
        }

        // Second tap held but finger lifted without dragging → completes double-click
        if (isDoubleTapHeldRef.current) {
          isDoubleTapHeldRef.current = false;
          wsRef.current.clickMouse('left', 'click');
          lastTapTimeRef.current = Date.now();
          lastPosRef.current = null;
          totalMovementRef.current = 0;
          return;
        }

        if (isDraggingRef.current) {
          wsRef.current.clickMouse('left', 'up');
          isDraggingRef.current = false;
        } else if (totalMovementRef.current < TAP_MOVEMENT_THRESHOLD && changed.length === 1) {
          wsRef.current.clickMouse('left', 'click');
          lastTapTimeRef.current = Date.now();
        }

        lastPosRef.current = null;
        totalMovementRef.current = 0;
      },
```

- [ ] **Step 2: Commit**
```bash
git add apps/mobile/src/screens/TrackpadScreen.tsx
git commit -m "feat(trackpad): handle double-click-drag and double-click on release"
```

---

### Task 5: Update `onPanResponderTerminate` to clean up drag state

**Files:**
- Modify: `apps/mobile/src/screens/TrackpadScreen.tsx`

If the gesture is interrupted (phone call, system gesture) while in double-click-drag, send `mouse up` and clear the overlay so the PC is not left with a stuck mouse button.

- [ ] **Step 1: Replace the full `onPanResponderTerminate` handler**

Find:
```ts
      onPanResponderTerminate: () => {
        cancelLongPressRef.current();
        if (isDraggingRef.current) {
          wsRef.current.clickMouse('left', 'up');
          isDraggingRef.current = false;
        }
        lastPosRef.current = null;
        totalMovementRef.current = 0;
        twoFingerStartRef.current = null;
      },
```

Replace with:
```ts
      onPanResponderTerminate: () => {
        cancelLongPressRef.current();
        if (isDraggingRef.current) {
          wsRef.current.clickMouse('left', 'up');
          isDraggingRef.current = false;
        }
        if (isDoubleClickDraggingRef.current) {
          wsRef.current.clickMouse('left', 'up');
          isDoubleClickDraggingRef.current = false;
          setIsDraggingSelection(false);
          Animated.timing(selectionOverlayAnim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }).start();
        }
        isDoubleTapHeldRef.current = false;
        lastPosRef.current = null;
        totalMovementRef.current = 0;
        twoFingerStartRef.current = null;
      },
```

- [ ] **Step 2: Commit**
```bash
git add apps/mobile/src/screens/TrackpadScreen.tsx
git commit -m "feat(trackpad): clean up double-click-drag state on gesture terminate"
```

---

### Task 6: Add the selection overlay to JSX and styles

**Files:**
- Modify: `apps/mobile/src/screens/TrackpadScreen.tsx`

- [ ] **Step 1: Add the overlay inside the gesture surface View**

Find:
```tsx
      {/* Gesture surface */}
      <View style={styles.surface} {...panResponder.panHandlers}>
        <Text style={styles.hint}>
          {orientation === 'portrait' ? 'Portrait' : orientation === 'landscape' ? 'Landscape ↺' : 'Landscape ↻'}{'  ·  '}Drag to move  ·  Tap to click
        </Text>
      </View>
```

Replace with:
```tsx
      {/* Gesture surface */}
      <View style={styles.surface} {...panResponder.panHandlers}>
        <Text style={styles.hint}>
          {orientation === 'portrait' ? 'Portrait' : orientation === 'landscape' ? 'Landscape ↺' : 'Landscape ↻'}{'  ·  '}Drag to move  ·  Tap to click
        </Text>
        <Animated.View
          style={[styles.selectionOverlay, { opacity: selectionOverlayAnim }]}
          pointerEvents="none"
        >
          <Text style={styles.selectionLabel}>Selecting...</Text>
        </Animated.View>
      </View>
```

- [ ] **Step 2: Add the two new styles to the StyleSheet**

Find:
```ts
  hint: {
    color: '#3A3A5C',
    fontSize: 13,
    textAlign: 'center',
  },
```

Replace with:
```ts
  hint: {
    color: '#3A3A5C',
    fontSize: 13,
    textAlign: 'center',
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 16,
  },
  selectionLabel: {
    color: 'rgba(59, 130, 246, 0.8)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
```

- [ ] **Step 3: Commit**
```bash
git add apps/mobile/src/screens/TrackpadScreen.tsx
git commit -m "feat(trackpad): add selection overlay with animated blue tint"
```

---

### Task 7: Manual verification

The PanResponder gesture system is tightly coupled to device hardware and cannot be meaningfully unit-tested in isolation. Verify by running on a physical device or simulator connected to the kdeck desktop agent.

- [ ] **Step 1: Start the mobile app**

```bash
cd apps/mobile
npx expo start
```

Open on a physical iOS or Android device (preferred over simulator for touch accuracy).

- [ ] **Step 2: Verify existing gestures are unchanged**

| Gesture | Expected result |
|---|---|
| Single-finger tap | Left click on PC |
| Two-finger tap | Right click on PC |
| Long press (500ms hold) + drag | Drag mode — mouse button held while moving |
| Two-finger pan | Scroll on PC |

All four must still work exactly as before.

- [ ] **Step 3: Verify double-click-drag (selection)**

1. Tap once quickly anywhere on the trackpad surface
2. Within 300ms, tap again and hold the second tap without lifting
3. While holding, drag your finger across the trackpad
4. **Expected on mobile:** blue tint appears over the trackpad surface with "Selecting..." label
5. **Expected on PC:** cursor moves while left mouse button is held — text or area is being selected
6. Lift finger
7. **Expected on mobile:** blue tint fades out
8. **Expected on PC:** mouse button releases, selection is complete

- [ ] **Step 4: Verify true double-click (no drag after second tap)**

1. Tap once quickly
2. Within 300ms, tap again and immediately lift (no drag)
3. **Expected on mobile:** no overlay appears
4. **Expected on PC:** two left-click events received (double-click) — e.g., selects a word in a text editor

- [ ] **Step 5: Verify 300ms window boundary**

1. Tap once
2. Wait more than 300ms
3. Tap again and drag
4. **Expected:** regular single-finger move (no double-click-drag engaged — no overlay, no mouse_down)

- [ ] **Step 6: Verify interruption handling**

1. Start a double-click-drag (blue overlay visible)
2. Trigger a system interruption (swipe up from bottom to show app switcher, or ask Siri)
3. **Expected:** blue overlay disappears and the PC does not have a stuck left mouse button (verify by moving the mouse normally on PC)
