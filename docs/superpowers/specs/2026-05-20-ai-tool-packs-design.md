# AI Tool Packs — Design Spec

**Date:** 2026-05-20  
**Status:** Approved  

---

## Overview

Replace the current flat list of 6 hardcoded AI tools with a remote-defined, pack-based library. Users discover and select individual tools from themed packs. Tool definitions live in Supabase and are fetched at agent startup — no app release required to add or update tools.

---

## Goals

- Organize AI tools into audience-specific packs (Engineer, Writer, Gamer, Student, Designer, Social Media, Productivity)
- Let users pick any individual tool from any pack — no all-or-nothing pack selection
- Migrate 6 existing tools into the appropriate packs (no tool is lost)
- Support a phase-2 of context-aware tools (active window, shell) without a schema migration
- Enable hot-updating tool prompts from Supabase without shipping a new agent release

---

## Non-Goals

- Phase-2 context-aware tools are defined in Supabase now but not executed until a follow-up agent update
- No AI-based pack inference or automatic tool suggestions
- No social/sharing features for tool packs

---

## Pack Catalog

7 packs, 47 tools total. Phase-1 tools use `source: clipboard` (45 tools). Phase-2 tools are seeded in Supabase but hidden until the agent announces capability (2 tools).

### ⚙️ Engineer Pack

| Tool | Output Mode | Phase |
|------|-------------|-------|
| Explain Error ★ | viewer | 1 |
| Write Tests ★ | viewer | 1 |
| Review Code | viewer | 1 |
| Write Docstring | autopaste | 1 |
| Convert to TypeScript | viewer | 1 |
| Explain Regex | autopaste | 1 |
| Generate Commit Msg | clipboard | 2 |

### ✍️ Writer Pack

| Tool | Output Mode | Phase |
|------|-------------|-------|
| Fix Grammar ★ | autopaste | 1 |
| Make Shorter ★ | autopaste | 1 |
| Continue Story | viewer | 1 |
| Rewrite Tone | viewer | 1 |
| Brainstorm Plot | viewer | 1 |
| Add Dialogue | viewer | 1 |
| Punch It Up | autopaste | 1 |

### 🎮 Gamer Pack

| Tool | Output Mode | Phase |
|------|-------------|-------|
| Explain Mechanic | viewer | 1 |
| Build Optimizer | viewer | 1 |
| Lore Summary | viewer | 1 |
| Callout Phrases | clipboard | 1 |
| Counter Strategy | viewer | 1 |
| Quest Helper | viewer | 1 |
| Active Game Tip | viewer | 2 |

### 🎓 Student Pack

| Tool | Output Mode | Phase |
|------|-------------|-------|
| Translate ES ★ | clipboard | 1 |
| ELI5 | viewer | 1 |
| Summarize Notes | autopaste | 1 |
| Make Flashcards | viewer | 1 |
| Check My Answer | viewer | 1 |
| Write Citation | clipboard | 1 |
| Study Plan | viewer | 1 |

### 🎨 Designer Pack

| Tool | Output Mode | Phase |
|------|-------------|-------|
| Write Microcopy | viewer | 1 |
| Naming Ideas | viewer | 1 |
| Color Palette | viewer | 1 |
| Design Critique | viewer | 1 |
| Accessibility Check | viewer | 1 |
| Simplify UX Copy | autopaste | 1 |

### 📣 Social Media Pack

| Tool | Output Mode | Phase |
|------|-------------|-------|
| Write Tweet ★ | clipboard | 1 |
| Write Caption | clipboard | 1 |
| Generate Hashtags | clipboard | 1 |
| LinkedIn Rephrase | autopaste | 1 |
| A/B Headlines | viewer | 1 |
| Thread Expander | viewer | 1 |
| Hook Generator | clipboard | 1 |

### ✅ Productivity Pack

| Tool | Output Mode | Phase |
|------|-------------|-------|
| TL;DR | autopaste | 1 |
| Write Email | viewer | 1 |
| Action Items | viewer | 1 |
| Prioritize | viewer | 1 |
| Rewrite Clearly | autopaste | 1 |
| Reply Draft | viewer | 1 |

★ = migrated from existing 6 tools

---

## Data Model (Supabase)

### Catalog Tables (admin-managed, read-only for clients)

```sql
-- Pack definitions
create table packs (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,       -- e.g. 'engineer', 'writer'
  name        text not null,
  description text,
  icon        text not null,             -- emoji or icon key
  color       text,
  "order"     int not null default 0
);

-- Tool definitions
create table pack_tools (
  id          uuid primary key default gen_random_uuid(),
  pack_id     uuid references packs(id) on delete cascade,
  label       text not null,
  prompt      text not null,
  output_mode text not null check (output_mode in ('clipboard','autopaste','viewer')),
  source      text not null default 'clipboard'
                check (source in ('clipboard','active_window','shell')),
  icon        text,
  color       text,
  "order"     int not null default 0,
  phase       int not null default 1,    -- 1 = available now, 2 = requires agent update
  builtin_id  text                       -- maps legacy builtin-ai-* ids during migration
);
```

### User State Tables

```sql
-- Tracks onboarding completion
create table user_profiles (
  user_id    uuid primary key references auth.users(id),
  onboarded  bool not null default false,
  created_at timestamptz default now()
);

-- Individual tool selections (the user's deck source of truth for AI tools)
create table user_tool_selections (
  user_id    uuid references auth.users(id),
  tool_id    uuid references pack_tools(id),
  deck_order int not null default 0,
  added_at   timestamptz default now(),
  primary key (user_id, tool_id)
);
```

---

## System Architecture

### Agent: PackRegistryService

New NestJS service `PackRegistryService` owns the catalog in memory.

**Startup sequence:**
1. `WsGateway.connect()` triggers `PackRegistryService.load()`
2. Fetch all packs + tools from Supabase where `phase <= agentCapability` (currently `1`)
3. Cache result in `Map<toolId, PackTool>`
4. Emit `PACK_REGISTRY` message to connected mobile client

**On `BUTTON_TAP` with `AI_CLIPBOARD` action:**
1. `CommandService.execute(action)` — unchanged dispatcher
2. If `action.toolId` is present: resolve `prompt` and `output_mode` from `PackRegistryService` cache. If absent (legacy tile): use inline `action.prompt` and `action.outputMode` as before — backward compatible.
3. Read clipboard as context
4. `AiRouterService.call(prompt, context)`
5. Write result per `output_mode`

`agentCapability` is a constant defined in `PackRegistryService` (currently `1`), bumped manually when phase-2 execution is implemented.

`AppRegistryService` hardcoded entries for the 6 legacy tools are removed after migration. `CommandService` and `AiRouterService` require no changes.

### Mobile: Pack Browser UI

New **"AI Tools"** tab added to `AddTileScreen` between Shortcut and Games:

```
AddTileScreen tabs: Apps | Shortcut | AI Tools | Games
```

**AI Tools tab flow:**
1. Grid of pack cards (icon + name)
2. Tap a pack → list of its tools with current selection state
3. Tap a tool → toggle add/remove from deck
4. Tool card shows: label, output mode badge, phase-2 badge if applicable

### Mobile: Onboarding Screen

Triggered on first launch when `user_profile.onboarded = false`.

**Step 1 — "What best describes you?"**
- Grid of pack cards, single selection (or skip)

**Step 2 — "Here are your starter tools"**
- All phase-1 tools for chosen pack, pre-selected
- User can deselect any before confirming
- [Start with these tools] → writes `user_tool_selections` rows, sets `onboarded = true`

**Skip path:** User lands with empty AI section in deck + prompt to "Browse AI tools" via AddTileScreen.

---

## Migration Strategy

1. Seed Supabase with all 7 packs and 44 tools, populating `builtin_id` for the 6 legacy tools
2. On agent startup, `PackRegistryService` loads from Supabase
3. Existing user decks with legacy `builtin-ai-*` tile IDs are matched via `builtin_id` and remapped to their new Supabase tool IDs transparently
4. Once all clients have migrated (tracked via agent version), `builtin_id` column and `AppRegistryService` legacy entries are removed

---

## WebSocket Message Changes

| Message | Direction | Change |
|---------|-----------|--------|
| `PACK_REGISTRY` | Agent → Mobile | New — sends full pack + tool catalog on connect |
| `DECK_CONFIG` | Agent → Mobile | Unchanged — still sends resolved `TileConfig[]` |
| `BUTTON_TAP` | Mobile → Agent | Extended — `AI_CLIPBOARD` action gains an optional `toolId` field; when present, agent resolves `prompt` and `output_mode` from the registry cache rather than the inline action fields |

---

## Out of Scope (Phase 2)

- `source: active_window` — agent reads active window name and injects into prompt context
- `source: shell` — agent executes a shell command (e.g. `git diff`) and injects output as context
- Generate Commit Msg (Engineer) and Active Game Tip (Gamer) unlock automatically when agent announces phase-2 capability via `PACK_REGISTRY` handshake
