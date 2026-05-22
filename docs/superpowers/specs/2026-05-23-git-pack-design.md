# Git Pack — Design Spec

**Date:** 2026-05-23
**Status:** Approved

---

## Overview

Introduce a "Git" pack in the tile catalog giving users one-tap access to AI-powered git helpers and direct git command shortcuts. The feature ships in two sub-projects: (1) extending the pack system to support command-type tools alongside AI tools, and (2) defining the Git pack content.

---

## Sub-project 1 — PackTool Command Support

### Problem

`PackTool` is currently AI-only: every tool has `prompt`, `source`, and `outputMode`, and adding a tool always creates an `AI_CLIPBOARD` tile. Direct shell commands (git push, git status, etc.) cannot be expressed as pack tools today.

### Schema change — `packages/shared/src/schema.ts`

Replace the flat `PackTool` interface with a discriminated union:

```typescript
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

Existing consumers that only use the shared fields (`id`, `packId`, `label`, `icon`, `color`, `order`, `phase`, `builtinId`) are unaffected. Consumers that access `prompt`/`source`/`outputMode` must narrow on `tool.kind === 'ai'` first.

### Supabase migration

Add two nullable columns to `pack_tools`:

| Column | Type | Default | Notes |
|---|---|---|---|
| `kind` | `VARCHAR(20)` | `'ai'` | `'ai'` or `'command'` |
| `command` | `TEXT` | `NULL` | populated only when `kind = 'command'` |

No existing rows are affected — they all default to `kind = 'ai'`.

### Agent — `apps/agent/src/packs/pack-registry.service.ts`

`RawTool` gains `kind: string` and `command: string | null`. Mapping logic:

```typescript
kind: (t.kind === 'command' ? 'command' : 'ai') as PackTool['kind'],
command: t.command ?? undefined,
```

The rest of the AI fields (`prompt`, `source`, `outputMode`) are only mapped when `kind === 'ai'`.

### Agent — tile creation path

When the mobile client sends `ADD_TILE` for a pack tool, the agent currently always creates an `AI_CLIPBOARD` action. The handler must check the tool kind:

- `kind === 'ai'` → `{ kind: 'AI_CLIPBOARD', prompt, outputMode, toolId }`
- `kind === 'command'` → `{ kind: 'SHELL_RUN', command, outputMode }`

### Mobile — `apps/mobile/src/screens/AddTileScreen.tsx`

When constructing the `TileConfig` to submit for a pack tool:

- `kind === 'ai'` → action `AI_CLIPBOARD` (existing behaviour)
- `kind === 'command'` → action `SHELL_RUN`

The pack tool card in the catalog UI shows a small chip — **"AI"** (purple) or **"Command"** (grey) — so users know what type of tile they are adding before they tap Add.

---

## Sub-project 2 — Git Pack Content

### Pack metadata

| Field | Value |
|---|---|
| `slug` | `git` |
| `name` | `Git` |
| `description` | `Version control tools — AI-powered helpers and one-tap git commands` |
| `icon` | `git-branch` (or 🔀) |
| `color` | `#F05033` |

### Primary source strategy

AI tools use **active window** as their primary source — the agent reads the content visible in the user's active editor or terminal and passes it to the AI. Tools that need structured git data (log, branch summary) fall back to **shell** as their source, where the agent runs a targeted git command to gather context before the AI call.

### Tool catalog

#### Commit (AI)

| # | Label | Source | Output | Notes |
|---|---|---|---|---|
| 1 | Write Commit Message | active window | clipboard | Reads staged diff or visible changes; produces a conventional commit message |
| 2 | Improve Commit Message | clipboard | clipboard | Takes an existing draft message and tightens it |
| 3 | Explain This Commit | active window | viewer | Plain-English explanation of what the visible commit does and why |

#### PR / Review (AI)

| # | Label | Source | Output | Notes |
|---|---|---|---|---|
| 4 | Draft PR Description | active window | clipboard | Reads visible diff or branch summary; writes PR title + body |
| 5 | Review This Diff | active window | viewer | Identifies issues, risks, and improvements in the visible diff |
| 6 | Summarize Changes | active window | viewer | One-paragraph plain-English summary of what changed |

#### Branch (AI)

| # | Label | Source | Output | Notes |
|---|---|---|---|---|
| 7 | Suggest Branch Name | clipboard | clipboard | Takes a ticket/task description; returns a kebab-case branch name |
| 8 | Summarize This Branch | shell | viewer | Runs `git log main..HEAD --oneline` and summarises what the branch changed |

#### Log / History (AI)

| # | Label | Source | Output | Notes |
|---|---|---|---|---|
| 9 | Explain Recent Commits | shell | viewer | Runs `git log --oneline -20`; narrates what happened in the repo |
| 10 | Find When Bug Was Introduced | clipboard | viewer | Takes an error/behaviour description; guides bisect strategy and candidate commits |

#### Conflict (AI)

| # | Label | Source | Output | Notes |
|---|---|---|---|---|
| 11 | Explain This Conflict | active window | viewer | Reads conflict markers; explains what is conflicting and why |
| 12 | Suggest Conflict Resolution | active window | clipboard | Proposes a resolved version of the conflicted block |

#### Onboarding (AI)

| # | Label | Source | Output | Notes |
|---|---|---|---|---|
| 13 | What Does This Repo Do? | active window | viewer | Reads visible README or file listing; gives a plain-English project summary |
| 14 | How Do I Run This Project? | active window | viewer | Reads package.json / Makefile / README; extracts setup and run instructions |

#### Direct Commands (kind: command)

| # | Label | Command | Output |
|---|---|---|---|
| 15 | Git Status | `git status` | viewer |
| 16 | Git Pull | `git pull` | viewer |
| 17 | Git Push | `git push` | viewer |
| 18 | Git Stash | `git stash` | silent |
| 19 | Git Stash Pop | `git stash pop` | viewer |
| 20 | Git Log | `git log --oneline -20` | viewer |

**Total: 20 tools — 14 AI + 6 command.**

### Working directory for command tiles

Direct command tiles run in the working directory of the **active terminal process** as detected by the agent (same mechanism used by `APP_LAUNCH` and existing `SHELL_RUN` tiles). No additional repo-detection logic is needed.

---

## Out of Scope

- Repo picker / multi-repo support — commands run against whichever repo is active in the terminal
- Authentication / SSH key setup
- GitHub/GitLab API integration (PR creation, CI status) — this belongs in a future integration plugin
- Prompt text for each AI tool — prompts are authored directly in Supabase when the pack rows are inserted; they are content, not code
