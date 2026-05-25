# Context Assembler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-source `PackTool.source` with a multi-provider `ContextAssemblerService` that reads all `contextRequirements`, gates each on user consent, and assembles a labeled markdown context block for the AI model.

**Architecture:** `WsGateway` threads a `WebSocket client` through `CommandService.execute(action, client)` into `ContextAssemblerService.assemble(requirements, client, packId, toolId)`. The assembler checks/requests consent via `ConsentRequestService`, reads each declared provider from `ContextRegistryService`, and assembles `### Section\ncontent` blocks. A required-provider failure throws `ContextAssemblyError` which `CommandService` converts to `{ success: false, error }`.

**Tech Stack:** NestJS `@Injectable()`, TypeScript strict, Jest + ts-jest, `ws` WebSocket, `@control-surface/shared` for shared types.

---

### Task 1: ConsentRequestService

Extracts the consent request lifecycle (pending Map, 60-second timeout, requestId matching) from `WsGateway` into its own injectable service. `WsGateway` will delegate `CONTEXT_PERMISSION_RESPONSE` handling to it. `ContextAssemblerService` will call it to prompt the user before reading a provider.

**Files:**
- Create: `apps/agent/src/context/consent-request.service.ts`
- Create: `apps/agent/src/context/consent-request.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/agent/src/context/consent-request.service.spec.ts`:

```typescript
import { ConsentRequestService } from './consent-request.service';

describe('ConsentRequestService', () => {
  let service: ConsentRequestService;

  beforeEach(() => {
    service = new ConsentRequestService();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves granted=true with scope when handleResponse called before timeout', async () => {
    const client = { send: jest.fn() } as any;
    const promise = service.request(client, {
      packId: 'pack-1',
      providerId: 'clipboard',
      providerLabel: 'Clipboard',
      reason: 'test reason',
    });
    const msg = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
    service.handleResponse(msg.requestId, true, 'once');
    const result = await promise;
    expect(result).toEqual({ granted: true, scope: 'once' });
  });

  it('resolves granted=false after 60-second timeout', async () => {
    const client = { send: jest.fn() } as any;
    const promise = service.request(client, {
      packId: 'pack-1',
      providerId: 'clipboard',
      providerLabel: 'Clipboard',
      reason: 'test reason',
    });
    jest.advanceTimersByTime(60_000);
    const result = await promise;
    expect(result).toEqual({ granted: false });
  });

  it('handleResponse for unknown requestId is a no-op', () => {
    expect(() => service.handleResponse('unknown', true, 'once')).not.toThrow();
  });

  it('sends a CONTEXT_PERMISSION_REQUEST message to the client', async () => {
    const client = { send: jest.fn() } as any;
    service.request(client, {
      packId: 'pack-1',
      providerId: 'git',
      providerLabel: 'Git',
      reason: 'needs git history',
    });
    const msg = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
    expect(msg.type).toBe('CONTEXT_PERMISSION_REQUEST');
    expect(msg.packId).toBe('pack-1');
    expect(msg.providerId).toBe('git');
    expect(msg.scopeOptions).toEqual(['once', 'session', 'permanent']);
    service.handleResponse(msg.requestId, false);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```
cd apps/agent
npx jest consent-request.service.spec --runInBand
```

Expected: FAIL — "Cannot find module './consent-request.service'"

- [ ] **Step 3: Implement ConsentRequestService**

Create `apps/agent/src/context/consent-request.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';
import { ConsentScope, ContextPermissionRequestMessage } from '@control-surface/shared';

@Injectable()
export class ConsentRequestService {
  private readonly pending = new Map<string, (granted: boolean, scope?: ConsentScope) => void>();

  handleResponse(requestId: string, granted: boolean, scope?: ConsentScope): void {
    const resolve = this.pending.get(requestId);
    if (resolve) {
      this.pending.delete(requestId);
      resolve(granted, scope);
    }
  }

  async request(
    client: WebSocket,
    params: {
      packId: string;
      providerId: string;
      providerLabel: string;
      reason: string;
    },
  ): Promise<{ granted: boolean; scope?: ConsentScope }> {
    const requestId = Math.random().toString(36).slice(2);
    const msg: ContextPermissionRequestMessage = {
      type: 'CONTEXT_PERMISSION_REQUEST',
      requestId,
      packId: params.packId,
      providerId: params.providerId,
      providerLabel: params.providerLabel,
      reason: params.reason,
      scopeOptions: ['once', 'session', 'permanent'],
    };
    client.send(JSON.stringify(msg));

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ granted: false });
      }, 60_000);

      this.pending.set(requestId, (granted, scope) => {
        clearTimeout(timer);
        resolve({ granted, scope });
      });
    });
  }
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```
npx jest consent-request.service.spec --runInBand
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```
git add apps/agent/src/context/consent-request.service.ts apps/agent/src/context/consent-request.service.spec.ts
git commit -m "feat(consent): ConsentRequestService — extracted from WsGateway"
```

---

### Task 2: Refactor WsGateway consent handling

Remove `pendingConsentRequests` Map and `requestConsent()` from `WsGateway`. Inject `ConsentRequestService` and delegate `CONTEXT_PERMISSION_RESPONSE` messages to it. Pure refactor — no behaviour change.

**Files:**
- Modify: `apps/agent/src/websocket/ws.gateway.ts`

- [ ] **Step 1: Add ConsentRequestService import**

At the top of `apps/agent/src/websocket/ws.gateway.ts`, add:

```typescript
import { ConsentRequestService } from '../context/consent-request.service';
```

- [ ] **Step 2: Remove pendingConsentRequests field**

Delete this line from the class body:

```typescript
private readonly pendingConsentRequests = new Map<string, (granted: boolean, scope?: ConsentScope) => void>();
```

- [ ] **Step 3: Add ConsentRequestService to constructor**

Add `consentRequestService` as the last constructor parameter (after `connectorService`):

```typescript
private readonly consentRequestService: ConsentRequestService,
```

- [ ] **Step 4: Update CONTEXT_PERMISSION_RESPONSE handler**

Replace:
```typescript
if (data.type === 'CONTEXT_PERMISSION_RESPONSE') {
  const d = data as ContextPermissionResponseMessage;
  const resolve = this.pendingConsentRequests.get(d.requestId);
  if (resolve) {
    this.pendingConsentRequests.delete(d.requestId);
    resolve(d.granted, d.scope);
  }
  return;
}
```

With:
```typescript
if (data.type === 'CONTEXT_PERMISSION_RESPONSE') {
  const d = data as ContextPermissionResponseMessage;
  this.consentRequestService.handleResponse(d.requestId, d.granted, d.scope);
  return;
}
```

- [ ] **Step 5: Delete the requestConsent() method**

Delete the entire `requestConsent()` method from `WsGateway` (it was public but never called — it is now replaced by `ConsentRequestService.request()`):

```typescript
async requestConsent(
  client: WebSocket,
  packId: string,
  providerId: string,
  providerLabel: string,
  reason: string,
): Promise<{ granted: boolean; scope?: ConsentScope }> {
  // ... entire body
}
```

- [ ] **Step 6: Run full test suite**

```
npx jest --runInBand
```

Expected: all tests pass (same count as before)

- [ ] **Step 7: Commit**

```
git add apps/agent/src/websocket/ws.gateway.ts
git commit -m "refactor(gateway): delegate consent requests to ConsentRequestService"
```

---

### Task 3: ContextAssemblerService

The core of this feature. Reads each `ToolContextRequirement` sequentially: checks consent (requests if not granted), reads the provider via `ContextRegistryService`, truncates to `maxBytes`, and appends a labeled `### Section` block. Throws `ContextAssemblyError` when a required provider is denied or unavailable.

**Files:**
- Create: `apps/agent/src/context/context-assembler.service.ts`
- Create: `apps/agent/src/context/context-assembler.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/agent/src/context/context-assembler.service.spec.ts`:

```typescript
import { ContextAssemblerService, ContextAssemblyError } from './context-assembler.service';
import { ContextRegistryService } from './context-registry.service';
import { ConsentStoreService } from './consent-store.service';
import { ConsentRequestService } from './consent-request.service';
import { ToolContextRequirement } from '@control-surface/shared';

function makeReq(overrides: Partial<ToolContextRequirement> = {}): ToolContextRequirement {
  return { provider: 'clipboard', required: true, reason: 'needs it', ...overrides };
}

function makePayload(providerId: string, content: string) {
  return { providerId, content, byteSize: Buffer.byteLength(content, 'utf8'), provenance: 'test' };
}

describe('ContextAssemblerService', () => {
  let service: ContextAssemblerService;
  let registry: jest.Mocked<Pick<ContextRegistryService, 'read'>>;
  let consentStore: jest.Mocked<Pick<ConsentStoreService, 'isGranted' | 'grant'>>;
  let consentRequest: jest.Mocked<Pick<ConsentRequestService, 'request'>>;
  const client = {} as any;

  beforeEach(() => {
    registry = { read: jest.fn() };
    consentStore = { isGranted: jest.fn().mockReturnValue(true), grant: jest.fn() };
    consentRequest = { request: jest.fn() };
    service = new ContextAssemblerService(
      registry as any,
      consentStore as any,
      consentRequest as any,
    );
  });

  it('returns empty string for empty requirements', async () => {
    expect(await service.assemble([], client, 'p', 't')).toBe('');
  });

  it('assembles a labeled section for an available provider', async () => {
    registry.read.mockResolvedValue(makePayload('project_files', 'README: hello world'));
    const result = await service.assemble(
      [makeReq({ provider: 'project_files' })],
      client, 'p', 't',
    );
    expect(result).toBe('### Project Files\nREADME: hello world');
  });

  it('assembles multiple sections separated by a blank line', async () => {
    registry.read
      .mockResolvedValueOnce(makePayload('project_files', 'readme content'))
      .mockResolvedValueOnce(makePayload('git', 'branch: master'));
    const result = await service.assemble(
      [makeReq({ provider: 'project_files' }), makeReq({ provider: 'git' })],
      client, 'p', 't',
    );
    expect(result).toBe('### Project Files\nreadme content\n\n### Git\nbranch: master');
  });

  it('skips optional provider when content is empty', async () => {
    registry.read.mockResolvedValue(makePayload('git', ''));
    const result = await service.assemble(
      [makeReq({ provider: 'git', required: false })],
      client, 'p', 't',
    );
    expect(result).toBe('');
  });

  it('throws ContextAssemblyError for required provider with empty content', async () => {
    registry.read.mockResolvedValue({ providerId: 'git', content: '', byteSize: 0, provenance: 'not a git repo' });
    await expect(
      service.assemble([makeReq({ provider: 'git', required: true })], client, 'p', 't'),
    ).rejects.toThrow(ContextAssemblyError);
  });

  it('error message includes provider label and provenance', async () => {
    registry.read.mockResolvedValue({ providerId: 'git', content: '', byteSize: 0, provenance: 'not a git repo' });
    await expect(
      service.assemble([makeReq({ provider: 'git', required: true })], client, 'p', 't'),
    ).rejects.toThrow('Git required but unavailable: not a git repo');
  });

  it('skips optional provider when consent denied', async () => {
    consentStore.isGranted.mockReturnValue(false);
    consentRequest.request.mockResolvedValue({ granted: false });
    const result = await service.assemble(
      [makeReq({ provider: 'clipboard', required: false })],
      client, 'p', 't',
    );
    expect(result).toBe('');
    expect(registry.read).not.toHaveBeenCalled();
  });

  it('throws ContextAssemblyError when consent denied for required provider', async () => {
    consentStore.isGranted.mockReturnValue(false);
    consentRequest.request.mockResolvedValue({ granted: false });
    await expect(
      service.assemble([makeReq({ provider: 'clipboard', required: true })], client, 'p', 't'),
    ).rejects.toThrow('Clipboard access denied by user');
  });

  it('grants consent to ConsentStore when user approves', async () => {
    consentStore.isGranted.mockReturnValue(false);
    consentRequest.request.mockResolvedValue({ granted: true, scope: 'session' });
    registry.read.mockResolvedValue(makePayload('clipboard', 'hello'));
    await service.assemble([makeReq({ provider: 'clipboard' })], client, 'pack-1', 't');
    expect(consentStore.grant).toHaveBeenCalledWith('pack-1', 'clipboard', 'session');
  });

  it('does not call consentRequest when already granted', async () => {
    consentStore.isGranted.mockReturnValue(true);
    registry.read.mockResolvedValue(makePayload('clipboard', 'hello'));
    await service.assemble([makeReq({ provider: 'clipboard' })], client, 'p', 't');
    expect(consentRequest.request).not.toHaveBeenCalled();
  });

  it('truncates content to maxBytes and appends [truncated]', async () => {
    registry.read.mockResolvedValue(makePayload('clipboard', 'a'.repeat(200)));
    const result = await service.assemble(
      [makeReq({ provider: 'clipboard', maxBytes: 50 })],
      client, 'p', 't',
    );
    expect(result).toContain('[truncated]');
    const content = result.replace('### Clipboard\n', '').replace('\n[truncated]', '');
    expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(50);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```
npx jest context-assembler.service.spec --runInBand
```

Expected: FAIL — "Cannot find module './context-assembler.service'"

- [ ] **Step 3: Implement ContextAssemblerService**

Create `apps/agent/src/context/context-assembler.service.ts`:

```typescript
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
  ): Promise<string> {
    const sections: string[] = [];

    for (const req of requirements) {
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

      const payload = await this.contextRegistry.read(req.provider, { toolId, packId });

      if (!payload.content) {
        if (req.required) {
          throw new ContextAssemblyError(`${label} required but unavailable: ${payload.provenance}`);
        }
        continue;
      }

      let content = payload.content;
      if (req.maxBytes && Buffer.byteLength(content, 'utf8') > req.maxBytes) {
        content = content.slice(0, req.maxBytes) + '\n[truncated]';
      }

      sections.push(`### ${label}\n${content}`);
    }

    return sections.join('\n\n');
  }
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```
npx jest context-assembler.service.spec --runInBand
```

Expected: PASS — 11 tests

- [ ] **Step 5: Commit**

```
git add apps/agent/src/context/context-assembler.service.ts apps/agent/src/context/context-assembler.service.spec.ts
git commit -m "feat(context): ContextAssemblerService — multi-provider consent-gated context assembly"
```

---

### Task 4: Register new services in ContextRuntimeModule

`ConsentStoreService`, `ConsentRequestService`, and `ContextAssemblerService` must appear in `ContextRuntimeModule.providers`. `ConsentRequestService` and `ContextAssemblerService` must be exported so `WsGateway` and `CommandService` (both in `AppModule`) can inject them.

**Files:**
- Modify: `apps/agent/src/context/context-runtime.module.ts`

- [ ] **Step 1: Replace the full file**

Replace `apps/agent/src/context/context-runtime.module.ts` with:

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { ContextRegistryService } from './context-registry.service';
import { ClipboardProvider } from './providers/clipboard.provider';
import { ActiveWindowProvider } from './providers/active-window.provider';
import { ActiveTerminalCwdProvider } from './providers/active-terminal-cwd.provider';
import { ProjectWorkspaceProvider } from './providers/project-workspace.provider';
import { GitContextProvider } from './providers/git-context.provider';
import { ConsentStoreService } from './consent-store.service';
import { ConsentRequestService } from './consent-request.service';
import { ContextAssemblerService } from './context-assembler.service';

@Module({
  providers: [
    ContextRegistryService,
    ClipboardProvider,
    ActiveWindowProvider,
    ActiveTerminalCwdProvider,
    ProjectWorkspaceProvider,
    GitContextProvider,
    ConsentStoreService,
    ConsentRequestService,
    ContextAssemblerService,
  ],
  exports: [
    ContextRegistryService,
    ConsentRequestService,
    ContextAssemblerService,
  ],
})
export class ContextRuntimeModule implements OnModuleInit {
  constructor(
    private readonly registry: ContextRegistryService,
    private readonly clipboardProvider: ClipboardProvider,
    private readonly activeWindowProvider: ActiveWindowProvider,
    private readonly activeTerminalCwdProvider: ActiveTerminalCwdProvider,
    private readonly projectWorkspaceProvider: ProjectWorkspaceProvider,
    private readonly gitContextProvider: GitContextProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.clipboardProvider);
    this.registry.register(this.activeWindowProvider);
    this.registry.register(this.activeTerminalCwdProvider);
    this.registry.register(this.projectWorkspaceProvider);
    this.registry.register(this.gitContextProvider);
  }
}
```

- [ ] **Step 2: Run full test suite**

```
npx jest --runInBand
```

Expected: all tests pass (same count as before)

- [ ] **Step 3: Commit**

```
git add apps/agent/src/context/context-runtime.module.ts
git commit -m "feat(context): register ConsentStoreService, ConsentRequestService, ContextAssemblerService"
```

---

### Task 5: Update CommandService to use ContextAssemblerService

Thread `client: WebSocket` through `execute()` and `executeAction()`. Replace the single-source `contextRegistry.read()` path in `AI_CLIPBOARD` with `assembler.assemble()`. Remove the now-unused `ContextRegistryService` injection.

**Files:**
- Modify: `apps/agent/src/command/command.service.ts`

- [ ] **Step 1: Replace the full file**

Replace `apps/agent/src/command/command.service.ts` with:

```typescript
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ButtonAction } from '@control-surface/shared';
import { WebSocket } from 'ws';
import { shell } from 'electron';
import { ClipboardService } from '../clipboard/clipboard.service';
import { AiRouterService, AiQuotaError } from '../ai/ai-router.service';
import { AppLaunchService } from '../app-launch/app-launch.service';
import { KeystrokeService } from '../keystroke/keystroke.service';
import { LicenseService } from '../license/license.service';
import { PackRegistryService } from '../packs/pack-registry.service';
import { IntegrationRouterService } from '../integrations/integration-router.service';
import { PluginCatalogService } from '../integrations/plugin-catalog.service';
import { ShellRunnerService } from './shell-runner.service';
import { RunHistoryService } from '../history/run-history.service';
import { ContextAssemblerService, ContextAssemblyError } from '../context/context-assembler.service';

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
  quotaExceeded?: boolean;
}

@Injectable()
export class CommandService {
  constructor(
    private readonly clipboard: ClipboardService,
    private readonly aiRouter: AiRouterService,
    private readonly appLaunch: AppLaunchService,
    private readonly keystroke: KeystrokeService,
    private readonly licenseService: LicenseService,
    private readonly packRegistry: PackRegistryService,
    private readonly integrationRouter: IntegrationRouterService,
    private readonly pluginCatalog: PluginCatalogService,
    private readonly shellRunner: ShellRunnerService,
    private readonly runHistory: RunHistoryService,
    private readonly assembler: ContextAssemblerService,
  ) {}

  async execute(action: ButtonAction, client: WebSocket): Promise<CommandResult> {
    const start = Date.now();
    const result = await this.executeAction(action, client);
    this.runHistory.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      success: result.success,
      output: result.output,
      error: result.error,
      durationMs: Date.now() - start,
    });
    return result;
  }

  private async executeAction(action: ButtonAction, client: WebSocket): Promise<CommandResult> {
    try {
      switch (action.kind) {
        case 'CLIPBOARD_WRITE':
          await this.clipboard.write(action.text);
          return { success: true };

        case 'AI_CLIPBOARD': {
          if (this.licenseService.creditsRemaining() <= 0) {
            return { success: false, quotaExceeded: true };
          }

          let prompt = action.prompt;
          let outputMode = action.outputMode;
          let context: string;

          if (action.toolId) {
            const tool = this.packRegistry.getById(action.toolId);
            if (tool && tool.kind === 'ai') {
              prompt = tool.prompt;
              outputMode = tool.outputMode;

              if (tool.contextRequirements?.length) {
                try {
                  context = await this.assembler.assemble(
                    tool.contextRequirements,
                    client,
                    tool.packId,
                    tool.id,
                  );
                } catch (err) {
                  if (err instanceof ContextAssemblyError) {
                    return { success: false, error: err.message };
                  }
                  throw err;
                }
              } else {
                context = await this.clipboard.read();
              }
            } else {
              context = await this.clipboard.read();
            }
          } else {
            context = await this.clipboard.read();
          }

          const result = await this.aiRouter.call(prompt, context);
          this.licenseService.decrementCredit();
          if (outputMode === 'viewer') {
            return { success: true, output: result };
          }
          await this.clipboard.write(result);
          return { success: true };
        }

        case 'APP_LAUNCH':
          await this.appLaunch.launch(action.appId);
          return { success: true };

        case 'URL_OPEN':
          await this.appLaunch.openUrl(action.url);
          return { success: true };

        case 'KEYSTROKE':
          await this.keystroke.execute(action.keys);
          return { success: true };

        case 'EXEC': {
          const err = await shell.openPath(action.exePath);
          if (err) return { success: false, error: `Failed to launch: ${err}` };
          return { success: true };
        }

        case 'WORKFLOW': {
          for (const step of action.steps) {
            if (step.delayBefore > 0) {
              await new Promise<void>(resolve => setTimeout(resolve, step.delayBefore));
            }
            const result = await this.execute(step.action, client);
            if (!result.success && action.stopOnError) {
              return { success: false, error: `Step "${step.label}" failed: ${result.error}` };
            }
          }
          return { success: true };
        }

        case 'INTEGRATION_ACTION': {
          const plugin = this.pluginCatalog.getPlugins().find((p) => p.id === action.pluginId);
          const tool = plugin?.tools.find((t) => t.id === action.toolId);
          return this.integrationRouter.dispatch(
            action.actionId,
            action.params,
            tool?.paramsSchema as Record<string, unknown> | undefined,
          );
        }

        case 'SHELL_RUN': {
          const shellResult = await this.shellRunner.run({ command: action.command });
          if (!shellResult.success) {
            return { success: false, error: shellResult.stderr };
          }
          if (action.outputMode === 'viewer') {
            return { success: true, output: shellResult.stdout };
          }
          if (action.outputMode === 'clipboard' || action.outputMode === 'autopaste') {
            await this.clipboard.write(shellResult.stdout);
          }
          return { success: true };
        }

        default: {
          const exhaustive: never = action;
          return { success: false, error: `Unknown action kind: ${(exhaustive as ButtonAction).kind}` };
        }
      }
    } catch (err: unknown) {
      if (err instanceof AiQuotaError) return { success: false, quotaExceeded: true };
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
```

- [ ] **Step 2: Update command service tests**

Find `apps/agent/tests/command.service.test.ts` (or `apps/agent/src/command/command.service.spec.ts`). Make these changes:

1. Replace `ContextRegistryService` mock provider with `ContextAssemblerService`:
```typescript
// Remove:
{ provide: ContextRegistryService, useValue: { read: jest.fn().mockResolvedValue({ content: '', byteSize: 0, provenance: '' }) } }
// Add:
{ provide: ContextAssemblerService, useValue: { assemble: jest.fn().mockResolvedValue('') } }
```

2. Add `client = {} as any` variable and pass it to every `commandService.execute(action)` call:
```typescript
const client = {} as any;
// ...
await commandService.execute(action, client);
```

- [ ] **Step 3: Run full test suite**

```
npx jest --runInBand
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```
git add apps/agent/src/command/command.service.ts
git commit -m "feat(command): thread client through execute, use ContextAssemblerService for AI context"
```

---

### Task 6: Pass client to commandService.execute in WsGateway

One-line change: thread `client` from the `BUTTON_TAP` handler into `commandService.execute`.

**Files:**
- Modify: `apps/agent/src/websocket/ws.gateway.ts`

- [ ] **Step 1: Update the BUTTON_TAP execute call**

Find this line in `ws.gateway.ts`:
```typescript
const result = await this.commandService.execute(data.action);
```

Replace with:
```typescript
const result = await this.commandService.execute(data.action, client);
```

- [ ] **Step 2: Run full test suite**

```
npx jest --runInBand
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```
git add apps/agent/src/websocket/ws.gateway.ts
git commit -m "feat(gateway): pass WebSocket client to commandService.execute"
```

---

### Task 7: Remove source from PackTool schema

`PackTool.source` is no longer used by any runtime code. Remove it from the shared schema type and from the pack registry mapping. `contextRequirements` is now the sole context driver.

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Modify: `apps/agent/src/packs/pack-registry.service.ts`

- [ ] **Step 1: Remove source from PackTool in schema.ts**

In `packages/shared/src/schema.ts`, find the `ai` variant of `PackTool` and remove the `source` line:

```typescript
// Remove this line:
source: 'clipboard' | 'active_window' | 'shell';
```

The `ai` variant after removal:
```typescript
  | {
      kind: 'ai';
      id: string;
      packId: string;
      label: string;
      prompt: string;
      outputMode: 'clipboard' | 'autopaste' | 'viewer';
      icon: string;
      color?: string;
      order: number;
      phase: number;
      builtinId?: string;
      contextRequirements?: ToolContextRequirement[];
    }
```

- [ ] **Step 2: Remove source from RawTool interface in pack-registry.service.ts**

In `apps/agent/src/packs/pack-registry.service.ts`, remove the `source` field from `RawTool`:

```typescript
// Remove this line from RawTool:
source: 'clipboard' | 'active_window' | 'shell';
```

- [ ] **Step 3: Remove source from tool mapping**

In the same file, in the `ai` tool mapping, remove `source: t.source,`:

```typescript
// Before:
return {
  ...shared,
  kind: 'ai',
  prompt: t.prompt,
  outputMode: t.output_mode as 'clipboard' | 'autopaste' | 'viewer',
  source: t.source,
  contextRequirements: t.context_requirements ?? undefined,
};

// After:
return {
  ...shared,
  kind: 'ai',
  prompt: t.prompt,
  outputMode: t.output_mode as 'clipboard' | 'autopaste' | 'viewer',
  contextRequirements: t.context_requirements ?? undefined,
};
```

- [ ] **Step 4: Run full test suite**

```
npx jest --runInBand
```

Expected: all tests pass. If any test constructs `{ kind: 'ai', source: '...' }` as a `PackTool`, TypeScript will error — remove the `source` property from those fixtures.

- [ ] **Step 5: Commit**

```
git add packages/shared/src/schema.ts apps/agent/src/packs/pack-registry.service.ts
git commit -m "feat(schema): remove PackTool.source — contextRequirements is now the sole context driver"
```
