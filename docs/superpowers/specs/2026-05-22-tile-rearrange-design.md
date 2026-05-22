# Tile Rearrange Mode — Design Spec

**Date:** 2026-05-22
**Status:** Approved

---

## Overview

Add a rearrange mode to the tile grid that lets users drag tiles to new positions, including across pages, with a single-gesture architecture. The mode is toggled from the settings sheet, changes are committed via a "Done" button, and unsaved changes are guarded by a discard prompt.

---

## Architecture

### New and changed pieces

| Piece | Change |
|---|---|
| `RearrangeGrid` (new) | Owns the single `Gesture.Pan()` scope, hit-tests touch→slot, renders the floating overlay tile, drives edge-flip logic |
| `TileGrid` | Receives `rearrangeMode` prop; when true, renders through `RearrangeGrid` instead of the normal paged FlatList path |
| `DeckScreen` | Adds `rearrangeMode: boolean` + `pendingTileOrder: TileConfig[]` state; renders the Done bar and discard prompt; passes `onReorderDone` callback |
| `SettingsSheet` | Adds a "Rearrange Tiles" row that closes the sheet and calls `onEnterRearrange()` |
| `packages/shared/src/schema.ts` | New `ReorderTilesMessage { type: 'REORDER_TILES'; tileIds: string[] }` added to `MobileMessage` union |
| `apps/mobile/src/types/schema.ts` | Mirror of the shared schema change |
| `AppRegistryService` (agent) | New `reorderTiles(tileIds: string[])` — reorders the in-memory config array by the given ID sequence and persists |
| `WsGateway` (agent) | Handles `REORDER_TILES`: calls `appRegistry.reorderTiles()`, sends updated `DECK_CONFIG` back to client |
| `WebSocketService` (mobile) | New `reorderTiles(tileIds: string[])` method |

### State flow in DeckScreen

1. User taps "Rearrange Tiles" in SettingsSheet → sheet closes, `rearrangeMode = true`, `pendingTileOrder = [...tiles]`
2. All drag operations mutate `pendingTileOrder` only — the live `tiles` array from the WebSocket is untouched
3. **Done** → `ws.reorderTiles(pendingTileOrder.map(t => t.id))` → agent persists → WS pushes back `DECK_CONFIG` → `rearrangeMode = false`
4. Exit attempt with dirty state → Alert prompt → "Discard" resets `pendingTileOrder` to `tiles` and exits; "Keep editing" returns to rearrange

---

## Gesture System

### Activation

`RearrangeGrid` wraps the paged `FlatList` in a `GestureDetector` with a single `Gesture.Pan()`. The gesture activates only after the finger has been still for **400 ms** (long-press threshold), which distinguishes a drag intent from a horizontal page-swipe. Once a drag is active, the FlatList's scroll is disabled via `scrollEnabled` driven by a Reanimated shared value so no JS–UI thread round-trip is needed.

### Slot position map

Slot positions are computed mathematically — no async `measure()` calls. Given `screenWidth`, `columns`, `tileWidth`, `tileHeight`, and `currentPage`:

```
slotX(i) = (i % columns) * tileWidth
slotY(i) = floor(i / columns) * tileHeight
absoluteSlotIndex = row * columns + col + currentPage * tilesPerPage
```

This runs synchronously on every gesture frame.

### Hit-testing on gesture start

When the 400 ms threshold fires:

```
col = floor(touchX / tileWidth)
row = floor(touchY / tileHeight)
slotIndex = row * columns + col + currentPage * tilesPerPage
```

The tile at that slot becomes the active drag tile.

### Floating overlay

The dragged tile is rendered in an absolutely-positioned `Animated.View` at the DeckScreen level, passed down via a React context. It mirrors the tile's visual exactly (same size, icon, label). `translateX` and `translateY` are `useSharedValue`s updated inside the `onUpdate` worklet — runs entirely on the UI thread, no JS-thread involvement during the drag.

### Insertion point

On every `onUpdate` frame the closest slot index to the finger centre is recalculated. `pendingTileOrder` is updated optimistically: tiles between the source index and the hovered index shift one position to fill the gap. Each non-dragged tile animates to its new slot with `withSpring`.

---

## Edge-Flip Page Turning

- **Left zone:** `absoluteX < screenWidth * 0.15`
- **Right zone:** `absoluteX > screenWidth * 0.85`

On every `onUpdate` frame the worklet checks the finger position. When the finger enters a zone a JS-thread `setTimeout` fires after **500 ms**. If the finger is still in the zone when it fires, the page advances and the timer resets (enabling continuous paging by holding the edge). The timer is cleared immediately when the finger leaves the zone.

On flip:
- The FlatList scrolls programmatically via its ref
- The slot position map recalculates for the new page
- The floating tile stays under the finger
- Non-dragged tiles on the new page shift immediately to show the insertion point

---

## Done Bar & Discard Prompt

### Done bar

While `rearrangeMode` is true a bar slides up from the bottom using `withTiming` on a `translateY` shared value. Layout:

- Left button: **Cancel** (grey text) — triggers the discard prompt if dirty, exits cleanly if not dirty
- Centre label: "Rearrange" (muted, non-interactive)
- Right button: **Done** (purple, commits)

The bar sits above the bottom safe-area inset. The tile grid's bottom padding increases to match so no tiles are obscured. On Android, the hardware back button behaves identically to Cancel.

### Dirty flag

A boolean `isDirty` tracks whether any drag has completed that changed the order. Computed as `pendingTileOrder.map(t => t.id).join(',') !== tiles.map(t => t.id).join(',')`.

### Discard prompt

If the user attempts to exit rearrange mode (gear icon is hidden while in rearrange mode — the only exit paths are Done or the prompt) while `isDirty`, an `Alert.alert` fires:

> **Title:** "Discard changes?"
> **Buttons:** "Keep editing" (cancel) · "Discard" (destructive)

"Discard" → `pendingTileOrder = [...tiles]`, `rearrangeMode = false`.

The settings gear icon is hidden during rearrange mode. The only exits are: Done (commit), Cancel button (triggers prompt if dirty), and Android hardware back (same as Cancel).

---

## Protocol

### New message (shared schema)

```typescript
export interface ReorderTilesMessage {
  type: 'REORDER_TILES';
  tileIds: string[];   // full ordered list of tile IDs
}
// Added to MobileMessage union
```

### Agent handler

`AppRegistryService.reorderTiles(tileIds: string[])`:
- Builds a lookup map `{ [id]: tile }`
- Produces a new array: IDs in `tileIds` order, with any IDs missing from the current config silently dropped, and any tiles not in `tileIds` appended at the end (safety net)
- Replaces `this.config.tiles` with the new array and calls `this.persist()`

`WsGateway` on `REORDER_TILES`:
- Calls `this.appRegistry.reorderTiles(data.tileIds)`
- Calls `this.sendDeckConfig(client)` to push the canonical order back

---

## Tile Wobble Animation

While `rearrangeMode` is true, each non-dragged tile renders with a subtle looping rotation `withRepeat(withSequence(withTiming(1.5deg), withTiming(-1.5deg)), -1, true)` — the standard iOS "jiggle". The dragged tile scales up to `1.08` while held (scale shared value, `withSpring`).

---

## Out of Scope

- Pinned tiles (`pinned: true`) participate in reordering like any other tile — no lock behaviour
- No undo/redo beyond the Discard prompt
- No multi-select drag
- No drag-to-delete
