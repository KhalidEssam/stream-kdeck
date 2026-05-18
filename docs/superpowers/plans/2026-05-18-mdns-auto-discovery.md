# mDNS Auto-Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded agent IP in the mobile app with automatic LAN discovery — the agent advertises itself via mDNS and the mobile finds it without any user configuration.

**Architecture:** The NestJS agent uses `bonjour-service` (pure-JS, no native rebuild needed) to publish `_controlsurface._tcp` on port 3001 when it boots. The React Native mobile app uses `react-native-zeroconf` to browse for that service type; once resolved it extracts the IPv4 address and opens the WebSocket. A 10-second timeout surfaces a fallback error UI with a Retry button.

**Tech Stack:** `bonjour-service` (agent), `react-native-zeroconf` (mobile), NestJS lifecycle hooks, iOS `Info.plist` Bonjour entitlements, Android `CHANGE_WIFI_MULTICAST_STATE` permission.

---

## File map

**Agent — new files:**
- `apps/agent/src/network/mdns.service.ts` — publishes/unpublishes the mDNS service
- `apps/agent/src/network/network.module.ts` — NestJS module wrapping MdnsService

**Agent — modified files:**
- `apps/agent/src/app.module.ts` — import NetworkModule
- `apps/agent/package.json` — add `bonjour-service` dependency

**Agent — test files:**
- `apps/agent/tests/network/mdns.service.test.ts`

**Mobile — new files:**
- `apps/mobile/src/services/discovery.service.ts` — wraps react-native-zeroconf, returns a URL promise with timeout

**Mobile — modified files:**
- `apps/mobile/src/screens/DeckScreen.tsx` — replace hardcoded URL with discovery state machine
- `apps/mobile/package.json` — add `react-native-zeroconf`
- `apps/mobile/ios/mobile/Info.plist` — add NSBonjourServices + NSLocalNetworkUsageDescription
- `apps/mobile/android/app/src/main/AndroidManifest.xml` — add CHANGE_WIFI_MULTICAST_STATE permission

---

### Task 1: Agent — install bonjour-service and create MdnsService

**Files:**
- Modify: `apps/agent/package.json`
- Create: `apps/agent/src/network/mdns.service.ts`
- Create: `apps/agent/src/network/network.module.ts`
- Create: `apps/agent/tests/network/mdns.service.test.ts`

- [ ] **Step 1: Install the package**

Run from `apps/agent/`:
```
npm install bonjour-service
```
Expected: `bonjour-service` appears in `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `apps/agent/tests/network/mdns.service.test.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { MdnsService } from '../../src/network/mdns.service';

const mockStop    = jest.fn();
const mockPublish = jest.fn().mockReturnValue({ stop: mockStop });
const mockDestroy = jest.fn();

jest.mock('bonjour-service', () => ({
  Bonjour: jest.fn().mockImplementation(() => ({
    publish: mockPublish,
    destroy: mockDestroy,
  })),
}));

describe('MdnsService', () => {
  let service: MdnsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [MdnsService],
    }).compile();
    service = module.get(MdnsService);
  });

  it('publishes _controlsurface._tcp on bootstrap', () => {
    service.onApplicationBootstrap();
    expect(mockPublish).toHaveBeenCalledWith({
      name: 'Control Surface Agent',
      type: 'controlsurface',
      port: 3001,
    });
  });

  it('stops the published service on shutdown', () => {
    service.onApplicationBootstrap();
    service.onApplicationShutdown();
    expect(mockStop).toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('is safe to shutdown without bootstrapping', () => {
    expect(() => service.onApplicationShutdown()).not.toThrow();
  });
});
```

- [ ] **Step 3: Run — expect FAIL (module not found)**

```
cd apps/agent && npm test -- --testPathPattern=mdns
```
Expected: FAIL — `Cannot find module '../../src/network/mdns.service'`

- [ ] **Step 4: Create MdnsService**

Create `apps/agent/src/network/mdns.service.ts`:
```typescript
import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Bonjour } from 'bonjour-service';
import type { Service } from 'bonjour-service';

@Injectable()
export class MdnsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private bonjour = new Bonjour();
  private service: Service | null = null;

  onApplicationBootstrap(): void {
    this.service = this.bonjour.publish({
      name: 'Control Surface Agent',
      type: 'controlsurface',
      port: 3001,
    });
    console.log('[Agent] mDNS: advertising _controlsurface._tcp on port 3001');
  }

  onApplicationShutdown(): void {
    this.service?.stop();
    this.bonjour.destroy();
  }
}
```

- [ ] **Step 5: Run — expect PASS**

```
cd apps/agent && npm test -- --testPathPattern=mdns
```
Expected: PASS — 3 tests pass.

- [ ] **Step 6: Create NetworkModule**

Create `apps/agent/src/network/network.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { MdnsService } from './mdns.service';

@Module({
  providers: [MdnsService],
})
export class NetworkModule {}
```

- [ ] **Step 7: Wire NetworkModule into AppModule**

Edit `apps/agent/src/app.module.ts` — add the import:
```typescript
import { Module } from '@nestjs/common';
import { WsGateway } from './websocket/ws.gateway';
import { ClipboardService } from './clipboard/clipboard.service';
import { AiRouterService } from './ai/ai-router.service';
import { CommandService } from './command/command.service';
import { AppLaunchService } from './app-launch/app-launch.service';
import { AppRegistryService } from './app-launch/app-registry.service';
import { KeystrokeService } from './keystroke/keystroke.service';
import { AppSearchService } from './app-search/app-search.service';
import { LicenseModule } from './license/license.module';
import { NetworkModule } from './network/network.module';

@Module({
  imports: [LicenseModule, NetworkModule],
  providers: [
    WsGateway,
    ClipboardService,
    AiRouterService,
    CommandService,
    AppLaunchService,
    AppRegistryService,
    KeystrokeService,
    AppSearchService,
  ],
})
export class AppModule {}
```

- [ ] **Step 8: Run all agent tests — expect still PASS**

```
cd apps/agent && npm test
```
Expected: all tests pass.

- [ ] **Step 9: Smoke-test the agent**

```
cd apps/agent && npm run dev
```
Expected log line:
```
[Agent] mDNS: advertising _controlsurface._tcp on port 3001
```

- [ ] **Step 10: Commit**

```
git add apps/agent/src/network/ apps/agent/tests/network/ apps/agent/src/app.module.ts apps/agent/package.json
git commit -m "feat(agent): advertise _controlsurface._tcp via mDNS on port 3001"
```

---

### Task 2: Mobile — install react-native-zeroconf and create DiscoveryService

**Files:**
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/src/services/discovery.service.ts`

- [ ] **Step 1: Install the package**

Run from `apps/mobile/`:
```
npx expo install react-native-zeroconf
```
Expected: `react-native-zeroconf` appears in `package.json` dependencies.

- [ ] **Step 2: Create DiscoveryService**

Create `apps/mobile/src/services/discovery.service.ts`:
```typescript
import Zeroconf from 'react-native-zeroconf';

const SERVICE_TYPE   = 'controlsurface';
const SERVICE_PROTO  = 'tcp';
const SERVICE_DOMAIN = 'local.';
const DEFAULT_PORT   = 3001;

export function discoverAgent(
  onFound:   (url: string) => void,
  onTimeout: (msg: string) => void,
  timeoutMs  = 10_000,
): () => void {
  const zc       = new Zeroconf();
  let   resolved = false;

  zc.on('resolved', (service: {
    host:      string;
    port:      number;
    addresses: string[];
  }) => {
    if (resolved) return;
    resolved = true;
    const ipv4 = service.addresses?.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
    const host = ipv4 ?? service.host;
    const port = service.port ?? DEFAULT_PORT;
    zc.stop();
    onFound(`ws://${host}:${port}`);
  });

  zc.on('error', (err: unknown) => {
    if (!resolved) onTimeout(String(err));
  });

  zc.scan(SERVICE_TYPE, SERVICE_PROTO, SERVICE_DOMAIN);

  const timer = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      zc.stop();
      onTimeout('No Control Surface agent found on this network.');
    }
  }, timeoutMs);

  return () => {
    clearTimeout(timer);
    if (!resolved) { resolved = true; zc.stop(); }
  };
}
```

- [ ] **Step 3: Commit**

```
git add apps/mobile/src/services/discovery.service.ts apps/mobile/package.json
git commit -m "feat(mobile): add mDNS discovery service for agent auto-connect"
```

---

### Task 3: Mobile — native configuration (iOS + Android)

**Files:**
- Modify: `apps/mobile/ios/mobile/Info.plist`
- Modify: `apps/mobile/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Add iOS Bonjour entitlements**

Open `apps/mobile/ios/mobile/Info.plist`. Add these two keys anywhere inside the root `<dict>`:
```xml
<key>NSLocalNetworkUsageDescription</key>
<string>Control Surface needs local network access to find the desktop agent on your network.</string>
<key>NSBonjourServices</key>
<array>
  <string>_controlsurface._tcp</string>
</array>
```
Without `NSBonjourServices`, iOS 14+ silently blocks mDNS browsing.

- [ ] **Step 2: Add Android multicast permission**

Open `apps/mobile/android/app/src/main/AndroidManifest.xml`. Add inside `<manifest>` (before `<application>`):
```xml
<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
```

- [ ] **Step 3: Rebuild native**

iOS:
```
cd apps/mobile && npx expo run:ios
```
Android:
```
cd apps/mobile && npx expo run:android
```

- [ ] **Step 4: Commit**

```
git add apps/mobile/ios/mobile/Info.plist apps/mobile/android/app/src/main/AndroidManifest.xml
git commit -m "feat(mobile): add iOS Bonjour entitlements and Android multicast permission"
```

---

### Task 4: Mobile — wire discovery into DeckScreen

**Files:**
- Modify: `apps/mobile/src/screens/DeckScreen.tsx`

- [ ] **Step 1: Replace the hardcoded URL with discovery state**

In `apps/mobile/src/screens/DeckScreen.tsx`, make these changes:

**Remove** (line ~24):
```typescript
const AGENT_URL = 'ws://192.168.1.5:3001';
```

**Add** the import at the top with the other imports:
```typescript
import { discoverAgent } from '../services/discovery.service';
```

**Add** two new state variables after the existing `useState` declarations:
```typescript
const [agentUrl, setAgentUrl]             = useState<string | null>(null);
const [discoveryError, setDiscoveryError] = useState<string | null>(null);
```

**Replace** the WebSocket `useEffect` (currently `useEffect(() => { if (!authenticated) return; ...}, [authenticated])`) with:
```typescript
useEffect(() => {
  if (!authenticated) return;

  setAgentUrl(null);
  setDiscoveryError(null);

  const cancel = discoverAgent(
    (url) => setAgentUrl(url),
    (msg) => setDiscoveryError(msg),
  );

  return cancel;
}, [authenticated]);

useEffect(() => {
  if (!agentUrl) return;

  const ws = new WebSocketService(agentUrl);
  wsRef.current = ws;
  setWsService(ws);
  ws.onStatusChange((nextStatus) => {
    setStatus(nextStatus);
    if (nextStatus === 'connected') ws.requestLicenseStatus();
  });
  ws.onResult((result) => {
    setLoadingId(null);
    if (result.output) setViewerText(result.output);
  });
  ws.onDeckConfig((msg) => {
    setTiles(msg.tiles);
  });
  const unsubscribeLicense = ws.onLicenseStatus((msg) => {
    setLicensed(msg.licensed);
    setCreditsRemaining(msg.creditsRemaining);
  });
  const unsubscribeQuota = ws.onAiQuotaExceeded(() => {
    setLoadingId(null);
    setCreditsRemaining(0);
    setShowUpsell(true);
  });

  return () => {
    unsubscribeLicense();
    unsubscribeQuota();
    ws.disconnect();
    wsRef.current = null;
    setWsService(null);
  };
}, [agentUrl]);
```

**Replace** the discovery loading/error UI — add these two guards after the `if (!authenticated)` guard and before the `if (licensed === null && status === 'connected')` guard:

```typescript
if (authenticated && !agentUrl && !discoveryError) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <View style={styles.centerFill}>
        <Text style={styles.loadingText}>Looking for Control Surface agent…</Text>
        <Text style={[styles.loadingText, { fontSize: 12, marginTop: 8, color: '#444' }]}>
          Make sure your desktop and phone are on the same WiFi network.
        </Text>
      </View>
    </SafeAreaView>
  );
}

if (discoveryError) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <View style={styles.centerFill}>
        <Text style={styles.loadingText}>Agent not found</Text>
        <Text style={[styles.loadingText, { fontSize: 13, marginTop: 8, color: '#555' }]}>
          {discoveryError}
        </Text>
        <TouchableOpacity
          style={[styles.button, { marginTop: 24, paddingHorizontal: 28 }]}
          onPress={() => {
            setDiscoveryError(null);
            setAgentUrl(null);
            const cancel = discoverAgent(
              (url) => setAgentUrl(url),
              (msg) => setDiscoveryError(msg),
            );
            return cancel;
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
```

Add to the `StyleSheet.create` block (at the bottom, before the closing `}`):
```typescript
  button: {
    backgroundColor: '#5B4FE8',
    borderRadius:    10,
    paddingVertical: 14,
    alignItems:      'center',
    marginTop:       4,
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
```

Note: if `button` / `buttonText` already exist in the stylesheet, skip adding them.

- [ ] **Step 2: Verify TypeScript compiles**

```
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Start the agent (`npm run dev` in `apps/agent`), then run the mobile app. Expected sequence:
1. Sign in → "Looking for Control Surface agent…" appears
2. Within ~2 seconds: connects, shows CONNECTED status in deck
3. Kill the agent, press Retry — scanning restarts

- [ ] **Step 4: Commit**

```
git add apps/mobile/src/screens/DeckScreen.tsx
git commit -m "feat(mobile): auto-discover agent via mDNS, remove hardcoded IP"
```

---

## Self-review

**Spec coverage:**
- ✅ Agent advertises `_controlsurface._tcp` on port 3001
- ✅ Mobile discovers without manual IP configuration
- ✅ 10-second timeout with Retry UI
- ✅ IPv4 filtering (avoids IPv6 link-local addresses)
- ✅ iOS NSBonjourServices + NSLocalNetworkUsageDescription
- ✅ Android CHANGE_WIFI_MULTICAST_STATE
- ✅ Clean teardown on unmount / sign-out

**Placeholder scan:** none found.

**Type consistency:**
- `discoverAgent(onFound, onTimeout, timeoutMs)` — used identically in Task 2 and Task 4.
- `StyleSheet` keys `button`/`buttonText` — plan notes to skip if already present.
