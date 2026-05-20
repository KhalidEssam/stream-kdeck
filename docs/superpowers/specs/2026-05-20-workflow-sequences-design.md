# Workflow Sequences — Design Spec
**Date:** 2026-05-20
**Status:** Approved

## Overview

Add a new "Workflow" tile type that runs a user-defined sequence of actions with optional per-step delays and a stop-on-error toggle. Workflows are created via a new tab in `AddTileScreen` and by converting existing tiles via long-press. Workflow tiles display a visual badge on the deck. AI steps are intentionally excluded.

---

## Sub-system Scope

This is sub-project 1 of 3 in the workflows roadmap:
1. **Multi-step sequences** ← this spec
2. Built-in workflow templates (future)
3. Conditional / branching logic (future)

---

## New Dependencies

| Package | Purpose |
|---|---|
| `react-native-draggable-flatlist` | Drag-to-reorder step list in builder |
| `react-native-gesture-handler` | Peer dep of draggable-flatlist |
| `react-native-reanimated` | Peer dep of draggable-flatlist |

All three are Expo-compatible and support Expo bare workflow (SDK 54).

---

## Schema Changes

**Both files must be updated identically:**
- `packages/shared/src/schema.ts` (used by agent)
- `apps/mobile/src/types/schema.ts` (used by mobile)

### New types

```ts
// Steps can use any action except AI_CLIPBOARD and WORKFLOW (no nesting, no credit charges)
export type WorkflowStepAction = Exclude<ButtonAction, { kind: 'AI_CLIPBOARD' | 'WORKFLOW' }>;

export interface WorkflowStep {
  id: string;           // crypto.randomUUID() on creation, used as React key + drag item key
  action: WorkflowStepAction;
  delayBefore: number;  // milliseconds (0 = no delay, max 10000)
  label: string;        // human-readable summary shown in builder, e.g. "Launch VS Code"
}
```

### `ButtonAction` union — add one member

```ts
| { kind: 'WORKFLOW'; steps: WorkflowStep[]; stopOnError: boolean }
```

### `TileConfig.kind` — add `'workflow'`

```ts
kind: 'app' | 'url' | 'ai' | 'shortcut' | 'custom' | 'workflow';
```

---

## Agent Changes

**File:** `apps/agent/src/command/command.service.ts`

Add a new `case 'WORKFLOW'` to the `execute()` switch. Steps call `execute()` recursively — safe because `WorkflowStepAction` excludes `WORKFLOW` and `AI_CLIPBOARD`:

```ts
case 'WORKFLOW': {
  for (const step of action.steps) {
    if (step.delayBefore > 0) {
      await new Promise(resolve => setTimeout(resolve, step.delayBefore));
    }
    const result = await this.execute(step.action);
    if (!result.success && action.stopOnError) {
      return { success: false, error: `Step "${step.label}" failed: ${result.error}` };
    }
  }
  return { success: true };
}
```

- One `ACTION_RESULT` message is sent back to mobile per workflow tap (not per step).
- If `stopOnError` is false, always returns `{ success: true }` regardless of step failures.
- No new WebSocket message types needed — workflows travel through the existing `BUTTON_TAP` → `ACTION_RESULT` pipeline.

---

## Mobile: `WorkflowBuilderScreen`

**File:** `apps/mobile/src/screens/WorkflowBuilderScreen.tsx` (new)

### Props

```ts
interface Props {
  initialSteps?: WorkflowStep[];   // populated when converting an existing tile
  initialLabel?: string;
  onSave: (tile: Omit<TileConfig, 'id'>) => void;
  onDismiss: () => void;
  ws: WebSocketService;            // passed to StepPickerSheet for app search
}
```

### Layout (top → bottom)

1. **Header row** — text input for workflow name + "Cancel" / "Save" buttons
2. **Stop-on-error toggle row** — `Switch` + label "Stop if a step fails"
3. **Draggable step list** — `DraggableFlatList` from `react-native-draggable-flatlist`
4. **"+ Add Step" button** — fixed at bottom, opens `StepPickerSheet`

### Step row

Each row in the list shows:
- **Drag handle** (≡ icon, left side) — activates `onLongPress` to begin drag
- **Step label** — e.g. "Launch VS Code"
- **Delay badge** (tappable) — shows "0s" / "1.5s" etc; tapping opens a small `Modal` with a slider (0–10s, 0.5s increments)
- **Delete button** (✕, right side)

### `StepPickerSheet`

A `Modal` (animationType="slide", presentationStyle="pageSheet") that reuses the existing action-picker UI pattern from `AddTileScreen`. Shows four tabs:

| Tab | Underlying action kind |
|---|---|
| Apps | `APP_LAUNCH` / `EXEC` |
| URLs | `URL_OPEN` |
| Keys | `KEYSTROKE` |
| Clipboard | `CLIPBOARD_WRITE` |

On confirm, returns a new `WorkflowStep` with `id = crypto.randomUUID()`, `delayBefore = 0`, and a `label` generated as:

| Action kind | Label rule |
|---|---|
| `APP_LAUNCH` / `EXEC` | App name from search result or filename |
| `URL_OPEN` | Domain extracted from URL (e.g. `github.com`) |
| `KEYSTROKE` | Keys joined with `+` (e.g. `Ctrl+Shift+T`) |
| `CLIPBOARD_WRITE` | First 24 chars of text + `…` if longer |

### Save

On "Save" tap, calls `onSave` with:
```ts
{
  kind: 'workflow',
  label: workflowName,
  iconId: 'workflow',
  action: { kind: 'WORKFLOW', steps, stopOnError },
}
```

---

## Mobile: `AddTileScreen` — Workflow Tab

**File:** `apps/mobile/src/screens/AddTileScreen.tsx`

Add a **"Workflow"** tab to the existing tab bar (alongside AI Tools, Apps, Shortcuts).

The tab body renders:
- A brief description: "Run multiple actions in sequence"
- A single **"+ New Workflow"** button

Tapping opens `WorkflowBuilderScreen` as a nested `Modal`. On `onSave`, calls the existing `onAdd` prop and closes both modals.

---

## Mobile: `DeckScreen` — Convert to Workflow

**File:** `apps/mobile/src/screens/DeckScreen.tsx`

In the existing long-press "Tile Options" dialog, add a **"Convert to Workflow"** button:
- Visible only when `actionTile` is non-null, not a builtin tile, and `actionTile.kind !== 'workflow'`
- Tapping opens `WorkflowBuilderScreen` with:
  - `initialSteps` = single step built from `actionTile.action` + auto-label
  - `initialLabel` = `actionTile.label`
- On `onSave`: calls `handleRemoveTile(actionTile.id)` then `handleAddTile(newTile)`, closes the dialog

Add `showWorkflowBuilder` state and a `Modal` to host `WorkflowBuilderScreen` within `DeckScreen`.

---

## Mobile: `AppTile` — Workflow Badge

**File:** `apps/mobile/src/components/AppTile.tsx`

When `tile.kind === 'workflow'`, render a badge overlay in the bottom-right corner of the tile:

```tsx
{tile.kind === 'workflow' && (
  <View style={styles.workflowBadge}>
    <Text style={styles.workflowBadgeText}>⛓</Text>
  </View>
)}
```

Badge style: 18×18, `borderRadius: 5`, dark background `#1A1A2E`, positioned `absolute, bottom: 4, right: 4`.

---

## Files Changed

| File | Change |
|---|---|
| `packages/shared/src/schema.ts` | Add `WorkflowStep`, `WorkflowStepAction`, `WORKFLOW` action, `'workflow'` kind |
| `apps/mobile/src/types/schema.ts` | Same as above (kept in sync) |
| `apps/agent/src/command/command.service.ts` | Add `WORKFLOW` case |
| `apps/mobile/src/screens/WorkflowBuilderScreen.tsx` | **New** |
| `apps/mobile/src/screens/AddTileScreen.tsx` | Add Workflow tab |
| `apps/mobile/src/screens/DeckScreen.tsx` | Add Convert to Workflow option + modal |
| `apps/mobile/src/components/AppTile.tsx` | Add workflow badge |
| `apps/mobile/package.json` | Add 3 new dependencies |

---

## Edge Cases

| Case | Handling |
|---|---|
| Empty workflow (0 steps) | "Save" button disabled until at least 1 step exists |
| Empty workflow name | Defaults to "My Workflow" if user leaves field blank |
| Step action path no longer valid (e.g. app uninstalled) | Agent returns step failure; `stopOnError` determines whether to continue |
| Workflow tile long-pressed | "Convert to Workflow" not shown (already a workflow) |
| Builtin tile long-pressed | "Convert to Workflow" not shown (builtins are read-only) |
| `delayBefore` on first step | Supported — delays before the first action fire after tap |
| Max delay | 10 000 ms (10s) enforced on the slider |
