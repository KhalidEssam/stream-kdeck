# Mobile Trackpad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the mobile phone into a wireless desktop trackpad — relative cursor movement, left/right click, two-finger scroll, long-press drag, and a floating keyboard toggle that sends keystrokes through the existing `KeystrokeService`.

**Architecture:** Three new WebSocket message types (`MOUSE_MOVE`, `MOUSE_CLICK`, `MOUSE_SCROLL`) are added to the shared schema. A new `MouseService` in the agent uses `@nut-tree-fork/nut-js` (already installed) to control the OS cursor. A new `TrackpadScreen` in the mobile app captures gestures with React Native's built-in `PanResponder` and opens as a full-screen Modal from `DeckScreen`.

**Tech Stack:** `@nut-tree-fork/nut-js` (mouse API), React Native `PanResponder` (gesture capture), `@react-native-async-storage/async-storage` (sensitivity persistence), `TextInput` hidden focus trick (keyboard capture), NestJS `@Injectable` service pattern, `jest-websocket-mock` (mobile tests), `@nestjs/testing` + ts-jest (agent tests).

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `apps/agent/src/mouse/mouse.service.ts` | nut-js mouse control: move, click, scroll, macOS permission check |
| `apps/agent/src/mouse/mouse.module.ts` | NestJS module exporting MouseService |
| `apps/agent/tests/mouse.service.test.ts` | Unit tests for MouseService (nut-js mocked) |
| `apps/mobile/src/screens/TrackpadScreen.tsx` | Full-screen gesture surface, sensitivity control, keyboard toggle |

### Modified files
| File | Change |
|---|---|
| `packages/shared/src/schema.ts` | Add `MouseMoveMessage`, `MouseClickMessage`, `MouseScrollMessage`; update `MobileMessage` union |
| `apps/agent/src/app.module.ts` | Import `MouseModule` |
| `apps/agent/src/websocket/ws.gateway.ts` | Inject `MouseService`; handle `MOUSE_MOVE`, `MOUSE_CLICK`, `MOUSE_SCROLL` |
| `apps/agent/tests/ws.gateway.test.ts` | Mock `MouseService`; add mouse message handler tests |
| `apps/mobile/src/services/websocket.service.ts` | Add `moveMouse()`, `clickMouse()`, `scrollMouse()` send methods |
| `apps/mobile/src/services/__tests__/websocket.service.test.ts` | Add tests for the 3 new send methods |
| `apps/mobile/src/screens/DeckScreen.tsx` | Add mouse icon button in header; add TrackpadScreen Modal |

---

## Task 1: Shared Schema — Add Mouse Message Types

**Files:**
- Modify: `packages/shared/src/schema.ts`

- [ ] **Step 1: Add the three new message interfaces and update MobileMessage**

  Open `packages/shared/src/schema.ts` and add after the last context-aware deck message (before the `AgentMessage` union at line 166):

  ```ts
  // --- Trackpad / mouse messages ---

  export interface MouseMoveMessage {
    type: 'MOUSE_MOVE';
    dx: number;  // pixel delta, sensitivity already applied on mobile
    dy: number;
  }

  export interface MouseClickMessage {
    type: 'MOUSE_CLICK';
    button: 'left' | 'right' | 'middle';
    action: 'click' | 'down' | 'up';
  }

  export interface MouseScrollMessage {
    type: 'MOUSE_SCROLL';
    dx: number;
    dy: number;
  }
  ```

  Then update the `MobileMessage` union (currently ends at line 188):

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
    | MouseScrollMessage;
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd packages/shared && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/shared/src/schema.ts
  git commit -m "feat(schema): add MOUSE_MOVE, MOUSE_CLICK, MOUSE_SCROLL message types"
  ```

---

## Task 2: Agent — MouseService (TDD)

**Files:**
- Create: `apps/agent/src/mouse/mouse.service.ts`
- Create: `apps/agent/tests/mouse.service.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `apps/agent/tests/mouse.service.test.ts`:

  ```ts
  import { Test } from '@nestjs/testing';
  import { MouseService } from '../src/mouse/mouse.service';

  jest.mock('@nut-tree-fork/nut-js', () => ({
    mouse: {
      getPosition: jest.fn().mockResolvedValue({ x: 100, y: 200 }),
      setPosition: jest.fn().mockResolvedValue(undefined),
      click:         jest.fn().mockResolvedValue(undefined),
      pressButton:   jest.fn().mockResolvedValue(undefined),
      releaseButton: jest.fn().mockResolvedValue(undefined),
      scrollUp:    jest.fn().mockResolvedValue(undefined),
      scrollDown:  jest.fn().mockResolvedValue(undefined),
      scrollLeft:  jest.fn().mockResolvedValue(undefined),
      scrollRight: jest.fn().mockResolvedValue(undefined),
    },
    Button: { LEFT: 'LEFT', RIGHT: 'RIGHT', MIDDLE: 'MIDDLE' },
    Point:  jest.fn().mockImplementation((x: number, y: number) => ({ x, y })),
  }));

  import { mouse, Button, Point } from '@nut-tree-fork/nut-js';
  const mockedMouse = mouse as jest.Mocked<typeof mouse>;
  const MockedPoint = Point as jest.MockedClass<typeof Point>;

  describe('MouseService', () => {
    let service: MouseService;

    beforeEach(async () => {
      jest.clearAllMocks();
      const module = await Test.createTestingModule({
        providers: [MouseService],
      }).compile();
      service = module.get(MouseService);
    });

    describe('moveMouse', () => {
      it('applies delta to current position and calls setPosition', async () => {
        await service.moveMouse(10, -5);
        expect(mockedMouse.getPosition).toHaveBeenCalled();
        expect(MockedPoint).toHaveBeenCalledWith(110, 195);
        expect(mockedMouse.setPosition).toHaveBeenCalledWith({ x: 110, y: 195 });
      });

      it('does nothing when both deltas are zero', async () => {
        await service.moveMouse(0, 0);
        expect(mockedMouse.setPosition).not.toHaveBeenCalled();
      });
    });

    describe('clickMouse', () => {
      it('calls mouse.click with Button.LEFT for left click action', async () => {
        await service.clickMouse('left', 'click');
        expect(mockedMouse.click).toHaveBeenCalledWith(Button.LEFT);
      });

      it('calls mouse.pressButton with Button.RIGHT for right down action', async () => {
        await service.clickMouse('right', 'down');
        expect(mockedMouse.pressButton).toHaveBeenCalledWith(Button.RIGHT);
      });

      it('calls mouse.releaseButton with Button.LEFT for left up action', async () => {
        await service.clickMouse('left', 'up');
        expect(mockedMouse.releaseButton).toHaveBeenCalledWith(Button.LEFT);
      });

      it('calls mouse.click with Button.MIDDLE for middle click action', async () => {
        await service.clickMouse('middle', 'click');
        expect(mockedMouse.click).toHaveBeenCalledWith(Button.MIDDLE);
      });
    });

    describe('scrollMouse', () => {
      it('scrolls up when dy is negative', async () => {
        await service.scrollMouse(0, -3);
        expect(mockedMouse.scrollUp).toHaveBeenCalledWith(3);
        expect(mockedMouse.scrollDown).not.toHaveBeenCalled();
      });

      it('scrolls down when dy is positive', async () => {
        await service.scrollMouse(0, 4);
        expect(mockedMouse.scrollDown).toHaveBeenCalledWith(4);
      });

      it('scrolls left when dx is negative', async () => {
        await service.scrollMouse(-2, 0);
        expect(mockedMouse.scrollLeft).toHaveBeenCalledWith(2);
      });

      it('scrolls right when dx is positive', async () => {
        await service.scrollMouse(5, 0);
        expect(mockedMouse.scrollRight).toHaveBeenCalledWith(5);
      });

      it('scrolls both axes when both deltas are non-zero', async () => {
        await service.scrollMouse(3, -2);
        expect(mockedMouse.scrollRight).toHaveBeenCalledWith(3);
        expect(mockedMouse.scrollUp).toHaveBeenCalledWith(2);
      });

      it('does nothing when both deltas are zero', async () => {
        await service.scrollMouse(0, 0);
        expect(mockedMouse.scrollUp).not.toHaveBeenCalled();
        expect(mockedMouse.scrollDown).not.toHaveBeenCalled();
      });
    });
  });
  ```

- [ ] **Step 2: Run tests — verify they fail with "Cannot find module"**

  ```bash
  cd apps/agent && npx jest tests/mouse.service.test.ts --no-coverage
  ```

  Expected: FAIL — `Cannot find module '../src/mouse/mouse.service'`

- [ ] **Step 3: Implement MouseService**

  Create `apps/agent/src/mouse/mouse.service.ts`:

  ```ts
  import { Injectable } from '@nestjs/common';
  import { mouse, Button, Point } from '@nut-tree-fork/nut-js';

  @Injectable()
  export class MouseService {
    async moveMouse(dx: number, dy: number): Promise<void> {
      if (dx === 0 && dy === 0) return;
      const pos = await mouse.getPosition();
      await mouse.setPosition(new Point(pos.x + dx, pos.y + dy));
    }

    async clickMouse(
      button: 'left' | 'right' | 'middle',
      action: 'click' | 'down' | 'up',
    ): Promise<void> {
      const btn =
        button === 'left'   ? Button.LEFT  :
        button === 'right'  ? Button.RIGHT :
                              Button.MIDDLE;

      if (action === 'click')  await mouse.click(btn);
      else if (action === 'down')  await mouse.pressButton(btn);
      else                         await mouse.releaseButton(btn);
    }

    async scrollMouse(dx: number, dy: number): Promise<void> {
      if (dy < 0) await mouse.scrollUp(Math.abs(dy));
      else if (dy > 0) await mouse.scrollDown(dy);

      if (dx < 0) await mouse.scrollLeft(Math.abs(dx));
      else if (dx > 0) await mouse.scrollRight(dx);
    }
  }
  ```

- [ ] **Step 4: Run tests — verify they pass**

  ```bash
  cd apps/agent && npx jest tests/mouse.service.test.ts --no-coverage
  ```

  Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/agent/src/mouse/mouse.service.ts apps/agent/tests/mouse.service.test.ts
  git commit -m "feat(agent): add MouseService with nut-js mouse control"
  ```

---

## Task 3: Agent — MouseModule + AppModule Wiring

**Files:**
- Create: `apps/agent/src/mouse/mouse.module.ts`
- Modify: `apps/agent/src/app.module.ts`

- [ ] **Step 1: Create MouseModule**

  Create `apps/agent/src/mouse/mouse.module.ts`:

  ```ts
  import { Module } from '@nestjs/common';
  import { MouseService } from './mouse.service';

  @Module({
    providers: [MouseService],
    exports: [MouseService],
  })
  export class MouseModule {}
  ```

- [ ] **Step 2: Import MouseModule into AppModule**

  Edit `apps/agent/src/app.module.ts`. Change the imports array from:

  ```ts
  imports: [LicenseModule, NetworkModule, ContextModule],
  ```

  to:

  ```ts
  imports: [LicenseModule, NetworkModule, ContextModule, MouseModule],
  ```

  And add the import at the top:

  ```ts
  import { MouseModule } from './mouse/mouse.module';
  ```

- [ ] **Step 3: Verify the agent TypeScript compiles**

  ```bash
  cd apps/agent && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/agent/src/mouse/mouse.module.ts apps/agent/src/app.module.ts
  git commit -m "feat(agent): add MouseModule and wire into AppModule"
  ```

---

## Task 4: Agent — WsGateway Mouse Handlers

**Files:**
- Modify: `apps/agent/src/websocket/ws.gateway.ts`
- Modify: `apps/agent/tests/ws.gateway.test.ts`

- [ ] **Step 1: Add the MouseService mock and mouse handler tests to the gateway test file**

  Open `apps/agent/tests/ws.gateway.test.ts`. At the top, add the nut-js mock (same pattern as keystroke.service.test.ts). Add it right after the existing `jest.mock('active-win', ...)` line:

  ```ts
  jest.mock('@nut-tree-fork/nut-js', () => ({
    mouse: {
      getPosition:   jest.fn().mockResolvedValue({ x: 0, y: 0 }),
      setPosition:   jest.fn().mockResolvedValue(undefined),
      click:         jest.fn().mockResolvedValue(undefined),
      pressButton:   jest.fn().mockResolvedValue(undefined),
      releaseButton: jest.fn().mockResolvedValue(undefined),
      scrollUp:    jest.fn().mockResolvedValue(undefined),
      scrollDown:  jest.fn().mockResolvedValue(undefined),
      scrollLeft:  jest.fn().mockResolvedValue(undefined),
      scrollRight: jest.fn().mockResolvedValue(undefined),
    },
    Button: { LEFT: 'LEFT', RIGHT: 'RIGHT', MIDDLE: 'MIDDLE' },
    Point:  jest.fn().mockImplementation((x: number, y: number) => ({ x, y })),
  }));
  ```

  Then import `mouse` from nut-js after the mock:

  ```ts
  import { mouse } from '@nut-tree-fork/nut-js';
  const mockedMouse = mouse as jest.Mocked<typeof mouse>;
  ```

  Add these tests inside the `describe('WsGateway', ...)` block, after the existing tests:

  ```ts
  it('moves mouse when MOUSE_MOVE is received', (done) => {
    const ws = new WebSocket('ws://localhost:3099');

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'MOUSE_MOVE', dx: 5, dy: -3 }));
      setTimeout(() => {
        expect(mockedMouse.setPosition).toHaveBeenCalled();
        ws.close();
        done();
      }, 100);
    });

    // drain handshake messages
    ws.on('message', () => {});
  });

  it('clicks mouse when MOUSE_CLICK is received', (done) => {
    const ws = new WebSocket('ws://localhost:3099');

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'MOUSE_CLICK', button: 'left', action: 'click' }));
      setTimeout(() => {
        expect(mockedMouse.click).toHaveBeenCalled();
        ws.close();
        done();
      }, 100);
    });

    ws.on('message', () => {});
  });

  it('scrolls mouse when MOUSE_SCROLL is received', (done) => {
    const ws = new WebSocket('ws://localhost:3099');

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'MOUSE_SCROLL', dx: 0, dy: 2 }));
      setTimeout(() => {
        expect(mockedMouse.scrollDown).toHaveBeenCalledWith(2);
        ws.close();
        done();
      }, 100);
    });

    ws.on('message', () => {});
  });
  ```

- [ ] **Step 2: Run gateway tests — verify the new tests fail**

  ```bash
  cd apps/agent && npx jest tests/ws.gateway.test.ts --no-coverage
  ```

  Expected: the 3 new mouse tests FAIL (mouse methods not called — handlers not wired yet). Existing tests pass.

- [ ] **Step 3: Add mouse handlers to WsGateway**

  Open `apps/agent/src/websocket/ws.gateway.ts`.

  Add the import at the top:

  ```ts
  import { MouseService } from '../mouse/mouse.service';
  import { MouseMoveMessage, MouseClickMessage, MouseScrollMessage } from '@control-surface/shared';
  ```

  Add `MouseService` to the constructor (after `contextProfile`):

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
  ) {
  ```

  Inside `client.on('message', async (raw) => { ... })`, add the three handlers **before** the `if (data.type !== 'BUTTON_TAP') return;` line at the bottom:

  ```ts
  if (data.type === 'MOUSE_MOVE') {
    const d = data as MouseMoveMessage;
    await this.mouseService.moveMouse(d.dx, d.dy);
    return;
  }

  if (data.type === 'MOUSE_CLICK') {
    const d = data as MouseClickMessage;
    await this.mouseService.clickMouse(d.button, d.action);
    return;
  }

  if (data.type === 'MOUSE_SCROLL') {
    const d = data as MouseScrollMessage;
    await this.mouseService.scrollMouse(d.dx, d.dy);
    return;
  }
  ```

- [ ] **Step 4: Run all agent tests — verify they pass**

  ```bash
  cd apps/agent && npx jest --no-coverage
  ```

  Expected: all tests pass including the 3 new mouse gateway tests.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/agent/src/websocket/ws.gateway.ts apps/agent/tests/ws.gateway.test.ts
  git commit -m "feat(agent): handle MOUSE_MOVE, MOUSE_CLICK, MOUSE_SCROLL in WsGateway"
  ```

---

## Task 5: Mobile — WebSocketService Mouse Methods + Tests

**Files:**
- Modify: `apps/mobile/src/services/websocket.service.ts`
- Modify: `apps/mobile/src/services/__tests__/websocket.service.test.ts`

- [ ] **Step 1: Write the failing tests**

  Open `apps/mobile/src/services/__tests__/websocket.service.test.ts`. Add these three tests inside the existing `describe('WebSocketService', ...)` block, before the closing `});`:

  ```ts
  it('sends MOUSE_MOVE when moveMouse() is called', async () => {
    service.moveMouse(10, -5);
    await expect(server).toReceiveMessage(
      JSON.stringify({ type: 'MOUSE_MOVE', dx: 10, dy: -5 }),
    );
  });

  it('sends MOUSE_CLICK when clickMouse() is called', async () => {
    service.clickMouse('right', 'click');
    await expect(server).toReceiveMessage(
      JSON.stringify({ type: 'MOUSE_CLICK', button: 'right', action: 'click' }),
    );
  });

  it('sends MOUSE_SCROLL when scrollMouse() is called', async () => {
    service.scrollMouse(0, 3);
    await expect(server).toReceiveMessage(
      JSON.stringify({ type: 'MOUSE_SCROLL', dx: 0, dy: 3 }),
    );
  });
  ```

- [ ] **Step 2: Run tests — verify the 3 new tests fail**

  ```bash
  cd apps/mobile && npx jest src/services/__tests__/websocket.service.test.ts --no-coverage
  ```

  Expected: the 3 new tests FAIL with `service.moveMouse is not a function`.

- [ ] **Step 3: Add the three send methods to WebSocketService**

  Open `apps/mobile/src/services/websocket.service.ts`. Add these three methods after `requestContextProfiles()` (around line 164):

  ```ts
  moveMouse(dx: number, dy: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: MouseMoveMessage = { type: 'MOUSE_MOVE', dx, dy };
    this.ws.send(JSON.stringify(msg));
  }

  clickMouse(button: 'left' | 'right' | 'middle', action: 'click' | 'down' | 'up'): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: MouseClickMessage = { type: 'MOUSE_CLICK', button, action };
    this.ws.send(JSON.stringify(msg));
  }

  scrollMouse(dx: number, dy: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: MouseScrollMessage = { type: 'MOUSE_SCROLL', dx, dy };
    this.ws.send(JSON.stringify(msg));
  }
  ```

  Add the three new type imports at the top of the file with the other imports from `'../types/schema'`:

  ```ts
  import {
    // ... existing imports ...
    MouseMoveMessage,
    MouseClickMessage,
    MouseScrollMessage,
  } from '../types/schema';
  ```

  Note: `apps/mobile/src/types/schema.ts` re-exports from `@control-surface/shared` — verify this file exists and add the re-exports there if they are missing. The file is at `apps/mobile/src/types/schema.ts`.

- [ ] **Step 4: Check and update the mobile types re-export**

  Read `apps/mobile/src/types/schema.ts`. If it exports everything with `export * from '@control-surface/shared'` you're done. If it has named exports, add:

  ```ts
  export type { MouseMoveMessage, MouseClickMessage, MouseScrollMessage } from '@control-surface/shared';
  ```

- [ ] **Step 5: Run tests — verify all pass**

  ```bash
  cd apps/mobile && npx jest src/services/__tests__/websocket.service.test.ts --no-coverage
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/mobile/src/services/websocket.service.ts \
          apps/mobile/src/services/__tests__/websocket.service.test.ts \
          apps/mobile/src/types/schema.ts
  git commit -m "feat(mobile): add moveMouse, clickMouse, scrollMouse to WebSocketService"
  ```

---

## Task 6: Mobile — TrackpadScreen

**Files:**
- Create: `apps/mobile/src/screens/TrackpadScreen.tsx`

This screen is a full-screen dark surface. Gestures are captured with React Native's built-in `PanResponder`. The sensitivity is controlled with `+` / `−` step buttons (no new dependency). A hidden `TextInput` captures keyboard input.

- [ ] **Step 1: Create TrackpadScreen**

  Create `apps/mobile/src/screens/TrackpadScreen.tsx`:

  ```tsx
  import React, { useRef, useState, useEffect, useCallback } from 'react';
  import {
    View,
    Text,
    StyleSheet,
    PanResponder,
    TouchableOpacity,
    TextInput,
    StatusBar,
    GestureResponderEvent,
    PanResponderGestureState,
  } from 'react-native';
  import { SafeAreaView } from 'react-native-safe-area-context';
  import AsyncStorage from '@react-native-async-storage/async-storage';
  import { WebSocketService } from '../services/websocket.service';

  const SENSITIVITY_KEY = 'trackpad_sensitivity';
  const SENSITIVITY_MIN = 0.3;
  const SENSITIVITY_MAX = 3.0;
  const SENSITIVITY_STEP = 0.1;
  const SENSITIVITY_DEFAULT = 1.0;
  const THROTTLE_MS = 16;
  const TAP_MOVEMENT_THRESHOLD = 5;
  const LONG_PRESS_DELAY_MS = 500;

  interface Props {
    ws: WebSocketService;
    onDismiss: () => void;
  }

  export function TrackpadScreen({ ws, onDismiss }: Props) {
    const [sensitivity, setSensitivity] = useState(SENSITIVITY_DEFAULT);
    const [showKeyboard, setShowKeyboard] = useState(false);
    const keyboardInputRef = useRef<TextInput>(null);

    // Gesture state refs (not state — no re-render on each frame)
    const lastPosRef = useRef<{ x: number; y: number } | null>(null);
    const totalMovementRef = useRef(0);
    const lastSentRef = useRef(0);
    const isDraggingRef = useRef(false);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const twoFingerStartRef = useRef<{ x: number; y: number } | null>(null);
    const sensitivityRef = useRef(SENSITIVITY_DEFAULT);

    useEffect(() => {
      AsyncStorage.getItem(SENSITIVITY_KEY).then((val) => {
        if (val !== null) {
          const parsed = parseFloat(val);
          if (!isNaN(parsed)) {
            setSensitivity(parsed);
            sensitivityRef.current = parsed;
          }
        }
      });
    }, []);

    const updateSensitivity = useCallback((next: number) => {
      const clamped = Math.round(Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, next)) * 10) / 10;
      setSensitivity(clamped);
      sensitivityRef.current = clamped;
      AsyncStorage.setItem(SENSITIVITY_KEY, String(clamped));
    }, []);

    const cancelLongPress = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderGrant: (evt: GestureResponderEvent) => {
          const touches = evt.nativeEvent.touches;
          totalMovementRef.current = 0;
          twoFingerStartRef.current = null;

          if (touches.length === 1) {
            lastPosRef.current = { x: touches[0].pageX, y: touches[0].pageY };

            // Start long-press timer for drag detection
            longPressTimerRef.current = setTimeout(() => {
              if (totalMovementRef.current < TAP_MOVEMENT_THRESHOLD) {
                isDraggingRef.current = true;
                ws.clickMouse('left', 'down');
              }
              longPressTimerRef.current = null;
            }, LONG_PRESS_DELAY_MS);
          }
        },

        onPanResponderMove: (evt: GestureResponderEvent) => {
          const touches = evt.nativeEvent.touches;
          const now = Date.now();

          if (touches.length === 2) {
            cancelLongPress();
            const centerX = (touches[0].pageX + touches[1].pageX) / 2;
            const centerY = (touches[0].pageY + touches[1].pageY) / 2;

            if (!twoFingerStartRef.current) {
              twoFingerStartRef.current = { x: centerX, y: centerY };
              return;
            }

            if (now - lastSentRef.current >= THROTTLE_MS) {
              const rawDx = centerX - twoFingerStartRef.current.x;
              const rawDy = centerY - twoFingerStartRef.current.y;
              const dx = Math.round(rawDx * sensitivityRef.current);
              const dy = Math.round(rawDy * sensitivityRef.current);
              if (dx !== 0 || dy !== 0) {
                ws.scrollMouse(-dx, -dy);
                lastSentRef.current = now;
                twoFingerStartRef.current = { x: centerX, y: centerY };
              }
            }
            return;
          }

          if (touches.length === 1 && lastPosRef.current) {
            const rawDx = touches[0].pageX - lastPosRef.current.x;
            const rawDy = touches[0].pageY - lastPosRef.current.y;

            totalMovementRef.current += Math.abs(rawDx) + Math.abs(rawDy);

            if (totalMovementRef.current > TAP_MOVEMENT_THRESHOLD) {
              cancelLongPress();
            }

            if (now - lastSentRef.current >= THROTTLE_MS) {
              const dx = Math.round(rawDx * sensitivityRef.current);
              const dy = Math.round(rawDy * sensitivityRef.current);
              if (dx !== 0 || dy !== 0) {
                ws.moveMouse(dx, dy);
                lastSentRef.current = now;
              }
            }

            lastPosRef.current = { x: touches[0].pageX, y: touches[0].pageY };
          }
        },

        onPanResponderRelease: (evt: GestureResponderEvent) => {
          cancelLongPress();
          const changed = evt.nativeEvent.changedTouches;
          twoFingerStartRef.current = null;

          // Two-finger tap → right click
          if (changed.length === 2 && totalMovementRef.current < TAP_MOVEMENT_THRESHOLD) {
            ws.clickMouse('right', 'click');
            lastPosRef.current = null;
            totalMovementRef.current = 0;
            return;
          }

          if (isDraggingRef.current) {
            ws.clickMouse('left', 'up');
            isDraggingRef.current = false;
          } else if (totalMovementRef.current < TAP_MOVEMENT_THRESHOLD && changed.length === 1) {
            ws.clickMouse('left', 'click');
          }

          lastPosRef.current = null;
          totalMovementRef.current = 0;
        },

        onPanResponderTerminate: () => {
          cancelLongPress();
          if (isDraggingRef.current) {
            ws.clickMouse('left', 'up');
            isDraggingRef.current = false;
          }
          lastPosRef.current = null;
          totalMovementRef.current = 0;
          twoFingerStartRef.current = null;
        },
      }),
    ).current;

    const toggleKeyboard = () => {
      setShowKeyboard((prev) => {
        if (!prev) {
          // Focus after state update
          setTimeout(() => keyboardInputRef.current?.focus(), 50);
        }
        return !prev;
      });
    };

    // Each character typed sends a KEYSTROKE and clears the field
    const handleKeyboardChange = (text: string) => {
      if (!text) return;
      // Send each character as a keystroke (last char = new input since we clear after each)
      const char = text[text.length - 1];
      ws.tap('keyboard-key', { kind: 'KEYSTROKE', keys: [char] });
      keyboardInputRef.current?.clear?.();
      // Force the ref's value to empty (RN quirk)
      (keyboardInputRef.current as any)?.setNativeProps?.({ text: '' });
    };

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onDismiss} style={styles.backButton} activeOpacity={0.7}>
            <Text style={styles.backText}>←  Deck</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Trackpad</Text>
          <TouchableOpacity
            onPress={toggleKeyboard}
            style={[styles.keyboardButton, showKeyboard && styles.keyboardButtonActive]}
            activeOpacity={0.7}
          >
            <Text style={styles.keyboardIcon}>⌨</Text>
          </TouchableOpacity>
        </View>

        {/* Gesture surface */}
        <View style={styles.surface} {...panResponder.panHandlers}>
          <Text style={styles.hint}>Drag to move  ·  Tap to click  ·  2-finger scroll</Text>
        </View>

        {/* Sensitivity control */}
        <View style={styles.sensitivityRow}>
          <Text style={styles.sensitivityLabel}>Sensitivity</Text>
          <TouchableOpacity
            onPress={() => updateSensitivity(sensitivity - SENSITIVITY_STEP)}
            style={styles.stepButton}
            activeOpacity={0.7}
          >
            <Text style={styles.stepButtonText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.sensitivityValue}>{sensitivity.toFixed(1)}×</Text>
          <TouchableOpacity
            onPress={() => updateSensitivity(sensitivity + SENSITIVITY_STEP)}
            style={styles.stepButton}
            activeOpacity={0.7}
          >
            <Text style={styles.stepButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Hidden keyboard capture input */}
        <TextInput
          ref={keyboardInputRef}
          style={styles.hiddenInput}
          onChangeText={handleKeyboardChange}
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          blurOnSubmit={false}
          onBlur={() => setShowKeyboard(false)}
        />
      </SafeAreaView>
    );
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#0A0A0F',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#1E1E2E',
    },
    backButton: {
      paddingRight: 12,
    },
    backText: {
      color: '#5B4FE8',
      fontSize: 16,
    },
    title: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '600',
      textAlign: 'center',
    },
    keyboardButton: {
      paddingLeft: 12,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
    },
    keyboardButtonActive: {
      backgroundColor: '#5B4FE8',
    },
    keyboardIcon: {
      fontSize: 20,
      color: '#AAAACC',
    },
    surface: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#0F0F18',
      margin: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#1E1E2E',
    },
    hint: {
      color: '#3A3A5C',
      fontSize: 13,
      textAlign: 'center',
    },
    sensitivityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: '#1E1E2E',
      gap: 12,
    },
    sensitivityLabel: {
      flex: 1,
      color: '#6B6B8A',
      fontSize: 14,
    },
    stepButton: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: '#1E1E2E',
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepButtonText: {
      color: '#FFFFFF',
      fontSize: 20,
      lineHeight: 24,
    },
    sensitivityValue: {
      color: '#FFFFFF',
      fontSize: 15,
      minWidth: 40,
      textAlign: 'center',
    },
    hiddenInput: {
      position: 'absolute',
      opacity: 0,
      width: 1,
      height: 1,
      bottom: 0,
      left: 0,
    },
  });
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd apps/mobile && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/mobile/src/screens/TrackpadScreen.tsx
  git commit -m "feat(mobile): add TrackpadScreen with PanResponder gestures and sensitivity control"
  ```

---

## Task 7: Mobile — DeckScreen Mouse Icon + TrackpadScreen Modal

**Files:**
- Modify: `apps/mobile/src/screens/DeckScreen.tsx`

- [ ] **Step 1: Add the TrackpadScreen import and state**

  Open `apps/mobile/src/screens/DeckScreen.tsx`.

  Add the import at the top with the other screen imports:

  ```ts
  import { TrackpadScreen } from './TrackpadScreen';
  ```

  Add state inside the `DeckScreen` function, near the other `useState` declarations (around line 56):

  ```ts
  const [showTrackpad, setShowTrackpad] = useState(false);
  ```

- [ ] **Step 2: Add the mouse icon button to the header**

  The current header (around line 300–312) looks like:

  ```tsx
  <View style={styles.header}>
    <Text style={styles.title}>KDeck</Text>
    {wsService && (
      <TouchableOpacity onPress={() => setShowContextSettings(true)} style={{ paddingHorizontal: 8 }} activeOpacity={0.7}>
        <Text style={{ color: '#6B6B8A', fontSize: 18 }}>⚙</Text>
      </TouchableOpacity>
    )}
    <TouchableOpacity style={styles.statusBadge} onPress={handleRefresh} activeOpacity={0.7}>
  ```

  Add the mouse icon button between the settings gear and the status badge:

  ```tsx
  {wsService && status === 'connected' && (
    <TouchableOpacity
      onPress={() => setShowTrackpad(true)}
      style={{ paddingHorizontal: 8 }}
      activeOpacity={0.7}
    >
      <Text style={{ color: '#6B6B8A', fontSize: 18 }}>🖱</Text>
    </TouchableOpacity>
  )}
  ```

- [ ] **Step 3: Add the TrackpadScreen Modal**

  At the bottom of the return block, after the existing ContextShortcutsScreen modal and before the final `</SafeAreaView>`, add:

  ```tsx
  {/* Trackpad modal */}
  <Modal
    visible={showTrackpad}
    animationType="slide"
    presentationStyle="fullScreen"
    onRequestClose={() => setShowTrackpad(false)}
  >
    {wsService && (
      <TrackpadScreen
        ws={wsService}
        onDismiss={() => setShowTrackpad(false)}
      />
    )}
  </Modal>
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd apps/mobile && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 5: Run all mobile tests**

  ```bash
  cd apps/mobile && npx jest --no-coverage
  ```

  Expected: all tests pass.

- [ ] **Step 6: Run all agent tests**

  ```bash
  cd apps/agent && npx jest --no-coverage
  ```

  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/mobile/src/screens/DeckScreen.tsx
  git commit -m "feat(mobile): add mouse icon to DeckScreen header and wire TrackpadScreen modal"
  ```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Section 1 (user behaviour): mouse icon → full-screen modal (Task 7), all 5 gesture types (Task 6), sensitivity (Task 6), keyboard toggle (Task 6), macOS toast guidance (not implemented — see note below)
- ✅ Section 3 (message protocol): all 3 types added (Task 1)
- ✅ Section 4a (MouseService): moveMouse, clickMouse, scrollMouse (Task 2)
- ✅ Section 4b (MouseModule): wired into AppModule (Task 3)
- ✅ Section 4c (WsGateway): 3 handlers added (Task 4)
- ✅ Section 5a (entry point): mouse icon in header (Task 7)
- ✅ Section 5b (TrackpadScreen): gesture area, sensitivity (Task 6)
- ✅ Section 5d (keyboard toggle): hidden TextInput (Task 6)
- ✅ Section 6 (persistence): AsyncStorage + sensitivityRef (Task 6)
- ⚠️ Section 7 (macOS Accessibility permission): The spec describes sending an `ACTION_RESULT` error when Accessibility is missing. This is partially handled — `MouseService` will throw when nut-js fails and `WsGateway` will catch exceptions from `moveMouse`/`clickMouse`, but currently logs silently. The mobile toast for this specific error is not wired. This is acceptable for the first iteration — the agent won't crash, it just won't move the cursor until Accessibility is granted. Add explicit error propagation in a follow-up.

**Type consistency check:**
- `MouseMoveMessage.dx/dy` — used in schema (Task 1), sent in WebSocketService.moveMouse (Task 5), read in WsGateway handler as `d.dx`/`d.dy` (Task 4), sent from TrackpadScreen via `ws.moveMouse(dx, dy)` (Task 6). ✅
- `MouseClickMessage.action` — defined as `'click'|'down'|'up'` in schema (Task 1), used as `clickMouse(button, action)` throughout. ✅ (note: spec used `type` but that conflicts with the discriminant — this plan uses `action` consistently)
- `MouseScrollMessage.dx/dy` — consistent across all tasks. ✅
- `sensitivityRef.current` is written in `updateSensitivity` and read in gesture handlers — avoids stale closure. ✅
