# Git Pack — Command Tool Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the pack system so that packs can contain `kind: 'command'` tools that create `SHELL_RUN` tiles on the deck, alongside the existing `kind: 'ai'` tools.

**Architecture:** `PackTool` becomes a TypeScript discriminated union (`kind: 'ai' | 'command'`). The agent's `PackRegistryService` maps the two new Supabase columns (`kind`, `command`). `AiToolsTab` branches on `tool.kind` to build the correct tile action, and tracks both `AI_CLIPBOARD` and `SHELL_RUN` tiles by `toolId`. A new optional `toolId` field is added to `SHELL_RUN` in `ButtonAction` to enable this tracking.

**Tech Stack:** TypeScript (shared schema + mobile types), NestJS/Jest (agent), React Native (mobile)

---

## File Structure

| File | Change |
|---|---|
| `packages/shared/src/schema.ts` | `PackTool` interface → discriminated union; add `toolId?` to `SHELL_RUN` |
| `apps/mobile/src/types/schema.ts` | Identical mirrors of both changes above; add `SHELL_RUN` to `ButtonAction` union |
| `apps/agent/src/packs/pack-registry.service.ts` | `RawTool` gets `kind` + `command`; mapping logic branches on `kind` |
| `apps/agent/src/packs/pack-registry.service.spec.ts` | New — unit tests for ai and command tool mapping |
| `apps/mobile/src/screens/AiToolsTab.tsx` | `handleToggle` branches on `tool.kind`; selection tracking covers both action kinds; kind badge in tool row UI |

---

### Task 1: Extend PackTool to a discriminated union and add toolId to SHELL_RUN

**Files:**
- Modify: `packages/shared/src/schema.ts` (lines 29–41 for PackTool; locate SHELL_RUN in ButtonAction)
- Modify: `apps/mobile/src/types/schema.ts` (lines 29–41 for PackTool; lines 8–16 for ButtonAction)

TypeScript is the test here — a clean `tsc --noEmit` is the pass condition.

- [ ] **Step 1: Replace PackTool in `packages/shared/src/schema.ts`**

Find and replace the `PackTool` interface (currently lines 29–41) with:

```typescript
// Pack catalog types (Agent → Mobile via PACK_REGISTRY)
export type PackTool =
  | {
      kind: 'ai';
      id: string;
      packId: string;
      label: string;
      prompt: string;
      outputMode: 'clipboard' | 'autopaste' | 'viewer';
      source: 'clipboard' | 'active_window' | 'shell';
      icon: string;
      color?: string;
      order: number;
      phase: number;
      builtinId?: string;
    }
  | {
      kind: 'command';
      id: string;
      packId: string;
      label: string;
      command: string;
      outputMode: 'viewer' | 'silent';
      icon: string;
      color?: string;
      order: number;
      phase: number;
      builtinId?: string;
    };
```

- [ ] **Step 2: Add `toolId?` to the SHELL_RUN variant in `packages/shared/src/schema.ts`**

Find the existing line:
```typescript
| { kind: 'SHELL_RUN'; command: string; outputMode: 'clipboard' | 'autopaste' | 'viewer' | 'silent' }
```
Replace with:
```typescript
| { kind: 'SHELL_RUN'; command: string; outputMode: 'clipboard' | 'autopaste' | 'viewer' | 'silent'; toolId?: string }
```

- [ ] **Step 3: Type-check the shared package**

```bash
cd packages/shared && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Mirror both changes in `apps/mobile/src/types/schema.ts`**

Replace the `PackTool` interface (lines 29–41) with the identical discriminated union from Step 1.

Then add `SHELL_RUN` to the mobile `ButtonAction` union (currently line 8–16). The mobile union currently lacks `SHELL_RUN` entirely — add it as a new variant and add `toolId?` at the same time:

```typescript
export type ButtonAction =
  | { kind: 'AI_CLIPBOARD'; prompt: string; outputMode: 'clipboard' | 'autopaste' | 'viewer'; toolId?: string }
  | { kind: 'KEYSTROKE'; keys: string[] }
  | { kind: 'APP_LAUNCH'; appId: string }
  | { kind: 'URL_OPEN'; url: string }
  | { kind: 'CLIPBOARD_WRITE'; text: string }
  | { kind: 'EXEC'; exePath: string }
  | { kind: 'SHELL_RUN'; command: string; outputMode: 'clipboard' | 'autopaste' | 'viewer' | 'silent'; toolId?: string }
  | { kind: 'WORKFLOW'; steps: WorkflowStep[]; stopOnError: boolean }
  | { kind: 'INTEGRATION_ACTION'; pluginId: string; toolId: string; actionId: string; params: Record<string, unknown> };
```

- [ ] **Step 5: Type-check the mobile package**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors (the union change is additive — existing code is unaffected).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schema.ts apps/mobile/src/types/schema.ts
git commit -m "feat(schema): PackTool discriminated union + SHELL_RUN toolId"
```

---

### Task 2: Agent — map command tool fields from Supabase

**Files:**
- Modify: `apps/agent/src/packs/pack-registry.service.ts`
- Create: `apps/agent/src/packs/pack-registry.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/agent/src/packs/pack-registry.service.spec.ts`:

```typescript
const mockSelect = jest.fn();
const mockLte = jest.fn();
const mockFrom = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));
jest.mock('ws', () => ({}));

import { PackRegistryService } from './pack-registry.service';

const AI_RAW_TOOL = {
  id: 'tool-1', pack_id: 'pack-1', kind: 'ai', label: 'Write Commit Message',
  prompt: 'Write a commit message for the following diff:', output_mode: 'clipboard',
  source: 'active_window', icon: 'git', color: null, order: 1, phase: 1,
  builtin_id: null, command: null,
};

const COMMAND_RAW_TOOL = {
  id: 'tool-2', pack_id: 'pack-1', kind: 'command', label: 'Git Status',
  prompt: '', output_mode: 'viewer', source: 'clipboard',
  icon: 'terminal', color: null, order: 15, phase: 1,
  builtin_id: null, command: 'git status',
};

const PACK_ROW = {
  id: 'pack-1', slug: 'git', name: 'Git', description: null,
  icon: '🔀', color: '#F05033', order: 1, pack_tools: [],
};

describe('PackRegistryService', () => {
  let service: PackRegistryService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ lte: mockLte });
    service = new PackRegistryService();
  });

  it('maps an ai tool to PackTool with kind=ai', async () => {
    mockLte.mockResolvedValue({
      data: [{ ...PACK_ROW, pack_tools: [AI_RAW_TOOL] }],
      error: null,
    });
    await service.load();
    const [pack] = service.getPacks();
    const [tool] = pack.tools;
    expect(tool.kind).toBe('ai');
    if (tool.kind === 'ai') {
      expect(tool.prompt).toBe('Write a commit message for the following diff:');
      expect(tool.source).toBe('active_window');
      expect(tool.outputMode).toBe('clipboard');
    }
  });

  it('maps a command tool to PackTool with kind=command', async () => {
    mockLte.mockResolvedValue({
      data: [{ ...PACK_ROW, pack_tools: [COMMAND_RAW_TOOL] }],
      error: null,
    });
    await service.load();
    const [pack] = service.getPacks();
    const [tool] = pack.tools;
    expect(tool.kind).toBe('command');
    if (tool.kind === 'command') {
      expect(tool.command).toBe('git status');
      expect(tool.outputMode).toBe('viewer');
    }
  });

  it('returns empty packs before load', () => {
    expect(service.getPacks()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd apps/agent && npx jest src/packs/pack-registry.service.spec.ts --no-coverage
```
Expected: FAIL — `kind` and `command` are not yet mapped, so `tool.kind` is undefined.

- [ ] **Step 3: Update `RawTool` interface in `pack-registry.service.ts`**

Find the `RawTool` interface (currently lines 8–20) and add the two new fields:

```typescript
interface RawTool {
  id: string;
  pack_id: string;
  kind: string;         // 'ai' (default) | 'command'
  label: string;
  prompt: string;
  output_mode: 'clipboard' | 'autopaste' | 'viewer';
  source: 'clipboard' | 'active_window' | 'shell';
  icon: string;
  color: string | null;
  order: number;
  phase: number;
  builtin_id: string | null;
  command: string | null;   // populated only when kind='command'
}
```

- [ ] **Step 4: Update the tool mapping logic in `pack-registry.service.ts`**

Inside `.map((raw) => { ... })`, find the `tools` mapping. Replace the current flat `.map((t) => ({ ... }))` block:

```typescript
const tools: PackTool[] = (raw.pack_tools ?? [])
  .filter((t) => t.phase <= AGENT_CAPABILITY)
  .sort((a, b) => a.order - b.order)
  .map((t): PackTool => {
    const shared = {
      id: t.id,
      packId: t.pack_id,
      label: t.label,
      icon: t.icon,
      color: t.color ?? undefined,
      order: t.order,
      phase: t.phase,
      builtinId: t.builtin_id ?? undefined,
    };
    if (t.kind === 'command') {
      return {
        ...shared,
        kind: 'command',
        command: t.command ?? '',
        outputMode: t.output_mode === 'silent' ? 'silent' : 'viewer',
      };
    }
    return {
      ...shared,
      kind: 'ai',
      prompt: t.prompt,
      outputMode: t.output_mode,
      source: t.source,
    };
  });
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
cd apps/agent && npx jest src/packs/pack-registry.service.spec.ts --no-coverage
```
Expected: PASS — 3 tests passing.

- [ ] **Step 6: Type-check the agent**

```bash
cd apps/agent && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/packs/pack-registry.service.ts apps/agent/src/packs/pack-registry.service.spec.ts
git commit -m "feat(agent): pack-registry maps command tool kind and command fields"
```

---

### Task 3: Mobile — AiToolsTab handles command tools

**Files:**
- Modify: `apps/mobile/src/screens/AiToolsTab.tsx`

- [ ] **Step 1: Rename and expand the selection-tracking memo**

In `AiToolsTab.tsx`, find the `selectedTilesByToolId` useMemo (currently lines 24–32). Replace it with:

```typescript
const selectedByToolId = useMemo<Map<string, string>>(() => {
  const map = new Map<string, string>();
  for (const tile of currentTiles) {
    if (tile.action.kind === 'AI_CLIPBOARD' && tile.action.toolId) {
      map.set(tile.action.toolId, tile.id);
    }
    if (tile.action.kind === 'SHELL_RUN' && tile.action.toolId) {
      map.set(tile.action.toolId, tile.id);
    }
  }
  return map;
}, [currentTiles]);
```

- [ ] **Step 2: Update handleToggle to branch on tool.kind**

Replace the current `handleToggle` function:

```typescript
const handleToggle = (tool: PackTool) => {
  const existingId = selectedByToolId.get(tool.id);
  if (existingId) {
    onRemove(existingId);
    return;
  }
  if (tool.kind === 'command') {
    onAdd({
      kind: 'custom',
      label: tool.label,
      iconId: tool.icon ?? 'terminal',
      color: tool.color,
      action: {
        kind: 'SHELL_RUN',
        command: tool.command,
        outputMode: tool.outputMode,
        toolId: tool.id,
      },
    });
  } else {
    onAdd({
      kind: 'ai',
      label: tool.label,
      iconId: tool.icon ?? 'ai',
      color: tool.color,
      action: {
        kind: 'AI_CLIPBOARD',
        toolId: tool.id,
        prompt: '',
        outputMode: tool.outputMode,
      },
    });
  }
};
```

- [ ] **Step 3: Update the isSelected reference in renderItem**

In the `renderItem` function, change `selectedTilesByToolId.has(tool.id)` to `selectedByToolId.has(tool.id)`.

- [ ] **Step 4: Add kind badge and update tool meta in the tool row**

Replace the current `<View style={styles.toolInfo}>` block inside `renderItem`:

```tsx
<View style={styles.toolInfo}>
  <Text style={styles.toolLabel}>{tool.label}</Text>
  <View style={styles.toolMeta}>
    <Text style={[
      styles.kindBadge,
      tool.kind === 'command' ? styles.kindBadgeCommand : styles.kindBadgeAi,
    ]}>
      {tool.kind === 'command' ? 'Command' : 'AI'}
    </Text>
    <Text style={styles.toolMode}>{tool.outputMode}</Text>
  </View>
</View>
```

- [ ] **Step 5: Add new styles**

At the bottom of the `StyleSheet.create({...})` block, add:

```typescript
toolMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
kindBadge: {
  fontSize: 10,
  fontWeight: '800',
  paddingHorizontal: 6,
  paddingVertical: 2,
  borderRadius: 4,
  overflow: 'hidden',
},
kindBadgeAi: { backgroundColor: '#2A1A4A', color: '#B9B5FF' },
kindBadgeCommand: { backgroundColor: '#1A2A1A', color: '#7BFFA8' },
```

- [ ] **Step 6: Type-check the mobile package**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/AiToolsTab.tsx
git commit -m "feat(mobile): AiToolsTab supports command pack tools with SHELL_RUN tiles"
```

---

## What's Next

This plan delivers the infrastructure. **Plan 2 — Git Pack Data** is the follow-up: it inserts the Git pack row and 20 tool rows into Supabase (14 AI tools with prompts, 6 command tools with `git` commands), which requires no code changes but does require Supabase admin access to author the SQL.
