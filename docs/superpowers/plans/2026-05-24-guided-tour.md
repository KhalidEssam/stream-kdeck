# Guided Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 6-step spotlight-overlay guided tour to KDeck mobile that auto-shows once on first connection and teaches users the main UI elements.

**Architecture:** A new `GuidedTour` component renders a full-screen transparent `Modal` containing a `react-native-svg` overlay with an evenodd fill-rule hole punched at each measured target element's position. `DeckScreen` holds six `useRef<View>` refs (one per tour target), triggers the tour once via AsyncStorage, and renders `<GuidedTour>` at the bottom of its JSX.

**Tech Stack:** React Native, `react-native-svg` (already installed at 15.12.1), `AsyncStorage`, `react-native-reanimated` (already installed — not used by the tour itself), TypeScript.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `apps/mobile/src/components/GuidedTour.helpers.ts` | Pure functions: `buildSpotlightPath`, `resolveTooltipStyle` |
| Create | `apps/mobile/src/components/__tests__/GuidedTour.helpers.test.ts` | Unit tests for the two pure functions |
| Create | `apps/mobile/src/components/GuidedTour.tsx` | Full React component: Modal + SVG overlay + tooltip + nav |
| Modify | `apps/mobile/src/components/PeekFab.tsx` | Add `tourRef` prop so DeckScreen can measure the FAB |
| Modify | `apps/mobile/src/screens/DeckScreen.tsx` | Six refs, `showTour` state, trigger, `handleTourDismiss`, render `<GuidedTour>` |

---

## Task 1: Add `tourRef` prop to PeekFab

**Files:**
- Modify: `apps/mobile/src/components/PeekFab.tsx`

The FAB is `position: absolute` so it can't be wrapped in a measuring View. Instead, expose a `tourRef` prop that gets attached to the outer `Animated.View`, giving `DeckScreen` a handle to measure it.

- [ ] **Step 1: Add `tourRef` to the Props interface**

In `apps/mobile/src/components/PeekFab.tsx`, update the Props interface (currently at line 18):

```tsx
interface Props {
  onPress: () => void;
  showBadge: boolean;
  tourRef?: React.RefObject<View>;
}
```

- [ ] **Step 2: Accept `tourRef` in the component signature and attach to outer `Animated.View`**

Update the function signature (line 23) and the returned JSX (line 124):

```tsx
export const PeekFab = forwardRef<PeekFabHandle, Props>(function PeekFab(
  { onPress, showBadge, tourRef },
  ref,
) {
```

Then on the outer `Animated.View` (the one that has `style={[styles.fab, ...]}`, currently line 124), add the ref:

```tsx
<Animated.View
  ref={tourRef as any}
  style={[
    styles.fab,
    { right: rightOffset, transform: [{ rotate: rotation }] },
  ]}
  accessibilityRole="button"
  accessibilityLabel="Add tile"
  {...panResponder.panHandlers}
>
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/PeekFab.tsx
git commit -m "feat(mobile): add tourRef prop to PeekFab for guided tour measurement"
```

---

## Task 2: Write failing tests for GuidedTour helpers

**Files:**
- Create: `apps/mobile/src/components/__tests__/GuidedTour.helpers.test.ts`

Write the tests before the implementation so we know exactly what the helpers must do.

- [ ] **Step 1: Create the test file**

Create `apps/mobile/src/components/__tests__/GuidedTour.helpers.test.ts`:

```typescript
import { buildSpotlightPath, resolveTooltipStyle } from '../GuidedTour.helpers';

const SCREEN = { width: 390, height: 844 };

describe('buildSpotlightPath', () => {
  it('returns a single closed path when rect is null', () => {
    const path = buildSpotlightPath(SCREEN, null);
    // One "Z" means one sub-path (full-screen rect, no hole)
    expect(path.split('Z').filter(Boolean)).toHaveLength(1);
    expect(path).toMatch(/^M0,0/);
  });

  it('returns two closed sub-paths when rect is provided', () => {
    const path = buildSpotlightPath(SCREEN, { x: 50, y: 100, width: 200, height: 80 });
    // Two "Z" means outer rect + inner hole
    expect(path.split('Z').filter(Boolean)).toHaveLength(2);
  });

  it('applies PADDING=10 to the hole coordinates', () => {
    // rect.x = 50, so hole starts at x = 50 - 10 = 40; with RADIUS=12 the first M is at 52
    const path = buildSpotlightPath(SCREEN, { x: 50, y: 100, width: 200, height: 80 });
    // x - PADDING + RADIUS = 50 - 10 + 12 = 52; y - PADDING = 90
    expect(path).toContain('M52,90');
  });

  it('full-screen path uses correct screen dimensions', () => {
    const path = buildSpotlightPath(SCREEN, null);
    expect(path).toContain(`H${SCREEN.width}`);
    expect(path).toContain(`V${SCREEN.height}`);
  });
});

describe('resolveTooltipStyle', () => {
  // rect at y=300, height=50 → spaceAbove = (300-10)-8 = 282, spaceBelow = 844-(300+50+10)-8 = 476
  const rectMiddle = { x: 10, y: 300, width: 100, height: 50 };

  // rect near top → spaceAbove = (50-10)-8 = 32 < 160
  const rectNearTop = { x: 10, y: 50, width: 100, height: 50 };

  // rect near bottom → spaceBelow = 844-(700+50+10)-8 = 76 < 160
  const rectNearBottom = { x: 10, y: 700, width: 100, height: 50 };

  it('returns bottom-anchored style when preferred=above and space is sufficient', () => {
    const style = resolveTooltipStyle(rectMiddle, 'above', SCREEN.height);
    expect(style).toHaveProperty('bottom');
    expect(style).not.toHaveProperty('top');
    expect(style.left).toBe(16);
    expect(style.right).toBe(16);
  });

  it('falls back to top-anchored style when preferred=above but space < 160', () => {
    const style = resolveTooltipStyle(rectNearTop, 'above', SCREEN.height);
    expect(style).toHaveProperty('top');
    expect(style).not.toHaveProperty('bottom');
  });

  it('returns top-anchored style when preferred=below and space is sufficient', () => {
    const style = resolveTooltipStyle(rectMiddle, 'below', SCREEN.height);
    expect(style).toHaveProperty('top');
    expect(style).not.toHaveProperty('bottom');
  });

  it('falls back to bottom-anchored style when preferred=below but space < 160', () => {
    const style = resolveTooltipStyle(rectNearBottom, 'below', SCREEN.height);
    expect(style).toHaveProperty('bottom');
    expect(style).not.toHaveProperty('top');
  });

  it('bottom value positions tooltip just above the spotlight', () => {
    // spaceAbove is sufficient; bottom = screenHeight - (rect.y - PADDING) + 8
    // = 844 - (300 - 10) + 8 = 844 - 290 + 8 = 562
    const style = resolveTooltipStyle(rectMiddle, 'above', SCREEN.height);
    expect(style.bottom).toBe(562);
  });

  it('top value positions tooltip just below the spotlight', () => {
    // top = rect.y + rect.height + PADDING + 8 = 300 + 50 + 10 + 8 = 368
    const style = resolveTooltipStyle(rectMiddle, 'below', SCREEN.height);
    expect(style.top).toBe(368);
  });
});
```

- [ ] **Step 2: Run the tests — confirm they all fail with "Cannot find module"**

```bash
cd apps/mobile && npx jest src/components/__tests__/GuidedTour.helpers.test.ts --no-coverage
```

Expected: all tests fail with `Cannot find module '../GuidedTour.helpers'`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add apps/mobile/src/components/__tests__/GuidedTour.helpers.test.ts
git commit -m "test(mobile): add failing tests for GuidedTour helper functions"
```

---

## Task 3: Implement GuidedTour helpers to make tests pass

**Files:**
- Create: `apps/mobile/src/components/GuidedTour.helpers.ts`

- [ ] **Step 1: Create the helpers file**

Create `apps/mobile/src/components/GuidedTour.helpers.ts`:

```typescript
export interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PADDING = 10;
const RADIUS = 12;
const TOOLTIP_CLEARANCE = 160;

/**
 * Builds an SVG path string with an evenodd fill-rule hole.
 * Outer path = full screen rectangle.
 * Inner path = rounded rectangle over the target element (with PADDING).
 * Result: screen is dark except for the spotlight cutout.
 */
export function buildSpotlightPath(
  screen: { width: number; height: number },
  rect: SpotlightRect | null,
): string {
  const { width: sw, height: sh } = screen;
  const outer = `M0,0 H${sw} V${sh} H0 Z`;
  if (!rect) return outer;

  const x = rect.x - PADDING;
  const y = rect.y - PADDING;
  const w = rect.width + PADDING * 2;
  const h = rect.height + PADDING * 2;
  const r = RADIUS;

  const hole =
    `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r}` +
    ` V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h}` +
    ` H${x + r} Q${x},${y + h} ${x},${y + h - r}` +
    ` V${y + r} Q${x},${y} ${x + r},${y} Z`;

  return `${outer} ${hole}`;
}

export type TooltipStyle =
  | { top: number; left: number; right: number }
  | { bottom: number; left: number; right: number };

/**
 * Returns absolute positioning style for the tooltip card.
 * Tries the preferred side; falls back to opposite if clearance < TOOLTIP_CLEARANCE.
 * "above" → bottom-anchored (tooltip sits above the spotlight).
 * "below" → top-anchored (tooltip sits below the spotlight).
 */
export function resolveTooltipStyle(
  rect: SpotlightRect,
  preferred: 'above' | 'below',
  screenHeight: number,
): TooltipStyle {
  const py = rect.y - PADDING;           // top of spotlight box
  const pyBottom = rect.y + rect.height + PADDING; // bottom of spotlight box

  const spaceAbove = py - 8;
  const spaceBelow = screenHeight - pyBottom - 8;

  const useAbove =
    preferred === 'above'
      ? spaceAbove >= TOOLTIP_CLEARANCE
      : spaceBelow < TOOLTIP_CLEARANCE;

  if (useAbove) {
    return { bottom: screenHeight - py + 8, left: 16, right: 16 };
  }
  return { top: pyBottom + 8, left: 16, right: 16 };
}
```

- [ ] **Step 2: Run tests — confirm all pass**

```bash
cd apps/mobile && npx jest src/components/__tests__/GuidedTour.helpers.test.ts --no-coverage
```

Expected: all 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/GuidedTour.helpers.ts
git commit -m "feat(mobile): implement GuidedTour spotlight path and tooltip positioning helpers"
```

---

## Task 4: Build the GuidedTour component

**Files:**
- Create: `apps/mobile/src/components/GuidedTour.tsx`

- [ ] **Step 1: Create the component**

Create `apps/mobile/src/components/GuidedTour.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  SpotlightRect,
  TooltipStyle,
  buildSpotlightPath,
  resolveTooltipStyle,
} from './GuidedTour.helpers';

export interface GuidedTourRefs {
  tileGrid: React.RefObject<View>;
  tabBar: React.RefObject<View>;
  fab: React.RefObject<View>;
  settings: React.RefObject<View>;
  plugins: React.RefObject<View>;
  contextStrip: React.RefObject<View>;
}

interface GuidedTourProps {
  visible: boolean;
  onDismiss: () => void;
  refs: GuidedTourRefs;
}

interface TourStep {
  targetKey: keyof GuidedTourRefs;
  title: string;
  body: string;
  preferredTooltipPosition: 'above' | 'below';
}

const TOUR_STEPS: TourStep[] = [
  {
    targetKey: 'tileGrid',
    title: 'Tap a tile to run it',
    body: "AI tools act on whatever's in your clipboard. Hold a tile to pin, remove, or customize its icon.",
    preferredTooltipPosition: 'above',
  },
  {
    targetKey: 'tabBar',
    title: 'Switch tabs to change context',
    body: 'AI Tools, Apps, and Media each show a different set of controls for your workflow.',
    preferredTooltipPosition: 'below',
  },
  {
    targetKey: 'fab',
    title: 'Add tiles from the + button',
    body: 'Swipe it in from the right edge, or tap it when expanded to open the tile picker.',
    preferredTooltipPosition: 'above',
  },
  {
    targetKey: 'settings',
    title: 'Customize your layout',
    body: 'Change tile grid size, rearrange your tiles, and manage keyboard shortcuts.',
    preferredTooltipPosition: 'below',
  },
  {
    targetKey: 'plugins',
    title: 'Extend with Plugins',
    body: 'Connect OBS, Spotify, and other apps to control them directly from your deck.',
    preferredTooltipPosition: 'below',
  },
  {
    targetKey: 'contextStrip',
    title: 'Context-aware shortcuts',
    body: 'This bar adapts to your active app. Add your own per-app keyboard shortcuts here.',
    preferredTooltipPosition: 'above',
  },
];

export function GuidedTour({ visible, onDismiss, refs }: GuidedTourProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const step = TOUR_STEPS[currentStep];

  // Measure the target element whenever the step changes or the tour becomes visible
  useEffect(() => {
    if (!visible) return;
    setSpotlightRect(null);
    const targetRef = refs[step.targetKey];
    // Small delay lets layout settle before measuring
    const timer = setTimeout(() => {
      targetRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
        setSpotlightRect({ x: pageX, y: pageY, width, height });
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [visible, currentStep, refs, step.targetKey]);

  // Fade in when spotlight rect is ready
  useEffect(() => {
    if (spotlightRect) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [spotlightRect, fadeAnim]);

  // Reset to step 0 when tour re-opens
  useEffect(() => {
    if (visible) setCurrentStep(0);
  }, [visible]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      fadeAnim.setValue(0);
      setCurrentStep((s) => s + 1);
    } else {
      onDismiss();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      fadeAnim.setValue(0);
      setCurrentStep((s) => s - 1);
    }
  };

  const svgPath = buildSpotlightPath({ width: screenWidth, height: screenHeight }, spotlightRect);

  let tooltipStyle: TooltipStyle | null = null;
  if (spotlightRect) {
    tooltipStyle = resolveTooltipStyle(
      spotlightRect,
      step.preferredTooltipPosition,
      screenHeight,
    );
  }

  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* SVG overlay — always rendered so the dark backdrop is immediate */}
        <Svg
          width={screenWidth}
          height={screenHeight}
          style={StyleSheet.absoluteFill}
        >
          <Path
            d={svgPath}
            fill="rgba(0,0,0,0.75)"
            fillRule="evenodd"
          />
        </Svg>

        {/* Skip button — top-right corner, always accessible */}
        <TouchableOpacity style={styles.skipBtn} onPress={onDismiss} activeOpacity={0.75}>
          <Text style={styles.skipBtnText}>Skip tour</Text>
        </TouchableOpacity>

        {/* Tooltip card — fades in after measurement */}
        {tooltipStyle && (
          <Animated.View
            style={[styles.tooltip, tooltipStyle, { opacity: fadeAnim }]}
            pointerEvents="box-none"
          >
            <Text style={styles.tooltipTitle}>{step.title}</Text>
            <Text style={styles.tooltipBody}>{step.body}</Text>

            <View style={styles.navRow}>
              <Text style={styles.stepLabel}>
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </Text>
              <View style={styles.navButtons}>
                {currentStep > 0 && (
                  <TouchableOpacity
                    style={styles.backBtn}
                    onPress={handleBack}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.backBtnText}>← Back</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.nextBtn}
                  onPress={handleNext}
                  activeOpacity={0.8}
                >
                  <Text style={styles.nextBtnText}>
                    {isLastStep ? 'Start using KDeck' : 'Next →'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  skipBtn: {
    position: 'absolute',
    top: 52,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  skipBtnText: {
    color: '#9898B0',
    fontSize: 13,
    fontWeight: '600',
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: '#1E1E30',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#5B4FE8',
    padding: 16,
  },
  tooltipTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  tooltipBody: {
    color: '#9898B0',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepLabel: {
    color: '#4A4A6A',
    fontSize: 12,
    fontWeight: '600',
  },
  navButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  backBtn: {
    backgroundColor: '#2A2A45',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtnText: {
    color: '#9898B0',
    fontSize: 13,
    fontWeight: '600',
  },
  nextBtn: {
    backgroundColor: '#5B4FE8',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/GuidedTour.tsx
git commit -m "feat(mobile): add GuidedTour spotlight overlay component"
```

---

## Task 5: Wire GuidedTour into DeckScreen

**Files:**
- Modify: `apps/mobile/src/screens/DeckScreen.tsx`

This task has several sub-steps. Apply them in order — each is a small, targeted edit.

- [ ] **Step 1: Add the GuidedTour import at the top of DeckScreen.tsx**

After the existing import for `OnboardingScreen` (line 41):

```tsx
import { GuidedTour } from '../components/GuidedTour';
```

- [ ] **Step 2: Add six measurement refs and `showTour` state**

After line 219 (`const doneBarAnim = useRef(new Animated.Value(0)).current;`), add:

```tsx
const tileGridRef = useRef<View>(null);
const tabBarRef = useRef<View>(null);
const fabRef = useRef<View>(null);
const settingsRef = useRef<View>(null);
const pluginsRef = useRef<View>(null);
const contextStripRef = useRef<View>(null);
const [showTour, setShowTour] = useState(false);
```

- [ ] **Step 3: Add the `handleTourDismiss` handler**

After the `handleOnboardingSkip` function (line 629–632):

```tsx
const handleTourDismiss = () => {
  void AsyncStorage.setItem('kdeck.tourSeen', 'true');
  setShowTour(false);
};
```

- [ ] **Step 4: Add the tour trigger inside the `onPackRegistry` handler**

The existing handler (lines 406–411) reads:

```tsx
const unsubscribePackRegistry = ws.onPackRegistry((msg: PackRegistryMessage) => {
  setPackRegistry(msg.packs);
  AsyncStorage.getItem('onboarded').then((val) => {
    if (!val && msg.packs.length > 0) setShowOnboarding(true);
  });
});
```

Replace it with:

```tsx
const unsubscribePackRegistry = ws.onPackRegistry((msg: PackRegistryMessage) => {
  setPackRegistry(msg.packs);
  AsyncStorage.getItem('onboarded').then((val) => {
    if (!val && msg.packs.length > 0) setShowOnboarding(true);
  });
  AsyncStorage.getItem('kdeck.tourSeen').then((val) => {
    if (!val) setShowTour(true);
  });
});
```

- [ ] **Step 5: Attach `pluginsRef` to the Plugins button**

Find the Plugins `TouchableOpacity` in the header (line 829):

```tsx
{status === 'connected' && (
  <TouchableOpacity onPress={() => setShowPluginLibrary(true)} style={styles.pluginsBtn} activeOpacity={0.75}>
    <Text style={styles.pluginsBtnText}>Plugins</Text>
  </TouchableOpacity>
)}
```

Add `ref={pluginsRef}`:

```tsx
{status === 'connected' && (
  <TouchableOpacity ref={pluginsRef} onPress={() => setShowPluginLibrary(true)} style={styles.pluginsBtn} activeOpacity={0.75}>
    <Text style={styles.pluginsBtnText}>Plugins</Text>
  </TouchableOpacity>
)}
```

- [ ] **Step 6: Attach `settingsRef` to the Settings button**

Find the Settings `TouchableOpacity` in the header (line 838):

```tsx
{wsService && !rearrangeMode && (
  <TouchableOpacity onPress={() => setShowSettings(true)} style={{ paddingHorizontal: 8 }} activeOpacity={0.7}>
    <Text style={{ color: '#6B6B8A', fontSize: 18 }}>⚙</Text>
  </TouchableOpacity>
)}
```

Add `ref={settingsRef}`:

```tsx
{wsService && !rearrangeMode && (
  <TouchableOpacity ref={settingsRef} onPress={() => setShowSettings(true)} style={{ paddingHorizontal: 8 }} activeOpacity={0.7}>
    <Text style={{ color: '#6B6B8A', fontSize: 18 }}>⚙</Text>
  </TouchableOpacity>
)}
```

- [ ] **Step 7: Attach `tabBarRef` to the tab bar container**

Find `<View style={styles.tabBar}>` (line 875). Add the ref:

```tsx
<View ref={tabBarRef} style={styles.tabBar}>
```

- [ ] **Step 8: Attach `tileGridRef` to the tile grid container**

Find `<View style={styles.tileGridContainer}>` (line 922). Add the ref:

```tsx
<View ref={tileGridRef} style={styles.tileGridContainer}>
```

- [ ] **Step 9: Pass `fabRef` to PeekFab**

Find the `<PeekFab>` render (line 971):

```tsx
{!rearrangeMode && (
  <PeekFab
    ref={peekFabRef}
    onPress={() => handleOpenAddTile()}
    showBadge={!!packRegistry?.length}
  />
)}
```

Add `tourRef={fabRef}`:

```tsx
{!rearrangeMode && (
  <PeekFab
    ref={peekFabRef}
    tourRef={fabRef}
    onPress={() => handleOpenAddTile()}
    showBadge={!!packRegistry?.length}
  />
)}
```

- [ ] **Step 10: Wrap `ContextStrip` with a measuring View**

Find `<ContextStrip ...>` (line 1202):

```tsx
<ContextStrip
  msg={contextMsg}
  globalTiles={globalShortcutTiles}
  onTapShortcut={handleContextShortcutTap}
  onTapGlobalTile={handleTap}
  onAddShortcut={handleAddContextShortcut}
  onAddGlobal={() => handleOpenAddTile()}
/>
```

Wrap it:

```tsx
<View ref={contextStripRef} pointerEvents="box-none">
  <ContextStrip
    msg={contextMsg}
    globalTiles={globalShortcutTiles}
    onTapShortcut={handleContextShortcutTap}
    onTapGlobalTile={handleTap}
    onAddShortcut={handleAddContextShortcut}
    onAddGlobal={() => handleOpenAddTile()}
  />
</View>
```

- [ ] **Step 11: Render `<GuidedTour>` in the JSX**

Find the Onboarding Modal (line 1211):

```tsx
<Modal visible={showOnboarding} animationType="slide">
  <OnboardingScreen
```

Add `<GuidedTour>` immediately before it:

```tsx
<GuidedTour
  visible={showTour}
  onDismiss={handleTourDismiss}
  refs={{
    tileGrid: tileGridRef,
    tabBar: tabBarRef,
    fab: fabRef,
    settings: settingsRef,
    plugins: pluginsRef,
    contextStrip: contextStripRef,
  }}
/>

<Modal visible={showOnboarding} animationType="slide">
  <OnboardingScreen
```

- [ ] **Step 12: Verify TypeScript compiles with no errors**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 13: Run all existing tests to confirm no regressions**

```bash
cd apps/mobile && npx jest --no-coverage
```

Expected: all previously passing tests still pass.

- [ ] **Step 14: Manual smoke test**

1. Clear the tour flag so it fires: `AsyncStorage.removeItem('kdeck.tourSeen')` — either via a temporary `console.log` in `useEffect` or by clearing app data in device settings.
2. Launch the app and connect to the agent.
3. Confirm the tour overlay appears automatically once tiles load.
4. Tap "Next →" through all 6 steps. Verify:
   - Each step spotlights the correct element (tile grid → tabs → FAB → settings icon → plugins button → context strip)
   - Tooltip title and body match the spec table
   - "← Back" is absent on step 1, present on steps 2–6
   - "Next →" becomes "Start using KDeck" on step 6
   - Tapping "Start using KDeck" dismisses the tour
5. Restart the app. Confirm the tour does **not** appear again.
6. Test "Skip tour" button on step 2. Confirm it dismisses immediately and does not reappear on next launch.

- [ ] **Step 15: Commit**

```bash
git add apps/mobile/src/screens/DeckScreen.tsx
git commit -m "feat(mobile): wire GuidedTour into DeckScreen — auto-shows once after first connection"
```
