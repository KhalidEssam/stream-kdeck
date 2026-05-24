# Guided Tour — Design Spec

**Date:** 2026-05-24  
**Status:** Approved  

---

## Overview

A first-run guided tour for the KDeck mobile app. Highlights the six main UI elements with a spotlight overlay so new users understand what everything does before they start tapping.

---

## Trigger

- Auto-shows **once** after the user lands on the main `DeckScreen` and tiles have loaded.
- Trigger condition: `AsyncStorage.getItem('kdeck.tourSeen')` returns null.
- Checked inside the `onPackRegistry` handler in `DeckScreen`, after `setTiles` is called and the user is connected and licensed.
- On dismiss (skip or finish): `AsyncStorage.setItem('kdeck.tourSeen', 'true')`.
- The tour does **not** auto-show again after the first time. (Future: re-launch from Settings is out of scope for this spec.)

---

## Format

**Spotlight overlay** — a full-screen `Modal` with a darkened SVG layer containing a rounded-rect hole punched over the target element. A tooltip card floats above or below the hole. The real app UI is visible but non-interactive while the tour is active.

---

## Tour Steps (6)

Each step has a **preferred** tooltip position. The component auto-flips to the opposite side if the preferred side has less than 160px of clearance from the screen edge.

| # | Target element | Tooltip title | Tooltip body | Preferred position |
|---|---------------|---------------|-------------|-----------------|
| 1 | Tile grid | "Tap a tile to run it" | "AI tools act on whatever's in your clipboard. Hold a tile to pin, remove, or customize its icon." | above |
| 2 | Tab bar | "Switch tabs to change context" | "AI Tools, Apps, and Media each show a different set of controls for your workflow." | below |
| 3 | PeekFab (+) | "Add tiles from the + button" | "Swipe it in from the right edge, or tap it when expanded to open the tile picker." | above |
| 4 | Settings (⚙) | "Customize your layout" | "Change tile grid size, rearrange your tiles, and manage keyboard shortcuts." | below |
| 5 | Plugins button | "Extend with Plugins" | "Connect OBS, Spotify, and other apps to control them directly from your deck." | below |
| 6 | Context strip | "Context-aware shortcuts" | "This bar adapts to your active app. Add your own per-app keyboard shortcuts here." | above |

---

## Navigation Controls

Every step shows:
- **Skip tour** (left, ghost text) — dismisses immediately, marks as seen
- **Step N of 6** (center, muted label)
- **← Back** (left of Next, disabled on step 1) — goes to previous step
- **Next →** (right, primary button) — advances to next step
- On step 6: "Next →" becomes **"Start using KDeck"** — dismisses and marks as seen

---

## Component Architecture

### New file: `apps/mobile/src/components/GuidedTour.tsx`

```ts
interface GuidedTourProps {
  visible: boolean;
  onDismiss: () => void;
  refs: {
    tileGrid: React.RefObject<View>;
    tabBar: React.RefObject<View>;
    fab: React.RefObject<View>;
    settings: React.RefObject<View>;
    plugins: React.RefObject<View>;
    contextStrip: React.RefObject<View>;
  };
}
```

**Internal state:**
- `currentStep: number` (0–5)
- `spotlightRect: { x, y, width, height } | null` — measured position of current target

**Rendering:**
1. A full-screen `Modal` (`animationType="fade"`, `transparent`).
2. An `Svg` filling the screen using the `evenodd` fill rule:
   - Outer path: full screen rectangle
   - Inner path: rounded rectangle at `spotlightRect` position with 12px radius and 10px padding on all sides
   - Fill: `rgba(0, 0, 0, 0.75)`
3. A tooltip `View` positioned absolutely:
   - Placed above the spotlight if `tooltipPosition === 'above'` and there is enough space (≥ 160px above); otherwise below.
   - Contains: title (`fontWeight: 700`, white), body (muted), navigation row.
4. A "Skip tour" `TouchableOpacity` in the top-right corner, always visible.

**Measuring targets:**
- On each step change, call `refs[currentTarget].current?.measure((x, y, w, h, pageX, pageY) => setSpotlightRect({ x: pageX, y: pageY, width: w, height: h }))`.
- Re-measure on layout changes (pass `onLayout` down or re-run inside a `useEffect` on `currentStep`).
- While `spotlightRect` is null (measuring in progress), show the overlay without a hole.

**Animations:**
- Spotlight rect transitions use `Animated.spring` on `x`, `y`, `width`, `height` values so the hole smoothly moves between steps.
- Tooltip fades with `Animated.timing` on opacity (150ms).

---

### Changes to `DeckScreen.tsx`

1. Add six `useRef<View>(null)` refs: `tileGridRef`, `tabBarRef`, `fabRef`, `settingsRef`, `pluginsRef`, `contextStripRef`.
2. Attach each ref to the outermost `View` of its target element via the `ref` prop.
3. Add `showTour: boolean` state, default `false`.
4. In the `onPackRegistry` handler (after `setPackRegistry`), add:
   ```ts
   AsyncStorage.getItem('kdeck.tourSeen').then((val) => {
     if (!val) setShowTour(true);
   });
   ```
5. Add `handleTourDismiss`:
   ```ts
   const handleTourDismiss = () => {
     void AsyncStorage.setItem('kdeck.tourSeen', 'true');
     setShowTour(false);
   };
   ```
6. Render `<GuidedTour>` at the bottom of the JSX (above the onboarding Modal):
   ```tsx
   <GuidedTour
     visible={showTour}
     onDismiss={handleTourDismiss}
     refs={{ tileGrid: tileGridRef, tabBar: tabBarRef, fab: fabRef,
             settings: settingsRef, plugins: pluginsRef, contextStrip: contextStripRef }}
   />
   ```

---

## Dependencies

- `react-native-svg` — for the spotlight hole. Check if already in the project before adding; if absent, install with `npx expo install react-native-svg`.

---

## Out of Scope

- Re-launching the tour from Settings (can be added later by calling `AsyncStorage.removeItem('kdeck.tourSeen')` and setting `showTour: true`).
- Haptic feedback on step transitions.
- Tour for the Trackpad screen or any other modal screens.
