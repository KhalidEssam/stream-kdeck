# Account–Agent Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the mobile app from connecting to a desktop agent that belongs to a different Supabase account, with graceful retry and a "Switch Account" escape hatch.

**Architecture:** The agent includes its activated `userId` in the `CONNECTED` WebSocket message. The mobile reads this and compares it to the signed-in user's `sub`; on mismatch it disconnects, records the URL in a skip-set, and restarts mDNS discovery. After retries are exhausted, the fallback screen gains a "Switch Account" button.

**Tech Stack:** TypeScript, NestJS (agent), React Native / Expo (mobile), Supabase Auth, react-native-zeroconf, Jest + jest-websocket-mock

---

## File Map

| File | Change |
|---|---|
| `packages/shared/src/schema.ts` | Add `userId?: string \| null` to `ConnectedMessage` |
| `apps/agent/src/websocket/ws.gateway.ts` | Populate `userId` in `handleConnection()` |
| `apps/mobile/src/services/discovery.service.ts` | Add `skipUrls?: Set<string>` param |
| `apps/mobile/src/services/discovery.service.test.ts` | Two new tests for `skipUrls` |
| `apps/mobile/src/services/websocket.service.ts` | Add `onConnected` callback + `acceptConnection()` |
| `apps/mobile/src/services/__tests__/websocket.service.test.ts` | Update existing test + two new tests |
| `apps/mobile/src/screens/DeckScreen.tsx` | Validation logic, restart, Switch Account button |

---

## Task 1: Add `userId` to `ConnectedMessage` schema

**Files:**
- Modify: `packages/shared/src/schema.ts:166-170`

- [ ] **Step 1: Edit `ConnectedMessage`**

  Current (lines 166-170):
  ```ts
  export interface ConnectedMessage {
    type: 'CONNECTED';
    agentVersion: string;
    platform: 'darwin' | 'win32' | 'linux';
  }
  ```

  Replace with:
  ```ts
  export interface ConnectedMessage {
    type: 'CONNECTED';
    agentVersion: string;
    platform: 'darwin' | 'win32' | 'linux';
    userId?: string | null;
  }
  ```

  `userId` is optional so old agents that don't send it remain valid.

- [ ] **Step 2: Verify TypeScript compiles in shared package**

  Run from repo root:
  ```
  cd packages/shared && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```
  git add packages/shared/src/schema.ts
  git commit -m "feat(shared/schema): add optional userId to ConnectedMessage"
  ```

---

## Task 2: Agent populates `userId` in `CONNECTED` message

**Files:**
- Modify: `apps/agent/src/websocket/ws.gateway.ts:264-269`

- [ ] **Step 1: Update `handleConnection()`**

  Find this block (around line 264):
  ```ts
  const connected: ConnectedMessage = {
    type:         'CONNECTED',
    agentVersion: '0.1.0',
    platform:     platform() as 'darwin' | 'win32' | 'linux',
  };
  ```

  Replace with:
  ```ts
  const connected: ConnectedMessage = {
    type:         'CONNECTED',
    agentVersion: '0.1.0',
    platform:     platform() as 'darwin' | 'win32' | 'linux',
    userId:       this.licenseService.getUserId(),
  };
  ```

  `LicenseService.getUserId()` already returns `string | null` (the `sub` from the stored JWT, or `null` if unlicensed).

- [ ] **Step 2: Verify TypeScript compiles in agent**

  ```
  cd apps/agent && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```
  git add apps/agent/src/websocket/ws.gateway.ts
  git commit -m "feat(agent/ws): include userId in CONNECTED handshake"
  ```

---

## Task 3: Discovery service — `skipUrls` parameter (TDD)

**Files:**
- Modify: `apps/mobile/src/services/discovery.service.ts:61-143`
- Modify: `apps/mobile/src/services/discovery.service.test.ts`

- [ ] **Step 1: Write two failing tests**

  Append to the `describe('discovery.service', ...)` block in `apps/mobile/src/services/discovery.service.test.ts`:

  ```ts
  it('skips a resolved service whose URL is in skipUrls', () => {
    const onFound = jest.fn();
    const onTimeout = jest.fn();
    const skipUrls = new Set(['ws://192.168.1.77:3001']);

    discoverAgent(onFound, onTimeout, skipUrls);

    mockHandlers.resolved({
      host: 'KDeck-Agent.local.',
      port: 3001,
      addresses: ['192.168.1.77'],
    });

    expect(onFound).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
  });

  it('resolves a service not in skipUrls even when skipUrls is provided', () => {
    const onFound = jest.fn();
    const onTimeout = jest.fn();
    const skipUrls = new Set(['ws://192.168.1.99:3001']);

    discoverAgent(onFound, onTimeout, skipUrls);

    mockHandlers.resolved({
      host: 'KDeck-Agent.local.',
      port: 3001,
      addresses: ['192.168.1.77'],
    });

    expect(onFound).toHaveBeenCalledWith('ws://192.168.1.77:3001');
    expect(onTimeout).not.toHaveBeenCalled();
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```
  cd apps/mobile && npx jest discovery.service --runInBand
  ```
  Expected: 2 failures — `discoverAgent` doesn't accept a third argument yet.

- [ ] **Step 3: Add `skipUrls` to `discoverAgent`**

  In `apps/mobile/src/services/discovery.service.ts`, update the function signature (line 61):

  ```ts
  export function discoverAgent(
    onFound:   (url: string) => void,
    onTimeout: (msg: string) => void,
    skipUrls?: Set<string>,
  ): () => void {
  ```

  Then update the `resolved` handler inside `startAttempt` (lines 111-115):

  ```ts
  zc.on('resolved', (service: ResolvedService) => {
    const url = getAgentUrlFromService(service);
    if (!url || skipUrls?.has(url)) return;
    cleanup();
    if (!cancelled) { cancelled = true; onFound(url); }
  });
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```
  cd apps/mobile && npx jest discovery.service --runInBand
  ```
  Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

  ```
  git add apps/mobile/src/services/discovery.service.ts \
          apps/mobile/src/services/discovery.service.test.ts
  git commit -m "feat(mobile/discovery): skip already-rejected agent URLs during scan"
  ```

---

## Task 4: WebSocket service — `onConnected` callback + `acceptConnection()` (TDD)

**Files:**
- Modify: `apps/mobile/src/services/__tests__/websocket.service.test.ts`
- Modify: `apps/mobile/src/services/websocket.service.ts`

- [ ] **Step 1: Update the existing CONNECTED test and add two new ones**

  In `apps/mobile/src/services/__tests__/websocket.service.test.ts`:

  **Replace** the existing test (line 20-28):
  ```ts
  it('emits "connected" status when server sends CONNECTED message', async () => {
    const statuses: string[] = [];
    service.onStatusChange((s) => statuses.push(s));

    const msg: ConnectedMessage = { type: 'CONNECTED', agentVersion: '0.1.0', platform: 'darwin' };
    server.send(JSON.stringify(msg));

    await new Promise((r) => setTimeout(r, 50));
    expect(statuses).toContain('connected');
  });
  ```

  **With:**
  ```ts
  it('emits "connected" status after acceptConnection is called from onConnected', async () => {
    const statuses: string[] = [];
    service.onStatusChange((s) => statuses.push(s));
    service.onConnected(() => service.acceptConnection());

    const msg: ConnectedMessage = { type: 'CONNECTED', agentVersion: '0.1.0', platform: 'darwin', userId: null };
    server.send(JSON.stringify(msg));

    await new Promise((r) => setTimeout(r, 50));
    expect(statuses).toContain('connected');
  });

  it('calls onConnected with userId from CONNECTED message', async () => {
    const received: Array<string | null> = [];
    service.onConnected((id) => received.push(id));

    const msg: ConnectedMessage = { type: 'CONNECTED', agentVersion: '0.1.0', platform: 'darwin', userId: 'user-abc' };
    server.send(JSON.stringify(msg));

    await new Promise((r) => setTimeout(r, 50));
    expect(received).toEqual(['user-abc']);
  });

  it('calls onConnected with null when userId is absent from CONNECTED message', async () => {
    const received: Array<string | null> = [];
    service.onConnected((id) => received.push(id));

    const msg: ConnectedMessage = { type: 'CONNECTED', agentVersion: '0.1.0', platform: 'darwin' };
    server.send(JSON.stringify(msg));

    await new Promise((r) => setTimeout(r, 50));
    expect(received).toEqual([null]);
  });
  ```

- [ ] **Step 2: Run tests to verify failures**

  ```
  cd apps/mobile && npx jest websocket.service --runInBand
  ```
  Expected: 3 failures — `onConnected` and `acceptConnection` don't exist yet, and the updated test fails.

- [ ] **Step 3: Implement `onConnected` and `acceptConnection` in `WebSocketService`**

  In `apps/mobile/src/services/websocket.service.ts`:

  **Add** a type alias and private field after the existing callback type declarations (around line 76):
  ```ts
  type ConnectedCallback = (userId: string | null) => void;
  ```

  Add the private field in the class body (after `private pluginConnStatusListeners`, around line 98):
  ```ts
  private connectedCallbacks: ConnectedCallback[] = [];
  ```

  Add two public methods (after `onStatusChange`, around line 332):
  ```ts
  onConnected(cb: ConnectedCallback): void {
    this.connectedCallbacks.push(cb);
  }

  acceptConnection(): void {
    this.notifyStatus('connected');
  }
  ```

  **Replace** the CONNECTED branch in `onmessage` (lines 113-115):
  ```ts
  // Before:
  if (msg.type === 'CONNECTED') {
    this.notifyStatus('connected');
  }

  // After:
  if (msg.type === 'CONNECTED') {
    const userId = msg.userId ?? null;
    this.connectedCallbacks.forEach((cb) => cb(userId));
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```
  cd apps/mobile && npx jest websocket.service --runInBand
  ```
  Expected: all tests pass (13 total).

- [ ] **Step 5: Commit**

  ```
  git add apps/mobile/src/services/websocket.service.ts \
          apps/mobile/src/services/__tests__/websocket.service.test.ts
  git commit -m "feat(mobile/ws): add onConnected callback and acceptConnection for account validation"
  ```

---

## Task 5: DeckScreen — account validation, discovery restart, Switch Account button

**Files:**
- Modify: `apps/mobile/src/screens/DeckScreen.tsx`

### Step group A: `rejectedUrls` ref and Effect 1

- [ ] **Step 1: Add `rejectedUrls` ref**

  In `DeckScreen`, add after the `retryCancelRef` declaration (around line 191):
  ```ts
  const rejectedUrls = useRef<Set<string>>(new Set());
  ```

- [ ] **Step 2: Pass `rejectedUrls.current` to `discoverAgent` in Effect 1**

  In Effect 1 (around line 276), find:
  ```ts
  const cancel = discoverAgent(
    (url) => {
      retryCancelRef.current = null;
      if (!cancelled) setAgentUrl(url);
    },
    (msg) => {
      retryCancelRef.current = null;
      if (!cancelled) setDiscoveryError(msg);
    },
  );
  ```

  Replace with:
  ```ts
  const cancel = discoverAgent(
    (url) => {
      retryCancelRef.current = null;
      if (!cancelled) setAgentUrl(url);
    },
    (msg) => {
      retryCancelRef.current = null;
      if (!cancelled) setDiscoveryError(msg);
    },
    rejectedUrls.current,
  );
  ```

### Step group B: account validation in Effect 2

- [ ] **Step 3: Register `onConnected` handler in Effect 2**

  In Effect 2 (around line 331), find:
  ```ts
  ws.onStatusChange((nextStatus) => {
  ```

  Insert **before** that line:
  ```ts
  ws.onConnected(async (agentUserId) => {
    if (agentUserId !== null) {
      const { data } = await supabase.auth.getSession();
      const myId = data.session?.user.id;
      if (myId && agentUserId !== myId) {
        ws.disconnect();
        rejectedUrls.current.add(agentUrl);
        setAgentUrl(null);
        setDiscoveryAttempt((n) => n + 1);
        return;
      }
    }
    ws.acceptConnection();
  });
  ```

  `agentUrl` is the value captured from the `[agentUrl]` dependency when this effect ran — i.e. the URL that just connected.

- [ ] **Step 4: Remove direct `notifyStatus('connected')` path — verify Effect 2 no longer calls it**

  The `ws.onStatusChange` block calls `setStatus(nextStatus)` for all statuses. This is correct — `acceptConnection()` inside `WebSocketService` calls `notifyStatus('connected')`, which flows through `onStatusChange`. No change needed here; just confirm the existing handler looks like:
  ```ts
  ws.onStatusChange((nextStatus) => {
    setStatus(nextStatus);
    if (nextStatus === 'connected') {
      setConnectionError(null);
      setManualIpInput(getManualInputFromAgentUrl(agentUrl));
      void AsyncStorage.setItem(AGENT_URL_STORAGE_KEY, agentUrl);
      ws.requestLicenseStatus();
    }
  });
  ```
  This is unchanged — it reacts to whatever status comes through, including the new `acceptConnection()` path.

### Step group C: `handleSwitchAccount` and Switch Account UI

- [ ] **Step 5: Add `handleSwitchAccount`**

  After `handleChangeAgent` (around line 427), add:
  ```ts
  const handleSwitchAccount = () => {
    rejectedUrls.current.clear();
    void supabase.auth.signOut();
    void AsyncStorage.removeItem(AGENT_URL_STORAGE_KEY);
  };
  ```

  `supabase.auth.signOut()` triggers the `onAuthStateChange` listener (already wired at line 222), which sets `authenticated = false` → DeckScreen shows `<AuthScreen />`. Clearing `rejectedUrls` and the saved URL ensures a fresh start after the user signs in with a different account.

- [ ] **Step 6: Add "Switch Account" button to the `discoveryError` UI**

  Find the `discoveryError` render block (around line 675). Locate the Connect button:
  ```tsx
  <TouchableOpacity
    style={[styles.button, { marginTop: 10, paddingHorizontal: 28 }]}
    onPress={handleConnectManual}
    activeOpacity={0.8}
  >
    <Text style={styles.buttonText}>Connect</Text>
  </TouchableOpacity>
  ```

  Insert **after** it (still inside `<View style={styles.centerFill}>`):
  ```tsx
  <TouchableOpacity
    style={[styles.button, { marginTop: 12, paddingHorizontal: 28, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }]}
    onPress={handleSwitchAccount}
    activeOpacity={0.8}
  >
    <Text style={[styles.buttonText, { color: '#6B6B8A' }]}>Switch Account</Text>
  </TouchableOpacity>
  ```

- [ ] **Step 7: Verify TypeScript compiles**

  ```
  cd apps/mobile && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 8: Run all mobile tests**

  ```
  cd apps/mobile && npx jest --runInBand
  ```
  Expected: all tests pass.

- [ ] **Step 9: Commit**

  ```
  git add apps/mobile/src/screens/DeckScreen.tsx
  git commit -m "feat(mobile/DeckScreen): reject wrong-account agents and add Switch Account button"
  ```

---

## Verification Checklist

After all tasks are complete, verify end-to-end behavior manually:

- [ ] Same-account desktop + mobile on same WiFi → connects normally, no regression
- [ ] Two different-account desktops on same WiFi → mobile skips wrong-account agent and either connects to correct one or shows fallback
- [ ] Fallback screen shows "Switch Account" button only when `discoveryError` is set
- [ ] Tapping "Switch Account" → signs out → `AuthScreen` appears
- [ ] After signing in with the correct account → fresh discovery runs, `rejectedUrls` is empty
- [ ] Unlicensed agent (`userId: null`) → mobile connects without checking (graceful degradation)
- [ ] Manual IP entry → bypasses account check entirely
