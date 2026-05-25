# User Input Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `user_input` as a first-class context provider that captures intentional user speech/text before an AI pack tool runs, preventing dirty clipboard and stale inferred context from misleading the model.

**Architecture:** Pre-resolve `user_input` in `CommandService` via a new `UserContextRequestService` (a WS round-trip to mobile) before the `ContextAssemblerService` runs on inferred providers. The assembled context is then structured with a `### User Intent` section first so the model always sees what the user actually wanted. Phases 3–4 layer a domain-classification evaluator and a Gamer pack migration on top of the working base.

**Tech Stack:** NestJS (agent), React Native (mobile), `ws` WebSocket, shared TypeScript types in `packages/shared`, Supabase SQL migrations.

---

## File Map

| File | Status | Purpose |
|---|---|---|
| `packages/shared/src/schema.ts` | Modify | Add `user_input` to `ContextProviderId`, new message types, extended `ToolContextRequirement` |
| `apps/mobile/src/types/schema.ts` | Modify | Mirror all schema.ts changes for mobile |
| `apps/agent/src/context/user-context-request.service.ts` | **Create** | WS round-trip service for capturing user intent |
| `apps/agent/src/context/user-context-request.service.spec.ts` | **Create** | TDD spec for above |
| `apps/agent/src/context/context-runtime.module.ts` | Modify | Provide and export `UserContextRequestService` |
| `apps/agent/src/websocket/ws.gateway.ts` | Modify | Handle `USER_CONTEXT_RESPONSE`, inject `UserContextRequestService` |
| `apps/agent/src/command/command.service.ts` | Modify | Pre-capture user intent, filter requirements, compose context |
| `apps/mobile/src/services/websocket.service.ts` | Modify | Add `onUserContextRequest`, `sendUserContextResponse`, `sendUserContextCancel`, handle `USER_CONTEXT_CANCEL` |
| `apps/mobile/src/components/UserContextSheet.tsx` | **Create** | Bottom sheet: text input + submit/cancel |
| `apps/mobile/src/hooks/useUserContextRequest.ts` | **Create** | Hook that bridges WS events to sheet state |
| `apps/mobile/src/screens/DeckScreen.tsx` | Modify | Wire hook and sheet |
| `apps/agent/src/context/context-assembler.service.ts` | Modify | Phase 2: skip `user_input` reqs, accept `userIntent` param, structured output |
| `apps/agent/src/context/context-assembler.service.spec.ts` | Modify | Phase 2: update tests for new format |
| `apps/agent/src/context/context-evaluator.service.ts` | **Create** | Phase 3: domain keyword classification |
| `apps/agent/src/context/context-evaluator.service.spec.ts` | **Create** | Phase 3: TDD spec |
| `supabase/migrations/20260525000020_gamer_user_input_requirements.sql` | **Create** | Phase 4: update 5 Gamer tools |
| `supabase/seed/packs.sql` | Modify | Phase 4: mirror migration in seed to prevent re-seed overwrite |
| `apps/agent/src/command/command.service.spec.ts` | **Create** | Phase 4: integration tests for AI_CLIPBOARD + user_input flow |

---

## Task 1: Shared schema types

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Modify: `apps/mobile/src/types/schema.ts`

- [ ] **Step 1: Add `user_input` to `ContextProviderId` and new supporting types in `packages/shared/src/schema.ts`**

Find the existing `ContextProviderId` type (line 31) and `ToolContextRequirement` interface (line 40). Replace both:

```ts
export type ContextProviderId =
  | 'user_input'
  | 'clipboard'
  | 'active_window'
  | 'active_terminal'
  | 'project_files'
  | 'git'
  | 'media'
  | 'obs';

export type ContextRole = 'intent' | 'artifact' | 'environment' | 'supporting';
export type UserInputMode = 'text' | 'speech' | 'speech_or_text';

export interface ToolContextRequirement {
  provider: ContextProviderId;
  required: boolean;
  reason: string;
  maxBytes?: number;
  role?: ContextRole;
  priority?: number;
  captureMode?: UserInputMode;
  minConfidence?: number;
}
```

- [ ] **Step 2: Add the three new message types to `packages/shared/src/schema.ts`**

Add after the `ContextPermissionResponseMessage` interface (around line 480):

```ts
// Agent → Mobile: request user input before an AI run
export interface UserContextRequestMessage {
  type: 'USER_CONTEXT_REQUEST';
  requestId: string;
  packId: string;
  toolId: string;
  title: string;
  prompt: string;
  required: boolean;
  captureMode: 'text' | 'speech' | 'speech_or_text';
  timeoutMs?: number;
  languageHint?: string;
}

// Mobile → Agent: user's captured input (or cancellation)
// Phase 1 note: `modality`, `language`, and `confidence` are forward-compat fields for Phase 2
// native STT integration. Phase 1 always sends modality:'text' and omits language/confidence.
// The agent hardcodes modality:'text' and ignores these fields until Phase 2.
export interface UserContextResponseMessage {
  type: 'USER_CONTEXT_RESPONSE';
  requestId: string;
  canceled: boolean;
  text?: string;
  modality?: 'text' | 'speech';
  language?: string;
  confidence?: number;
  capturedAt: string;
}

// Agent → Mobile: supersede a pending request (timeout or retap)
export interface UserContextCancelMessage {
  type: 'USER_CONTEXT_CANCEL';
  requestId: string;
}
```

- [ ] **Step 3: Add new messages to the `AgentMessage` and `MobileMessage` unions**

`AgentMessage` gets `UserContextRequestMessage` and `UserContextCancelMessage` (agent sends these TO mobile).
`MobileMessage` gets `UserContextResponseMessage` (mobile sends this TO agent).

```ts
export type AgentMessage =
  | ActionResultMessage
  | ConnectedMessage
  | ContextPermissionRequestMessage
  | DeckConfigMessage
  | SearchAppsResultMessage
  | ValidatePathResultMessage
  | LicenseStatusMessage
  | AiQuotaExceededMessage
  | ContextShortcutsMessage
  | ContextProfilesMessage
  | PackRegistryMessage
  | MediaStateMessage
  | PluginCatalogMessage
  | InstalledPluginsMessage
  | PluginInstallStatusMessage
  | PluginConnectionStatusMessage
  | IntegrationStateMessage
  | RunHistoryMessage
  | UserContextRequestMessage    // ← new
  | UserContextCancelMessage;    // ← new

export type MobileMessage =
  | ButtonTapMessage
  | AddTileMessage
  | RemoveTileMessage
  | SetTilePinnedMessage
  | SetTileIconMessage
  | ReorderTilesMessage
  | SearchAppsMessage
  | ValidatePathMessage
  | OpenActivationDialogMessage
  | GetLicenseStatusMessage
  | RevalidateLicenseMessage
  | AddContextShortcutMessage
  | RemoveContextShortcutMessage
  | GetContextProfilesMessage
  | MouseMoveMessage
  | MouseClickMessage
  | MouseScrollMessage
  | MediaVolumeDeltaMessage
  | MediaSetMuteMessage
  | MediaBringToFrontMessage
  | MediaPinAppMessage
  | MediaSetVolumeMessage
  | GetMediaStateMessage
  | GetPluginCatalogMessage
  | InstallPluginMessage
  | UninstallPluginMessage
  | SetPluginConnectionMessage
  | TestPluginConnectionMessage
  | ContextPermissionResponseMessage
  | GetRunHistoryMessage
  | UserContextResponseMessage;  // ← new
```

- [ ] **Step 4: Mirror all the same changes into `apps/mobile/src/types/schema.ts`**

`apps/mobile/src/types/schema.ts` is a copy of the shared schema used by the mobile app. Apply the identical additions: `user_input` in `ContextProviderId`, `ContextRole`, `UserInputMode`, extended `ToolContextRequirement`, three new message interfaces, updated `AgentMessage` and `MobileMessage` unions.

Note: `apps/mobile/src/types/schema.ts` does not have `ToolContextRequirement` in it currently — it's only in `packages/shared/src/schema.ts`. Skip that part for the mobile file; only add the message types and union changes.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd packages/shared && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schema.ts apps/mobile/src/types/schema.ts
git commit -m "feat(schema): add user_input context provider, request/response/cancel messages"
```

---

## Task 2: `UserContextRequestService` (agent)

**Files:**
- Create: `apps/agent/src/context/user-context-request.service.ts`
- Create: `apps/agent/src/context/user-context-request.service.spec.ts`

- [ ] **Step 1: Write the failing spec**

Create `apps/agent/src/context/user-context-request.service.spec.ts`:

```ts
import { UserContextRequestService, UserContextCanceledError } from './user-context-request.service';

describe('UserContextRequestService', () => {
  let service: UserContextRequestService;

  beforeEach(() => {
    service = new UserContextRequestService();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeClient() {
    return { send: jest.fn(), readyState: 1 } as any;
  }

  function baseParams(overrides: object = {}) {
    return {
      toolId: 'tool-1',
      packId: 'pack-1',
      title: 'Explain Mechanic',
      prompt: 'What mechanic do you want explained?',
      required: true,
      captureMode: 'text' as const,
      ...overrides,
    };
  }

  it('sends USER_CONTEXT_REQUEST to client on capture', async () => {
    const client = makeClient();
    const p = service.capture(client, baseParams());
    const msg = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
    expect(msg.type).toBe('USER_CONTEXT_REQUEST');
    expect(msg.toolId).toBe('tool-1');
    expect(msg.captureMode).toBe('text');
    service.handleResponse(msg.requestId, true);
    await expect(p).rejects.toThrow(UserContextCanceledError);
  });

  it('resolves with text when handleResponse called with canceled=false and non-empty text', async () => {
    const client = makeClient();
    const p = service.capture(client, baseParams());
    const msg = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
    service.handleResponse(msg.requestId, false, 'how do I use Killjoy?');
    const result = await p;
    expect(result.text).toBe('how do I use Killjoy?');
    expect(result.modality).toBe('text');
  });

  it('rejects with UserContextCanceledError when canceled=true', async () => {
    const client = makeClient();
    const p = service.capture(client, baseParams());
    const msg = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
    service.handleResponse(msg.requestId, true);
    await expect(p).rejects.toThrow(UserContextCanceledError);
  });

  it('rejects when text is empty even if canceled=false', async () => {
    const client = makeClient();
    const p = service.capture(client, baseParams());
    const msg = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
    service.handleResponse(msg.requestId, false, '   ');
    await expect(p).rejects.toThrow(UserContextCanceledError);
  });

  it('rejects after timeout and sends USER_CONTEXT_CANCEL', async () => {
    const client = makeClient();
    const p = service.capture(client, baseParams({ timeoutMs: 30_000 }));
    jest.advanceTimersByTime(30_000);
    await expect(p).rejects.toThrow(UserContextCanceledError);
    const calls = (client.send as jest.Mock).mock.calls.map((c: any[]) => JSON.parse(c[0]));
    const cancel = calls.find((m: any) => m.type === 'USER_CONTEXT_CANCEL');
    expect(cancel).toBeDefined();
  });

  it('cancels first request and sends USER_CONTEXT_CANCEL when second capture starts for same toolId', async () => {
    const client = makeClient();
    const p1 = service.capture(client, baseParams({ toolId: 'tool-x' }));
    const firstRequest = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);

    const p2 = service.capture(client, baseParams({ toolId: 'tool-x' }));

    // p1 should have been rejected by now (cancel happened synchronously)
    await expect(p1).rejects.toThrow(UserContextCanceledError);

    const allMsgs = (client.send as jest.Mock).mock.calls.map((c: any[]) => JSON.parse(c[0]));
    const cancelMsg = allMsgs.find((m: any) => m.type === 'USER_CONTEXT_CANCEL' && m.requestId === firstRequest.requestId);
    expect(cancelMsg).toBeDefined();

    // Resolve p2
    const secondRequest = allMsgs.filter((m: any) => m.type === 'USER_CONTEXT_REQUEST')[1];
    service.handleResponse(secondRequest.requestId, false, 'second answer');
    const result = await p2;
    expect(result.text).toBe('second answer');
  });

  it('handleResponse for unknown requestId is a no-op', () => {
    expect(() => service.handleResponse('unknown', false, 'text')).not.toThrow();
  });

  it('uses default 120-second timeout when timeoutMs is not provided', async () => {
    const client = makeClient();
    const p = service.capture(client, baseParams());
    jest.advanceTimersByTime(119_999);
    // still pending — no rejection yet
    let resolved = false;
    p.catch(() => { resolved = true; });
    await Promise.resolve(); // flush microtasks
    expect(resolved).toBe(false);
    jest.advanceTimersByTime(1);
    await expect(p).rejects.toThrow(UserContextCanceledError);
  });
});
```

- [ ] **Step 2: Run spec to confirm it fails**

```bash
cd apps/agent && npx jest --runInBand src/context/user-context-request.service.spec.ts
```

Expected: FAIL — `Cannot find module './user-context-request.service'`

- [ ] **Step 3: Implement `UserContextRequestService`**

Create `apps/agent/src/context/user-context-request.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import { UserContextRequestMessage, UserContextCancelMessage } from '@control-surface/shared';

export interface UserContextResult {
  text: string;
  modality: 'text' | 'speech';
}

export class UserContextCanceledError extends Error {
  constructor() { super('User canceled input'); this.name = 'UserContextCanceledError'; }
}

interface PendingEntry {
  resolve: (result: UserContextResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  toolId: string;
  client: WebSocket;
}

@Injectable()
export class UserContextRequestService {
  private readonly pending = new Map<string, PendingEntry>();
  // Keyed by (client, toolId) so two different clients can never cancel each other.
  private readonly pendingByClient = new Map<WebSocket, Map<string, string>>();

  handleResponse(requestId: string, canceled: boolean, text?: string): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.pending.delete(requestId);
    this.clearClientTool(entry.client, entry.toolId);
    clearTimeout(entry.timer);
    if (canceled || !text?.trim()) {
      entry.reject(new UserContextCanceledError());
    } else {
      entry.resolve({ text: text.trim(), modality: 'text' });
    }
  }

  async capture(
    client: WebSocket,
    params: {
      toolId: string;
      packId: string;
      title: string;
      prompt: string;
      required: boolean;
      captureMode: 'text' | 'speech' | 'speech_or_text';
      timeoutMs?: number;
    },
  ): Promise<UserContextResult> {
    const existingId = this.pendingByClient.get(client)?.get(params.toolId);
    if (existingId) this.cancelById(existingId);

    const requestId = randomUUID();
    if (!this.pendingByClient.has(client)) this.pendingByClient.set(client, new Map());
    this.pendingByClient.get(client)!.set(params.toolId, requestId);

    const msg: UserContextRequestMessage = {
      type: 'USER_CONTEXT_REQUEST',
      requestId,
      packId: params.packId,
      toolId: params.toolId,
      title: params.title,
      prompt: params.prompt,
      required: params.required,
      captureMode: params.captureMode,
      timeoutMs: params.timeoutMs,
    };
    client.send(JSON.stringify(msg));

    return new Promise<UserContextResult>((resolve, reject) => {
      const timeoutMs = params.timeoutMs ?? 120_000;
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        this.clearClientTool(client, params.toolId);
        const cancelMsg: UserContextCancelMessage = { type: 'USER_CONTEXT_CANCEL', requestId };
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(cancelMsg));
        reject(new UserContextCanceledError());
      }, timeoutMs);

      this.pending.set(requestId, { resolve, reject, timer, toolId: params.toolId, client });
    });
  }

  private cancelById(requestId: string): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.pending.delete(requestId);
    this.clearClientTool(entry.client, entry.toolId);
    clearTimeout(entry.timer);
    const cancelMsg: UserContextCancelMessage = { type: 'USER_CONTEXT_CANCEL', requestId };
    if (entry.client.readyState === WebSocket.OPEN) entry.client.send(JSON.stringify(cancelMsg));
    entry.reject(new UserContextCanceledError());
  }

  private clearClientTool(client: WebSocket, toolId: string): void {
    const map = this.pendingByClient.get(client);
    if (!map) return;
    map.delete(toolId);
    if (map.size === 0) this.pendingByClient.delete(client);
  }
}
```

- [ ] **Step 4: Run spec and confirm it passes**

```bash
cd apps/agent && npx jest --runInBand src/context/user-context-request.service.spec.ts
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/context/user-context-request.service.ts apps/agent/src/context/user-context-request.service.spec.ts
git commit -m "feat(agent): add UserContextRequestService for pre-run user intent capture"
```

---

## Task 3: Wire `UserContextRequestService` into the agent

**Files:**
- Modify: `apps/agent/src/context/context-runtime.module.ts`
- Modify: `apps/agent/src/websocket/ws.gateway.ts`
- Modify: `apps/agent/src/command/command.service.ts`

- [ ] **Step 1: Add `UserContextRequestService` to `ContextRuntimeModule`**

In `apps/agent/src/context/context-runtime.module.ts`, add the import and include in both `providers` and `exports`:

```ts
import { UserContextRequestService } from './user-context-request.service';

@Module({
  imports: [MediaModule, IntegrationsModule],
  providers: [
    ContextRegistryService,
    ClipboardProvider,
    ActiveWindowProvider,
    ActiveTerminalCwdProvider,
    ProjectWorkspaceProvider,
    GitContextProvider,
    MediaContextProvider,
    ObsContextProvider,
    ConsentStoreService,
    ConsentRequestService,
    ContextAssemblerService,
    UserContextRequestService,   // ← new
  ],
  exports: [
    ContextRegistryService,
    ConsentRequestService,
    ContextAssemblerService,
    UserContextRequestService,   // ← new
  ],
})
```

- [ ] **Step 2: Handle `USER_CONTEXT_RESPONSE` in `ws.gateway.ts`**

In `apps/agent/src/websocket/ws.gateway.ts`:

Add imports:
```ts
import { UserContextRequestService } from '../context/user-context-request.service';
import { UserContextResponseMessage } from '@control-surface/shared';
```

Add to the constructor parameters (after `consentRequestService`):
```ts
private readonly userContextRequestService: UserContextRequestService,
```

In the `client.on('message', ...)` handler, add before the final `if (data.type !== 'BUTTON_TAP') return;` line:

```ts
if (data.type === 'USER_CONTEXT_RESPONSE') {
  const d = data as UserContextResponseMessage;
  this.userContextRequestService.handleResponse(d.requestId, d.canceled, d.text);
  return;
}
```

- [ ] **Step 3: Update `CommandService` to pre-capture user intent**

In `apps/agent/src/command/command.service.ts`:

Add imports:
```ts
import { UserContextRequestService, UserContextCanceledError } from '../context/user-context-request.service';
```

Add to the constructor parameters:
```ts
private readonly userContextRequest: UserContextRequestService,
```

Replace the entire `AI_CLIPBOARD` case (lines 63–113 in the current file) with:

```ts
case 'AI_CLIPBOARD': {
  if (this.licenseService.creditsRemaining() <= 0) {
    return { success: false, quotaExceeded: true };
  }

  let prompt = action.prompt;
  let outputMode = action.outputMode;
  let context = '';

  if (action.toolId) {
    const tool = this.packRegistry.getById(action.toolId);
    if (!tool) {
      return { success: false, error: 'Pack tool not found — re-add the tile from the AI Tools tab' };
    }
    if (tool.kind === 'ai') {
      prompt = tool.prompt;
      outputMode = tool.outputMode;

      // Pre-resolve user_input before assembler runs
      let userIntent: string | undefined;
      const userInputReq = tool.contextRequirements?.find(r => r.provider === 'user_input' && r.required);
      if (userInputReq) {
        try {
          const captured = await this.userContextRequest.capture(client, {
            toolId: tool.id,
            packId: tool.packId,
            title: tool.label,
            prompt: userInputReq.reason,
            required: true,
            captureMode: (userInputReq.captureMode as 'text' | 'speech' | 'speech_or_text') ?? 'speech_or_text',
          });
          userIntent = captured.text;
        } catch (err) {
          if (err instanceof UserContextCanceledError) {
            return { success: false, error: 'Canceled' };
          }
          throw err;
        }
      }

      // Assembler only sees inferred providers — never user_input
      // Optional user_input (long-press/mic-modifier flow) is out of scope for this plan.
      // Only required user_input is pre-resolved above; optional entries are simply filtered out here.
      const inferredRequirements = tool.contextRequirements?.filter(r => r.provider !== 'user_input') ?? [];

      if (inferredRequirements.length) {
        try {
          const assembled = await this.assembler.assemble(
            inferredRequirements,
            client,
            tool.packId,
            tool.id,
          );
          context = userIntent
            ? `### User Intent\n${userIntent}${assembled ? `\n\n${assembled}` : ''}`
            : assembled;
        } catch (err) {
          if (err instanceof ContextAssemblyError) {
            return { success: false, error: err.message };
          }
          throw err;
        }
      } else if (userIntent) {
        context = `### User Intent\n${userIntent}`;
      } else {
        context = await this.clipboard.read();
      }
    } else {
      context = await this.clipboard.read();
    }
  } else {
    context = await this.clipboard.read();
  }

  console.log('[CommandService] AI_CLIPBOARD prompt:\n', prompt);
  console.log('[CommandService] AI_CLIPBOARD context:\n', context);
  const result = await this.aiRouter.call(prompt, context);
  this.licenseService.decrementCredit();
  if (outputMode === 'viewer') {
    return { success: true, output: result };
  }
  await this.clipboard.write(result);
  return { success: true };
}
```

- [ ] **Step 4: Verify agent compiles**

```bash
cd apps/agent && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run full agent test suite**

```bash
cd apps/agent && npx jest --runInBand
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/context/context-runtime.module.ts apps/agent/src/websocket/ws.gateway.ts apps/agent/src/command/command.service.ts
git commit -m "feat(agent): wire UserContextRequestService — pre-capture user intent before context assembly"
```

---

## Task 4: Mobile WebSocket service extension

**Files:**
- Modify: `apps/mobile/src/services/websocket.service.ts`

- [ ] **Step 1: Add new types and import the new message types**

At the top of `apps/mobile/src/services/websocket.service.ts`, add to the existing import from `../types/schema`:

```ts
import {
  // ... existing imports ...
  UserContextRequestMessage,
  UserContextCancelMessage,
  UserContextResponseMessage,
} from '../types/schema';
```

Add two new callback types after the existing `ConsentRequestCallback` type:

```ts
type UserContextRequestCallback = (msg: UserContextRequestMessage) => void;
type UserContextCancelCallback = (requestId: string) => void;
```

- [ ] **Step 2: Add private callback arrays to `WebSocketService`**

Inside the class body, add after `private consentRequestCallbacks`:

```ts
private userContextRequestCallbacks: UserContextRequestCallback[] = [];
private userContextCancelCallbacks: UserContextCancelCallback[] = [];
```

- [ ] **Step 3: Handle `USER_CONTEXT_REQUEST` and `USER_CONTEXT_CANCEL` in `onmessage`**

In the `ws.onmessage` handler, add after the `CONTEXT_PERMISSION_REQUEST` branch:

```ts
} else if (msg.type === 'USER_CONTEXT_REQUEST') {
  this.userContextRequestCallbacks.forEach((cb) => cb(msg as UserContextRequestMessage));
} else if (msg.type === 'USER_CONTEXT_CANCEL') {
  const cancelMsg = msg as UserContextCancelMessage;
  this.userContextCancelCallbacks.forEach((cb) => cb(cancelMsg.requestId));
}
```

- [ ] **Step 4: Add subscription methods and `sendUserContextResponse`**

Add after the `sendConsentResponse` method:

```ts
onUserContextRequest(cb: UserContextRequestCallback): () => void {
  this.userContextRequestCallbacks.push(cb);
  return () => {
    this.userContextRequestCallbacks = this.userContextRequestCallbacks.filter((c) => c !== cb);
  };
}

onUserContextCancel(cb: UserContextCancelCallback): () => void {
  this.userContextCancelCallbacks.push(cb);
  return () => {
    this.userContextCancelCallbacks = this.userContextCancelCallbacks.filter((c) => c !== cb);
  };
}

sendUserContextResponse(
  requestId: string,
  canceled: boolean,
  text?: string,
  modality?: 'text' | 'speech',
): void {
  const msg: UserContextResponseMessage = {
    type: 'USER_CONTEXT_RESPONSE',
    requestId,
    canceled,
    text,
    modality,
    capturedAt: new Date().toISOString(),
  };
  this.send(msg);
}
```

- [ ] **Step 5: Verify mobile TypeScript compiles**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/services/websocket.service.ts
git commit -m "feat(mobile): handle USER_CONTEXT_REQUEST/CANCEL, add sendUserContextResponse"
```

---

## Task 5: `UserContextSheet` component

**Files:**
- Create: `apps/mobile/src/components/UserContextSheet.tsx`

- [ ] **Step 1: Create the component**

Create `apps/mobile/src/components/UserContextSheet.tsx`:

```tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

interface Props {
  visible: boolean;
  title: string;
  prompt: string;
  captureMode: 'text' | 'speech' | 'speech_or_text';
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function UserContextSheet({ visible, title, prompt, onSubmit, onCancel }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText('');
      // Delay focus slightly so the modal animation completes first
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [visible]);

  const canSubmit = text.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(text.trim());
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onCancel} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.prompt}>{prompt}</Text>

          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Type or use keyboard mic…"
            placeholderTextColor="#666680"
            multiline
            maxLength={2000}
            onSubmitEditing={handleSubmit}
            returnKeyType="send"
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, !canSubmit && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
                Run
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  prompt: {
    color: '#9999BB',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#0D0D1E',
    color: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  cancelText: {
    color: '#AAAACC',
    fontSize: 15,
    fontWeight: '600',
  },
  submitButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#5B4FE8',
    alignItems: 'center',
  },
  submitDisabled: {
    backgroundColor: 'rgba(91,79,232,0.3)',
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  submitTextDisabled: {
    color: 'rgba(255,255,255,0.35)',
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
git add apps/mobile/src/components/UserContextSheet.tsx
git commit -m "feat(mobile): add UserContextSheet component for pre-run input capture"
```

---

## Task 6: Mobile hook + DeckScreen wiring

**Files:**
- Create: `apps/mobile/src/hooks/useUserContextRequest.ts`
- Modify: `apps/mobile/src/screens/DeckScreen.tsx`

- [ ] **Step 1: Create `useUserContextRequest` hook**

Create directory `apps/mobile/src/hooks/` if it does not exist, then create `apps/mobile/src/hooks/useUserContextRequest.ts`:

```ts
import { useState, useEffect, useCallback } from 'react';
import { WebSocketService } from '../services/websocket.service';
import type { UserContextRequestMessage } from '../types/schema';

export interface PendingUserContextRequest {
  requestId: string;
  packId: string;
  toolId: string;
  title: string;
  prompt: string;
  captureMode: 'text' | 'speech' | 'speech_or_text';
}

export function useUserContextRequest(ws: WebSocketService | null) {
  const [pending, setPending] = useState<PendingUserContextRequest | null>(null);

  useEffect(() => {
    if (!ws) return;

    const unsubRequest = ws.onUserContextRequest((msg: UserContextRequestMessage) => {
      setPending({
        requestId: msg.requestId,
        packId: msg.packId,
        toolId: msg.toolId,
        title: msg.title,
        prompt: msg.prompt,
        captureMode: msg.captureMode,
      });
    });

    const unsubCancel = ws.onUserContextCancel((requestId: string) => {
      setPending((prev) => (prev?.requestId === requestId ? null : prev));
    });

    return () => {
      unsubRequest();
      unsubCancel();
    };
  }, [ws]);

  const submit = useCallback(
    (text: string) => {
      if (!pending || !ws) return;
      ws.sendUserContextResponse(pending.requestId, false, text, 'text');
      setPending(null);
    },
    [pending, ws],
  );

  const cancel = useCallback(() => {
    if (!pending || !ws) return;
    ws.sendUserContextResponse(pending.requestId, true);
    setPending(null);
  }, [pending, ws]);

  return { pending, submit, cancel };
}
```

- [ ] **Step 2: Wire hook and sheet into `DeckScreen`**

In `apps/mobile/src/screens/DeckScreen.tsx`:

Add imports at the top:
```ts
import { useUserContextRequest } from '../hooks/useUserContextRequest';
import { UserContextSheet } from '../components/UserContextSheet';
```

Inside `DeckScreen()`, after the existing state declarations, add:
```ts
const { pending: userContextPending, submit: submitUserContext, cancel: cancelUserContext } =
  useUserContextRequest(wsService);
```

In the JSX return, add the sheet immediately before the closing `</SafeAreaView>` (or the outermost closing `</View>` of the component):
```tsx
<UserContextSheet
  visible={userContextPending !== null}
  title={userContextPending?.title ?? ''}
  prompt={userContextPending?.prompt ?? ''}
  captureMode={userContextPending?.captureMode ?? 'text'}
  onSubmit={submitUserContext}
  onCancel={cancelUserContext}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/hooks/useUserContextRequest.ts apps/mobile/src/screens/DeckScreen.tsx
git commit -m "feat(mobile): wire UserContextSheet into DeckScreen via useUserContextRequest hook"
```

---

## Task 7: Prompt composer upgrade

Update the assembler to: skip `user_input` requirements, group sections by tier (trusted vs supporting), accept a `userIntent` parameter, and produce structured output when user intent is present.

**Files:**
- Modify: `apps/agent/src/context/context-assembler.service.ts`
- Modify: `apps/agent/src/context/context-assembler.service.spec.ts`

- [ ] **Step 1: Add new tests for the upgraded output format**

Open `apps/agent/src/context/context-assembler.service.spec.ts` and add these tests inside the existing `describe` block:

```ts
it('skips user_input requirements without throwing', async () => {
  const result = await service.assemble(
    [{ provider: 'user_input', required: true, reason: 'intent' }],
    client, 'p', 't',
  );
  expect(result).toBe('');
  expect(registry.read).not.toHaveBeenCalled();
});

it('prepends User Intent section when userIntent is provided', async () => {
  registry.read.mockResolvedValue(makePayload('clipboard', 'some code'));
  const result = await service.assemble(
    [makeReq({ provider: 'clipboard' })],
    client, 'p', 't',
    'explain this to me',
  );
  expect(result).toMatch(/^### User Intent\nexplain this to me/);
  expect(result).toContain('### Clipboard\nsome code');
});

it('puts required provider before optional provider in output', async () => {
  registry.read
    .mockResolvedValueOnce(makePayload('git', 'branch: main'))
    .mockResolvedValueOnce(makePayload('clipboard', 'some code'));
  const result = await service.assemble(
    [
      makeReq({ provider: 'git', required: false }),
      makeReq({ provider: 'clipboard', required: true }),
    ],
    client, 'p', 't',
  );
  const clipPos = result.indexOf('### Clipboard');
  const gitPos = result.indexOf('### Git');
  expect(clipPos).toBeLessThan(gitPos);
});

it('returns only User Intent section when no inferred providers have content', async () => {
  const result = await service.assemble([], client, 'p', 't', 'what is up?');
  expect(result).toBe('### User Intent\nwhat is up?');
});
```

- [ ] **Step 2: Run tests to confirm new ones fail**

```bash
cd apps/agent && npx jest --runInBand src/context/context-assembler.service.spec.ts
```

Expected: existing tests pass, new four tests fail.

- [ ] **Step 3: Implement the upgraded assembler**

Replace the full contents of `apps/agent/src/context/context-assembler.service.ts` with:

```ts
import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';
import { ToolContextRequirement, ContextProviderId } from '@control-surface/shared';
import { ContextRegistryService } from './context-registry.service';
import { ConsentStoreService } from './consent-store.service';
import { ConsentRequestService } from './consent-request.service';

export class ContextAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextAssemblyError';
  }
}

const PROVIDER_LABELS: Record<ContextProviderId, string> = {
  user_input:      'User Intent',
  clipboard:       'Clipboard',
  active_window:   'Active Window',
  active_terminal: 'Terminal',
  project_files:   'Project Files',
  git:             'Git',
  media:           'Media',
  obs:             'OBS',
};

@Injectable()
export class ContextAssemblerService {
  constructor(
    private readonly contextRegistry: ContextRegistryService,
    private readonly consentStore: ConsentStoreService,
    private readonly consentRequest: ConsentRequestService,
  ) {}

  async assemble(
    requirements: ToolContextRequirement[],
    client: WebSocket,
    packId: string,
    toolId: string,
    userIntent?: string,
  ): Promise<string> {
    const trustedSections: string[] = [];
    const supportingSections: string[] = [];

    for (const req of requirements) {
      // user_input is always pre-resolved by CommandService — never route it here
      if (req.provider === 'user_input') continue;

      const label = PROVIDER_LABELS[req.provider] ?? req.provider;

      if (!this.consentStore.isGranted(packId, req.provider)) {
        const result = await this.consentRequest.request(client, {
          packId,
          providerId: req.provider,
          providerLabel: label,
          reason: req.reason,
        });

        if (!result.granted) {
          if (req.required) throw new ContextAssemblyError(`${label} access denied by user`);
          continue;
        }

        if (result.scope) this.consentStore.grant(packId, req.provider, result.scope);
      }

      let payload: Awaited<ReturnType<ContextRegistryService['read']>>;
      try {
        payload = await this.contextRegistry.read(req.provider, { toolId, packId });
      } catch (err) {
        if (req.required) {
          throw new ContextAssemblyError(
            `${label} required but unavailable: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        continue;
      }

      if (!payload.content) {
        if (req.required) {
          throw new ContextAssemblyError(`${label} required but unavailable: ${payload.provenance}`);
        }
        continue;
      }

      let content = payload.content;
      if (req.maxBytes && Buffer.byteLength(content, 'utf8') > req.maxBytes) {
        const buf = Buffer.from(content, 'utf8');
        let end = req.maxBytes;
        while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
        content = buf.slice(0, end).toString('utf8') + '\n[truncated]';
      }

      const section = `### ${label}\n${content}`;
      if (req.required) {
        trustedSections.push(section);
      } else {
        supportingSections.push(section);
      }
    }

    const allSections = [...trustedSections, ...supportingSections];

    if (!userIntent) {
      return allSections.join('\n\n');
    }

    const parts: string[] = [`### User Intent\n${userIntent}`];
    if (allSections.length) {
      parts.push(allSections.join('\n\n'));
    }
    return parts.join('\n\n');
  }
}
```

- [ ] **Step 4: Run all assembler tests**

```bash
cd apps/agent && npx jest --runInBand src/context/context-assembler.service.spec.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run full agent test suite**

```bash
cd apps/agent && npx jest --runInBand
```

Expected: all tests pass.

- [ ] **Step 6: Update `CommandService` to pass `userIntent` to the assembler**

In `apps/agent/src/command/command.service.ts`, update the `assemble` call inside the `AI_CLIPBOARD` case to pass `userIntent` as the fifth argument:

```ts
const assembled = await this.assembler.assemble(
  inferredRequirements,
  client,
  tool.packId,
  tool.id,
  userIntent,   // ← new fifth argument
);
// Remove the manual "### User Intent\n" prepend that was added in Task 3
// The assembler now handles this itself
context = assembled;
```

Remove the manual context composition that was added in Task 3 (the `userIntent ? \`### User Intent...\`` ternary). The assembler now handles this entirely.

The updated block in CommandService after the `assemble` call should be:
```ts
if (inferredRequirements.length) {
  try {
    context = await this.assembler.assemble(
      inferredRequirements,
      client,
      tool.packId,
      tool.id,
      userIntent,
    );
  } catch (err) {
    if (err instanceof ContextAssemblyError) {
      return { success: false, error: err.message };
    }
    throw err;
  }
} else if (userIntent) {
  context = `### User Intent\n${userIntent}`;
} else {
  context = await this.clipboard.read();
}
```

- [ ] **Step 7: Run full agent test suite one more time**

```bash
cd apps/agent && npx jest --runInBand
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/agent/src/context/context-assembler.service.ts apps/agent/src/context/context-assembler.service.spec.ts apps/agent/src/command/command.service.ts
git commit -m "feat(agent): structured prompt composer — User Intent first, trusted before supporting"
```

---

## Task 8: `ContextEvaluatorService` (domain classification)

**Files:**
- Create: `apps/agent/src/context/context-evaluator.service.ts`
- Create: `apps/agent/src/context/context-evaluator.service.spec.ts`
- Modify: `apps/agent/src/context/context-assembler.service.ts`
- Modify: `apps/agent/src/context/context-assembler.service.spec.ts`
- Modify: `apps/agent/src/context/context-runtime.module.ts`
- Modify: `apps/agent/src/command/command.service.ts`

- [ ] **Step 1: Write the failing spec for `ContextEvaluatorService`**

Create `apps/agent/src/context/context-evaluator.service.spec.ts`:

```ts
import { ContextEvaluatorService } from './context-evaluator.service';

describe('ContextEvaluatorService', () => {
  let service: ContextEvaluatorService;

  beforeEach(() => {
    service = new ContextEvaluatorService();
  });

  it('accepts content that matches the tool domain', () => {
    const result = service.evaluate(
      'The player spawned and picked up a loadout near the map objective',
      'gaming',
    );
    expect(result.decision).toBe('accepted');
  });

  it('rejects content that clearly matches a different domain', () => {
    // Two software keywords (import, const) — meets MIN_HITS=2, domain=software, tool domain=gaming → rejected
    const result = service.evaluate(
      'import { useState } from "react"; const [count, setCount] = useState(0);',
      'gaming',
    );
    expect(result.decision).toBe('rejected');
    expect(result.reason).toContain('domain_mismatch');
  });

  it('downgrades content with no domain signal', () => {
    const result = service.evaluate('https://example.com/page', 'gaming');
    expect(result.decision).toBe('downgraded');
    expect(result.reason).toBe('no_domain_signal');
  });

  it('downgrades empty content', () => {
    const result = service.evaluate('   ', 'gaming');
    expect(result.decision).toBe('downgraded');
    expect(result.reason).toBe('empty_content');
  });

  it('accepts software content for engineer tools', () => {
    const result = service.evaluate(
      'import { useState } from "react"; const [count, setCount] = useState(0);',
      'software',
    );
    expect(result.decision).toBe('accepted');
  });

  it('downgrades content with fewer than MIN_HITS keyword matches', () => {
    // Only one keyword match — below the 2-hit threshold
    const result = service.evaluate('there was a game', 'gaming');
    expect(result.decision).toBe('downgraded');
  });

  it('returns domain for known pack slugs', () => {
    expect(service.domainForPackSlug('gamer')).toBe('gaming');
    expect(service.domainForPackSlug('engineer')).toBe('software');
    expect(service.domainForPackSlug('unknown-pack')).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run spec to confirm it fails**

```bash
cd apps/agent && npx jest --runInBand src/context/context-evaluator.service.spec.ts
```

Expected: FAIL — `Cannot find module './context-evaluator.service'`

- [ ] **Step 3: Implement `ContextEvaluatorService`**

Create `apps/agent/src/context/context-evaluator.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

export type ContextDomain =
  | 'gaming'
  | 'software'
  | 'writing'
  | 'learning'
  | 'design'
  | 'social'
  | 'productivity'
  | 'media'
  | 'unknown';

export type ContextCandidateDecision = 'accepted' | 'downgraded' | 'rejected';

const MIN_HITS = 2;

const DOMAIN_KEYWORDS: Record<ContextDomain, string[]> = {
  gaming:       ['game', 'player', 'spawn', 'health', 'mana', 'loadout', 'map', 'quest', 'loot', 'kill', 'respawn', 'valorant', 'steam'],
  software:     ['function', 'class', 'import', 'const', 'error', 'stack', 'npm', 'git', 'commit', 'pull', 'branch', 'type', 'interface'],
  writing:      ['paragraph', 'sentence', 'story', 'character', 'plot', 'tone', 'draft', 'prose', 'chapter'],
  learning:     ['exam', 'quiz', 'lecture', 'notes', 'study', 'topic', 'flashcard', 'course', 'assignment'],
  design:       ['color', 'palette', 'font', 'spacing', 'layout', 'component', 'figma', 'ui', 'ux', 'accessibility'],
  social:       ['tweet', 'caption', 'hashtag', 'post', 'linkedin', 'audience', 'campaign', 'thread'],
  productivity: ['email', 'meeting', 'task', 'agenda', 'deadline', 'action', 'summary', 'priority'],
  media:        ['stream', 'obs', 'scene', 'audio', 'volume', 'broadcast', 'record'],
  unknown:      [],
};

const PACK_SLUG_TO_DOMAIN: Record<string, ContextDomain> = {
  gamer:        'gaming',
  engineer:     'software',
  writer:       'writing',
  student:      'learning',
  designer:     'design',
  social:       'social',
  productivity: 'productivity',
};

@Injectable()
export class ContextEvaluatorService {
  evaluate(
    content: string,
    toolDomain: ContextDomain,
  ): { decision: ContextCandidateDecision; reason?: string } {
    if (!content.trim()) {
      return { decision: 'downgraded', reason: 'empty_content' };
    }

    const lower = content.toLowerCase();
    let maxHits = 0;
    let detectedDomain: ContextDomain = 'unknown';

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as [ContextDomain, string[]][]) {
      if (domain === 'unknown') continue;
      const hits = keywords.filter((kw) => lower.includes(kw)).length;
      if (hits > maxHits) {
        maxHits = hits;
        detectedDomain = domain;
      }
    }

    if (maxHits < MIN_HITS) {
      return { decision: 'downgraded', reason: 'no_domain_signal' };
    }

    if (detectedDomain !== toolDomain) {
      return { decision: 'rejected', reason: `domain_mismatch:${detectedDomain}_vs_${toolDomain}` };
    }

    return { decision: 'accepted' };
  }

  domainForPackSlug(slug: string): ContextDomain {
    return PACK_SLUG_TO_DOMAIN[slug] ?? 'unknown';
  }
}
```

- [ ] **Step 4: Run spec to confirm it passes**

```bash
cd apps/agent && npx jest --runInBand src/context/context-evaluator.service.spec.ts
```

Expected: all tests pass.

- [ ] **Step 5: Add evaluator to `ContextRuntimeModule`**

In `apps/agent/src/context/context-runtime.module.ts`, import and add to providers and exports:

```ts
import { ContextEvaluatorService } from './context-evaluator.service';

// providers:
ContextEvaluatorService,

// exports:
ContextEvaluatorService,
```

- [ ] **Step 6: Inject `ContextEvaluatorService` into the assembler and add optional-provider evaluation**

In `apps/agent/src/context/context-assembler.service.ts`:

Add import:
```ts
import { ContextEvaluatorService } from './context-evaluator.service';
```

Update constructor:
```ts
constructor(
  private readonly contextRegistry: ContextRegistryService,
  private readonly consentStore: ConsentStoreService,
  private readonly consentRequest: ConsentRequestService,
  private readonly evaluator?: ContextEvaluatorService,
) {}
```

> **Note:** The evaluator is declared optional (`?`) so the existing assembler tests continue to compile without passing it. In the NestJS module context it is always provided. The `if (!req.required && packSlug && this.evaluator)` guard in the loop handles the `undefined` case safely.
```

Update `assemble()` signature to accept `packSlug`:
```ts
async assemble(
  requirements: ToolContextRequirement[],
  client: WebSocket,
  packId: string,
  toolId: string,
  userIntent?: string,
  packSlug?: string,
): Promise<string>
```

Inside the loop, after truncation and before the `sections.push`, add rejection logic for **optional** providers only:

```ts
// After the content truncation block, before pushing to sections:
if (!req.required && packSlug && this.evaluator) {
  const toolDomain = this.evaluator.domainForPackSlug(packSlug);
  if (toolDomain !== 'unknown') {
    const evalResult = this.evaluator.evaluate(content, toolDomain);
    if (evalResult.decision === 'rejected') {
      console.log(`[Assembler] Rejected ${label}: ${evalResult.reason}`);
      continue;
    }
  }
}

const section = `### ${label}\n${content}`;
if (req.required) {
  trustedSections.push(section);
} else {
  supportingSections.push(section);
}
```

- [ ] **Step 7: Update `ContextAssemblerService` spec's `beforeEach` to provide the evaluator**

In `apps/agent/src/context/context-assembler.service.spec.ts`, update `beforeEach`:

```ts
let evaluator: jest.Mocked<Pick<ContextEvaluatorService, 'evaluate' | 'domainForPackSlug'>>;

beforeEach(() => {
  registry = { read: jest.fn() };
  consentStore = { isGranted: jest.fn().mockReturnValue(true), grant: jest.fn() };
  consentRequest = { request: jest.fn() };
  evaluator = {
    evaluate: jest.fn().mockReturnValue({ decision: 'accepted' }),
    domainForPackSlug: jest.fn().mockReturnValue('unknown'),
  };
  service = new ContextAssemblerService(
    registry as any,
    consentStore as any,
    consentRequest as any,
    evaluator as any,
  );
});
```

Add import at the top:
```ts
import { ContextEvaluatorService } from './context-evaluator.service';
```

Add a test for the rejection path:
```ts
it('skips optional provider when evaluator rejects it', async () => {
  registry.read.mockResolvedValue(makePayload('clipboard', 'function doThing() {}'));
  evaluator.domainForPackSlug.mockReturnValue('gaming');
  evaluator.evaluate.mockReturnValue({ decision: 'rejected', reason: 'domain_mismatch:software_vs_gaming' });
  const result = await service.assemble(
    [makeReq({ provider: 'clipboard', required: false })],
    client, 'p', 't', undefined, 'gamer',
  );
  expect(result).toBe('');
});

it('does not reject required providers even when evaluator would reject', async () => {
  registry.read.mockResolvedValue(makePayload('clipboard', 'function doThing() {}'));
  evaluator.domainForPackSlug.mockReturnValue('gaming');
  evaluator.evaluate.mockReturnValue({ decision: 'rejected', reason: 'domain_mismatch:software_vs_gaming' });
  const result = await service.assemble(
    [makeReq({ provider: 'clipboard', required: true })],
    client, 'p', 't', undefined, 'gamer',
  );
  expect(result).toContain('### Clipboard');
});
```

- [ ] **Step 8: Run full assembler spec**

```bash
cd apps/agent && npx jest --runInBand src/context/context-assembler.service.spec.ts
```

Expected: all tests pass.

- [ ] **Step 9: Update `CommandService` to pass `packSlug` to assembler**

In `apps/agent/src/command/command.service.ts`, in the `AI_CLIPBOARD` case, derive the pack slug and pass it to `assemble()`:

```ts
// After getting the tool, look up its pack slug:
const packs = this.packRegistry.getPacks();
const packSlug = packs.find(p => p.id === tool.packId)?.slug;

// Pass packSlug as sixth argument to assemble:
context = await this.assembler.assemble(
  inferredRequirements,
  client,
  tool.packId,
  tool.id,
  userIntent,
  packSlug,
);
```

- [ ] **Step 10: Run full agent test suite**

```bash
cd apps/agent && npx jest --runInBand
```

Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add apps/agent/src/context/context-evaluator.service.ts apps/agent/src/context/context-evaluator.service.spec.ts apps/agent/src/context/context-assembler.service.ts apps/agent/src/context/context-assembler.service.spec.ts apps/agent/src/context/context-runtime.module.ts apps/agent/src/command/command.service.ts
git commit -m "feat(agent): ContextEvaluatorService — reject dirty clipboard when domain conflicts with tool"
```

---

## Task 9: Gamer pack migration

**Files:**
- Create: `supabase/migrations/20260525000020_gamer_user_input_requirements.sql`
- Modify: `supabase/seed/packs.sql` — seed must match the migration or re-seeding will overwrite it

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260525000020_gamer_user_input_requirements.sql`:

```sql
-- Replace clipboard-required with user_input-required for question-driven Gamer tools.
-- Clipboard becomes optional and relevance-checked for these tools.
-- Affected: Explain Mechanic, Build Optimizer, Callout Phrases, Counter Strategy, Quest Helper.
-- Lore Summary and Active Game Tip are unchanged (clipboard/environment-driven).

WITH gamer_tools(label, requirements) AS (
  VALUES
    ('Explain Mechanic', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The specific mechanic, keybind, agent, item, or rule to explain"},
      {"provider":"clipboard","required":false,"reason":"Any game text, patch notes, or ability description for additional context","maxBytes":10000},
      {"provider":"active_window","required":false,"reason":"Foreground game or launcher name","maxBytes":1000}
    ]'::jsonb),
    ('Build Optimizer', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The build, loadout, or playstyle to optimize"},
      {"provider":"clipboard","required":false,"reason":"Current build stats, loadout details, or constraints","maxBytes":12000},
      {"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}
    ]'::jsonb),
    ('Callout Phrases', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The in-game situation, objective, or map area to generate callouts for"},
      {"provider":"clipboard","required":false,"reason":"Map description or objective context","maxBytes":8000},
      {"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}
    ]'::jsonb),
    ('Counter Strategy', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The strategy, champion, agent, weapon, or loadout to counter"},
      {"provider":"clipboard","required":false,"reason":"Any notes or patch text about the target strategy or opponent","maxBytes":10000},
      {"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}
    ]'::jsonb),
    ('Quest Helper', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The quest name, objective description, or specific blocker you are stuck on"},
      {"provider":"clipboard","required":false,"reason":"Quest text, objective description, or walkthrough excerpt","maxBytes":10000},
      {"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}
    ]'::jsonb)
)
UPDATE public.pack_tools AS tool
SET context_requirements = gamer_tools.requirements
FROM gamer_tools
JOIN public.packs AS pack ON pack.slug = 'gamer'
WHERE tool.pack_id = pack.id
  AND tool.label = gamer_tools.label;
```

- [ ] **Step 2: Update `supabase/seed/packs.sql` to match the migration**

In `supabase/seed/packs.sql`, replace the `context_requirements` for the 5 affected Gamer tool rows (lines ~96–124). Each goes from `clipboard required:true` to `user_input required:true` + `clipboard required:false`:

```sql
-- Explain Mechanic (around line 96)
'[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The specific mechanic, keybind, agent, item, or rule to explain"},{"provider":"clipboard","required":false,"reason":"Any game text, patch notes, or ability description for additional context","maxBytes":10000},{"provider":"active_window","required":false,"reason":"Foreground game or launcher name","maxBytes":1000}]'::jsonb

-- Build Optimizer (around line 101)
'[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The build, loadout, or playstyle to optimize"},{"provider":"clipboard","required":false,"reason":"Current build stats, loadout details, or constraints","maxBytes":12000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb

-- Callout Phrases (around line 111)
'[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The in-game situation, objective, or map area to generate callouts for"},{"provider":"clipboard","required":false,"reason":"Map description or objective context","maxBytes":8000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb

-- Counter Strategy (around line 116)
'[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The strategy, champion, agent, weapon, or loadout to counter"},{"provider":"clipboard","required":false,"reason":"Any notes or patch text about the target strategy or opponent","maxBytes":10000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb

-- Quest Helper (around line 121)
'[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The quest name, objective description, or specific blocker you are stuck on"},{"provider":"clipboard","required":false,"reason":"Quest text, objective description, or walkthrough excerpt","maxBytes":10000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb
```

Leave Lore Summary and Active Game Tip unchanged.

- [ ] **Step 4: Verify the migration targets the correct rows**

Before applying, run this read-only check against your local Supabase instance (or staging) to confirm 5 rows match:

```sql
SELECT tool.label, pack.slug
FROM public.pack_tools AS tool
JOIN public.packs AS pack ON pack.id = tool.pack_id
WHERE pack.slug = 'gamer'
  AND tool.label IN ('Explain Mechanic','Build Optimizer','Callout Phrases','Counter Strategy','Quest Helper');
```

Expected: 5 rows returned.

- [ ] **Step 5: Apply the migration**

```bash
npx supabase db push
```

Or if using local dev:
```bash
npx supabase migration up
```

- [ ] **Step 6: Verify migration applied**

```sql
SELECT tool.label, jsonb_array_elements(tool.context_requirements)->>'provider' AS provider,
       jsonb_array_elements(tool.context_requirements)->>'required' AS required
FROM public.pack_tools AS tool
JOIN public.packs AS pack ON pack.id = tool.pack_id
WHERE pack.slug = 'gamer'
  AND tool.label = 'Explain Mechanic';
```

Expected: three rows — `user_input/true`, `clipboard/false`, `active_window/false`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260525000020_gamer_user_input_requirements.sql supabase/seed/packs.sql
git commit -m "feat(migrations): gamer question-driven tools require user_input instead of clipboard"
```

---

## Task 10: CommandService integration tests

**Files:**
- Create: `apps/agent/src/command/command.service.spec.ts`

These tests verify the critical AI_CLIPBOARD + user_input flow end-to-end at the service boundary, covering the three behaviors that matter most: blocking the AI call when input is required, filtering `user_input` out of assembler requirements, and skipping credit decrement on cancel.

- [ ] **Step 1: Write the failing spec**

Create `apps/agent/src/command/command.service.spec.ts`:

```ts
import { CommandService } from './command.service';
import { UserContextRequestService, UserContextCanceledError } from '../context/user-context-request.service';
import { ContextAssemblerService } from '../context/context-assembler.service';

const mockPackTool = (overrides = {}) => ({
  id: 'tool-1',
  packId: 'pack-gamer',
  label: 'Explain Mechanic',
  kind: 'ai',
  prompt: 'Explain this mechanic.',
  outputMode: 'viewer',
  contextRequirements: [
    { provider: 'user_input', required: true, captureMode: 'speech_or_text', reason: 'What to explain' },
    { provider: 'clipboard', required: false, reason: 'Game text for context', maxBytes: 10000 },
  ],
  ...overrides,
});

function makeService(overrides: {
  captureResult?: Awaited<ReturnType<UserContextRequestService['capture']>>;
  captureError?: Error;
  assembleResult?: string;
  credits?: number;
}) {
  const userContextRequest = {
    capture: jest.fn().mockImplementation(() => {
      if (overrides.captureError) return Promise.reject(overrides.captureError);
      return Promise.resolve(overrides.captureResult ?? { text: 'What does killjoy alarmbot do?', modality: 'text' });
    }),
    cancelForClient: jest.fn(),
  } as unknown as UserContextRequestService;

  const assembler = {
    assemble: jest.fn().mockResolvedValue(overrides.assembleResult ?? ''),
  } as unknown as ContextAssemblerService;

  const packRegistry = {
    getById: jest.fn().mockReturnValue(mockPackTool()),
    getPacks: jest.fn().mockReturnValue([{ id: 'pack-gamer', slug: 'gamer' }]),
  };

  const licenseService = {
    creditsRemaining: jest.fn().mockReturnValue(overrides.credits ?? 10),
    decrementCredits: jest.fn(),
  };

  const clipboard = { read: jest.fn().mockResolvedValue('clipboard text') };
  const aiProxy = { run: jest.fn().mockResolvedValue({ output: 'AI answer', tokensUsed: 1 }) };

  const service = new CommandService(
    userContextRequest as any,
    assembler as any,
    packRegistry as any,
    licenseService as any,
    clipboard as any,
    aiProxy as any,
  );

  return { service, userContextRequest, assembler, licenseService };
}

describe('CommandService — AI_CLIPBOARD + user_input', () => {
  const mockClient = {} as any;
  const baseAction = { type: 'AI_CLIPBOARD' as const, toolId: 'tool-1', prompt: '', outputMode: 'viewer' as const };

  it('captures user intent before calling the assembler', async () => {
    const { service, userContextRequest, assembler } = makeService({});
    await service.handle(mockClient, baseAction);

    expect(userContextRequest.capture).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({ toolId: 'tool-1', required: true }),
    );
    // assembler must be called AFTER capture resolves
    expect(assembler.assemble).toHaveBeenCalled();
    const callOrder = (userContextRequest.capture as jest.Mock).mock.invocationCallOrder[0];
    const assembleOrder = (assembler.assemble as jest.Mock).mock.invocationCallOrder[0];
    expect(callOrder).toBeLessThan(assembleOrder);
  });

  it('filters user_input out of assembler requirements', async () => {
    const { service, assembler } = makeService({});
    await service.handle(mockClient, baseAction);

    const [reqs] = (assembler.assemble as jest.Mock).mock.calls[0] as [any[], ...any[]];
    expect(reqs.every((r: any) => r.provider !== 'user_input')).toBe(true);
  });

  it('returns canceled and skips AI call when user cancels', async () => {
    const { service, licenseService } = makeService({ captureError: new UserContextCanceledError() });

    const result = await service.handle(mockClient, baseAction);

    expect(result).toMatchObject({ success: false, error: 'Canceled' });
    expect(licenseService.decrementCredits).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run spec to confirm it fails**

```bash
cd apps/agent && npx jest --runInBand src/command/command.service.spec.ts
```

Expected: FAIL — the spec file drives actual CommandService wiring, which won't compile until Tasks 2 and 3 are complete. Run this spec as a final integration check after those tasks.

- [ ] **Step 3: Run spec after Task 3 is complete**

```bash
cd apps/agent && npx jest --runInBand src/command/command.service.spec.ts
```

Expected: all 3 tests pass.

- [ ] **Step 4: Run full agent suite to check for regressions**

```bash
cd apps/agent && npx jest --runInBand
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/command/command.service.spec.ts
git commit -m "test(agent): CommandService covers required user_input capture, filter, and cancel"
```

---

## Manual Acceptance Scenarios

Run these manually on device before considering the feature complete.

**Scenario 1 — Gamer / Explain Mechanic with dirty clipboard**
1. Copy some code (e.g., `const x = () => {}`) to clipboard.
2. Open a game (Valorant) so it's the active window.
3. Tap Gamer → Explain Mechanic.
4. The `UserContextSheet` appears with the title "Explain Mechanic".
5. Type "How do I use Killjoy's Alarmbot?" and tap Run.
6. Verify the AI answers about the mechanic.
7. Verify the code clipboard content is rejected (domain mismatch: software vs gaming).

**Scenario 2 — Gamer / Active Game Tip (no sheet)**
1. Open a game as the active window.
2. Tap Gamer → Active Game Tip.
3. Verify: no `UserContextSheet` appears — run proceeds immediately.
4. Verify: the AI gives a tip based on the active game.

**Scenario 3 — Engineer / Review Code (no sheet)**
1. Copy a code diff.
2. Tap Engineer → Review Code.
3. Verify: no sheet appears — runs immediately on clipboard content.

**Scenario 4 — Cancel required input**
1. Tap Gamer → Explain Mechanic.
2. The sheet appears.
3. Tap Cancel.
4. Verify: no AI call is made and the tile returns to idle state.

**Scenario 5 — Retap while sheet is open**
1. Tap Gamer → Explain Mechanic — sheet appears.
2. Tap the same tile again before submitting.
3. Verify: the old sheet dismisses and a fresh sheet appears (concurrent tap cancellation).
