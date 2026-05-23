# Context Assembler Design

**Date:** 2026-05-23  
**Status:** Approved

## Problem

AI pack tools declare which context providers they need via `contextRequirements`, but `CommandService` ignores this field entirely. It reads a single `PackTool.source` field (limited to `clipboard | active_window | shell`) and passes the raw string to the AI. A "what does this repo do?" tool using `source: 'active_window'` receives only `"code.exe"` — the OS process name — instead of README content, package manifests, and git history.

## Goal

Replace the single-source `PackTool.source` field with a multi-provider context assembler driven by `contextRequirements`. Each AI tool declares what context it needs; the assembler reads all declared providers in parallel, gates each on user consent, and delivers a structured labeled-section prompt block to the AI model.

## Architecture

```
WsGateway.handleMessage(client, BUTTON_TAP)
  → CommandService.execute(action, client)
    → ContextAssemblerService.assemble(requirements, client, packId, toolId)
        → ConsentRequestService.request(client, ...)   [if not already granted]
        → ConsentStoreService.isGranted / grant
        → ContextRegistryService.read(providerId, ...)
      → assembled markdown string  OR  throws ContextAssemblyError
    → AiRouterService.call(prompt, assembledText)
```

### Circular dependency resolution

`ContextAssemblerService` needs to fire consent prompts to mobile. Previously `requestConsent` lived in `WsGateway`, but injecting `WsGateway` into the assembler creates a cycle:

```
WsGateway → CommandService → ContextAssemblerService → WsGateway  ✗
```

Fix: extract consent request management into `ConsentRequestService`. `WsGateway` delegates `CONTEXT_PERMISSION_RESPONSE` handling to it; `ContextAssemblerService` calls it directly.

```
WsGateway → CommandService → ContextAssemblerService → ConsentRequestService  ✓
WsGateway → ConsentRequestService  ✓
```

## New Services

### `ConsentRequestService`

`apps/agent/src/context/consent-request.service.ts`

Manages in-flight consent requests (previously the `pendingConsentRequests` Map inside `WsGateway`).

```typescript
@Injectable()
export class ConsentRequestService {
  // Manages Map<requestId, resolver>

  // Called by WsGateway when CONTEXT_PERMISSION_RESPONSE arrives
  handleResponse(requestId: string, granted: boolean, scope?: ConsentScope): void

  // Called by ContextAssemblerService before each provider read
  async request(
    client: WebSocket,
    params: {
      packId: string;
      providerId: string;
      providerLabel: string;
      reason: string;
    },
  ): Promise<{ granted: boolean; scope?: ConsentScope }>
  // 60-second timeout → resolves { granted: false } on expiry
}
```

### `ContextAssemblerService`

`apps/agent/src/context/context-assembler.service.ts`

```typescript
@Injectable()
export class ContextAssemblerService {
  async assemble(
    requirements: ToolContextRequirement[],
    client: WebSocket,
    packId: string,
    toolId: string,
  ): Promise<string>
  // throws ContextAssemblyError on hard failure
}
```

**Per-requirement flow (sequential):**

1. **Consent check** — `consentStore.isGranted(packId, providerId)`
   - If not granted → `consentRequestService.request(client, { packId, providerId, providerLabel, reason })`
   - If granted → `consentStore.grant(packId, providerId, scope)` then continue
   - If denied:
     - `required: true` → throw `ContextAssemblyError("${providerLabel} access denied by user")`
     - `required: false` → skip this provider

2. **Read** — `contextRegistry.read(providerId, { toolId, packId })`
   - If provider unavailable (probe failed):
     - `required: true` → throw `ContextAssemblyError("${providerLabel} required but unavailable: ${reason}")`
     - `required: false` → skip

3. **Truncate** — if `requirement.maxBytes` is set and content exceeds it, trim to `maxBytes` characters (append `"\n[truncated]"`)

4. **Append section** to output

**Output format:**

```
### Project Files
README: KDeck is a mobile stream deck for Windows...
package.json: @control-surface/agent v0.2.0

### Git
branch: master — 3 uncommitted files
recent commits:
  feat(history): run history service
  fix: animated reordering tiles
```

**Provider label map:**

| ContextProviderId  | Section header     |
|--------------------|--------------------|
| `clipboard`        | `Clipboard`        |
| `active_window`    | `Active Window`    |
| `active_terminal`  | `Terminal`         |
| `project_files`    | `Project Files`    |
| `git`              | `Git`              |
| `media`            | `Media`            |
| `obs`              | `OBS`              |

**`ContextAssemblyError`** is a named error class caught in `CommandService.executeAction()` and returned as `{ success: false, error: message }`.

## Schema Changes

### `packages/shared/src/schema.ts`

Remove `source: 'clipboard' | 'active_window' | 'shell'` from the `ai` variant of `PackTool`. `contextRequirements` is the sole context driver going forward.

Before:
```typescript
{ kind: 'ai'; source: 'clipboard' | 'active_window' | 'shell'; contextRequirements?: ToolContextRequirement[]; ... }
```

After:
```typescript
{ kind: 'ai'; contextRequirements?: ToolContextRequirement[]; ... }
```

### `apps/agent/src/packs/pack-registry.service.ts`

Remove the `source` field mapping from `RawTool → PackTool`. The `source` column on the Supabase `pack_tools` table is no longer read.

## Modified Services

### `CommandService`

`execute(action: ButtonAction, client: WebSocket): Promise<CommandResult>`

In the `AI_CLIPBOARD` case:
- If `tool.contextRequirements` is non-empty → call `assembler.assemble(requirements, client, tool.packId, tool.id)` → use result as AI context
- If `tool.contextRequirements` is empty or undefined → fall back to `clipboard.read()` (plain clipboard, no consent gate, backward compatible with tools that declare no requirements)
- Catch `ContextAssemblyError` → return `{ success: false, error: err.message }`

### `WsGateway`

- Inject `ConsentRequestService`
- Remove `pendingConsentRequests` Map and `requestConsent()` method (moved to `ConsentRequestService`)
- `CONTEXT_PERMISSION_RESPONSE` handler delegates to `consentRequestService.handleResponse(...)`
- `BUTTON_TAP` handler: `commandService.execute(data.action, client)` (adds `client` arg)

### `ContextRuntimeModule`

Register new services in providers:
- `ContextAssemblerService`
- `ConsentRequestService`
- `ConsentStoreService` (was built in Task 9 but never registered — fix here)

## File Map

| Action   | File                                                              |
|----------|-------------------------------------------------------------------|
| Create   | `apps/agent/src/context/context-assembler.service.ts`            |
| Create   | `apps/agent/src/context/context-assembler.service.spec.ts`       |
| Create   | `apps/agent/src/context/consent-request.service.ts`              |
| Create   | `apps/agent/src/context/consent-request.service.spec.ts`         |
| Modify   | `apps/agent/src/websocket/ws.gateway.ts`                         |
| Modify   | `apps/agent/src/command/command.service.ts`                      |
| Modify   | `packages/shared/src/schema.ts`                                  |
| Modify   | `apps/agent/src/packs/pack-registry.service.ts`                  |
| Modify   | `apps/agent/src/context/context-runtime.module.ts`               |

## Testing Strategy

**`ConsentRequestService` tests:**
- `request()` resolves `{ granted: true, scope: 'once' }` when `handleResponse` is called with matching requestId
- `request()` resolves `{ granted: false }` after 60-second timeout (use fake timers)
- `handleResponse` for unknown requestId is a no-op

**`ContextAssemblerService` tests:**
- Returns assembled sections when all providers available and consent pre-granted
- Skips optional provider when unavailable
- Throws `ContextAssemblyError` when required provider unavailable
- Throws `ContextAssemblyError` when consent denied for required provider
- Skips optional provider when consent denied
- Truncates content to `maxBytes` when specified
- Empty `requirements` array returns empty string

**`CommandService` tests:**
- Uses assembler when `contextRequirements` non-empty
- Falls back to clipboard when `contextRequirements` absent
- Returns `{ success: false, error }` when assembler throws `ContextAssemblyError`

## Out of Scope

- Supabase `pack_tools` data migration (updating existing rows to populate `contextRequirements` and remove `source`) — this is a data task, not a code task
- `media` and `obs` context providers (referenced in `ContextProviderId` but not yet implemented)
- Parallel provider reads (sequential is simpler and sufficient for now; parallelism is an optimization)
