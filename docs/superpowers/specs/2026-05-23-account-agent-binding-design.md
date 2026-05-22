# Account–Agent Binding Design

**Date:** 2026-05-23  
**Status:** Approved  
**Scope:** Mobile auto-discovery must only connect to a desktop agent activated under the same Supabase account.

---

## Problem

mDNS discovery (`discoverAgent()`) connects to the first `_controlsurface._tcp.local.` service found on the network, regardless of which account activated it. Two users on the same LAN can accidentally cross-connect.

---

## Approach

Mobile-side check via the existing `CONNECTED` handshake. The agent includes its activated `userId` (`sub` from its Supabase JWT) in the `CONNECTED` message. The mobile compares it to its own signed-in `sub`. On mismatch: disconnect, skip that URL, keep scanning. No new message types, no crypto, no new API calls.

---

## Data Flow

```
mDNS scan resolves a service URL
→ Open WebSocket
→ Agent sends CONNECTED { userId: "abc123", agentVersion, platform }
→ Mobile reads own sub from supabase.auth.getSession()
→ Match?            → proceed as normal
→ userId is null?   → proceed (unlicensed agent — graceful degradation)
→ Mismatch?         → ws.disconnect()
                      rejectedUrls.add(url)
                      restart discoverAgent(skipUrls: rejectedUrls)
→ Retries exhausted → show fallback screen (IP field + "Switch Account" button)
```

---

## Components

### 1. `packages/shared/src/schema.ts`

Add `userId: string | null` to `ConnectedMessage`:

```ts
export interface ConnectedMessage {
  type: 'CONNECTED';
  agentVersion: string;
  platform: 'darwin' | 'win32' | 'linux';
  userId: string | null;   // agent's activated Supabase sub; null if unlicensed
}
```

Backward-compatible: old agents omit the field; mobile treats `undefined` as `null` (skip check).

### 2. `apps/agent/src/websocket/ws.gateway.ts`

In `handleConnection()`, populate `userId` in the `ConnectedMessage`:

```ts
const connected: ConnectedMessage = {
  type:         'CONNECTED',
  agentVersion: '0.1.0',
  platform:     platform() as 'darwin' | 'win32' | 'linux',
  userId:       this.licenseService.getUserId(),
};
```

No other changes to the gateway.

### 3. `apps/mobile/src/services/discovery.service.ts`

`discoverAgent()` gains an optional `skipUrls?: Set<string>` parameter. In the `resolved` handler, skip URLs present in `skipUrls` (treat as miss, continue scanning rather than stopping):

```ts
export function discoverAgent(
  onFound:   (url: string) => void,
  onTimeout: (msg: string) => void,
  skipUrls?: Set<string>,
): () => void
```

Inside the resolved handler:
```ts
zc.on('resolved', (service: ResolvedService) => {
  const url = getAgentUrlFromService(service);
  if (!url || skipUrls?.has(url)) return;   // skip rejected URLs
  cleanup();
  if (!cancelled) { cancelled = true; onFound(url); }
});
```

### 4. `apps/mobile/src/services/websocket.service.ts`

Replace the `CONNECTED` branch's direct `notifyStatus('connected')` call with a new callback:

```ts
type ConnectedCallback = (userId: string | null) => void;
```

- Add `private connectedCallbacks: ConnectedCallback[] = []`
- `onConnected(cb: ConnectedCallback): void` — registers the callback
- `acceptConnection(): void` — public method that calls the private `notifyStatus('connected')`; called by DeckScreen after validation passes
- In `onmessage`, on `CONNECTED`: call `this.notifyConnected(msg.userId ?? null)` instead of `notifyStatus('connected')` directly
- `notifyStatus('connected')` is no longer called inside `onmessage`; DeckScreen calls `ws.acceptConnection()` once it validates the userId

### 5. `apps/mobile/src/screens/DeckScreen.tsx`

**Refs/state:**
```ts
const rejectedUrls = useRef<Set<string>>(new Set());
```

**onConnected callback** (registered after creating `WebSocketService`):
```ts
ws.onConnected(async (agentUserId) => {
  if (agentUserId !== null) {
    const { data } = await supabase.auth.getSession();
    const myId = data.session?.user.id;
    if (myId && agentUserId !== myId) {
      ws.disconnect();
      rejectedUrls.current.add(currentAgentUrl);
      restartDiscovery();   // passes skipUrls: rejectedUrls.current
      return;
    }
  }
  // userId matches or is null — accept the connection
  ws.acceptConnection();   // calls notifyStatus('connected') internally
});
```

**restartDiscovery** — clears the current discovery cancel ref and calls `discoverAgent` again with `skipUrls: rejectedUrls.current`.

**Fallback screen — "Switch Account" button:**
```
[ Enter desktop IP address... ]
[ Connect                     ]

[ Switch Account ]   ← new, below the IP field
```

Tapping "Switch Account":
1. `await supabase.auth.signOut()`
2. Reset auth state in DeckScreen → `AuthScreen` renders
3. `rejectedUrls.current` resets to empty set on re-mount

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Agent unlicensed (`userId: null` or field missing) | Skip check, connect |
| Mobile session returns null (expired mid-discovery) | Skip check, connect |
| Multiple wrong-account agents on LAN | Each rejected URL added to skip set; scanning continues |
| Same userId on multiple desktops | Connects to whichever resolves first — correct |
| User enters IP manually | Bypasses discovery and account check entirely — intentional |
| User switches account | `signOut()` → re-mount → empty `rejectedUrls` → fresh discovery |

---

## What Does Not Change

- mDNS scan timing, retry count, or fallback UI structure
- WebSocket protocol (only `CONNECTED` gains a new optional field)
- Agent-side connection acceptance (no enforcement on agent side — accidental, not adversarial)
- License flow, tile flow, any other message handler
