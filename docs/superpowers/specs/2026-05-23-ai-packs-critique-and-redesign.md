# AI Packs Critique and Redesign Paths

**Date:** 2026-05-23
**Status:** Draft for review
**Implementation status:** Do not implement yet. This document is for critique, module approval, and sequencing decisions.

---

## Purpose

The current AI packs feature is useful as a remote prompt catalog, but it is not yet strong enough to carry the product promise. The user expects KDeck to simplify frequent work at the desk. That requires situational context, consent, previews, confirmations, and a history of what happened.

This document critiques the current direction and proposes fix paths as modules and tasks. Each module is intentionally reviewable on its own so it can be approved, rethought, or deferred before implementation.

---

## User Decisions Already Captured

1. Start from broad categories first, such as Streamer, Media, and Productivity. Developer or Git tools should not define the top-level mental model.
2. The desktop agent may read project files only after explicit user consent.
3. The best tools should mature into guided workflows with preview, confirmation, and result history.

---

## Current Implementation Snapshot

The current system has made real progress:

- Packs and tools are remote-defined through Supabase.
- Mobile can browse pack tools and add them as deck tiles.
- `PackTool` now supports both `kind: 'ai'` and `kind: 'command'`.
- Git pack seed data exists with AI tools and command tiles.
- Workflow tiles exist as user-authored sequences of non-AI actions.
- OBS, media sessions, active window tracking, integrations, and plugin state already exist elsewhere in the product.

The issue is not that the feature has no foundation. The issue is that the foundation is not yet connected into a context-aware work system.

---

## Core Critique

### 1. AI packs are currently prompt bookmarks

The current pack model mostly lets the server define prompt text, labels, icons, and output modes. That is convenient for shipping content, but it does not make the AI meaningfully aware of the user's task.

Example: a Git tool titled "How Do I Run This Project?" cannot reliably answer from the clipboard. It needs project files, manifests, README content, package scripts, local repo state, and maybe the active terminal directory. Without those, it will guess or search the wrong surface.

### 2. `source` is modeled but not executed

The schema and seed content can say a tool uses `clipboard`, `active_window`, or `shell`, but the current agent execution path still reads clipboard context for AI tools.

Observed implementation gap:

- `apps/agent/src/command/command.service.ts` resolves pack prompt/output mode by `toolId`.
- It does not branch on the tool's declared `source`.
- It then reads `ClipboardService.read()` and sends that as AI context.

This makes Git pack context declarations look more capable than the runtime actually is.

### 3. Command tools do not yet have a trustworthy working context

The Git design says command tiles should run in the working directory of the active terminal process. The current `SHELL_RUN` path executes the command directly without an explicit cwd handoff.

That means a command like `git status` may run wherever the agent process happens to be, not necessarily inside the user's target repository.

### 4. The top-level product framing is too narrow

"AI Tools" centers implementation technology instead of user intent. Users do not wake up wanting AI packs; they want to prepare a stream, clean up audio, ship a change, summarize a meeting, draft a reply, or automate a repeated desk routine.

The better concept is:

> Contextual Work Packs: collections of tools, commands, integrations, and guided workflows for a category of work.

AI becomes one capability inside a pack, not the pack category itself.

### 5. Context access has no visible consent contract

If the agent will read project files, the product needs a clear permission surface:

- What folder or app is being read?
- Why is this tool asking for access?
- Is the access one-time, session-long, or remembered?
- Can the user preview the context before it is sent to AI?
- Can the user revoke access later?

Without this, project-file access would feel powerful but unsafe.

### 6. There is no run lifecycle

The current tap model is too simple for high-value work:

1. Tap tile.
2. Agent executes.
3. Maybe a viewer opens or clipboard changes.

For serious tools, the lifecycle should be:

1. Gather context.
2. Show preview.
3. Ask for confirmation when needed.
4. Execute.
5. Store result, metadata, and recovery options.

This is especially important for shell commands, project-file reading, AI-generated edits, stream controls, and multi-step workflows.

### 7. Pack quality is content-driven, not capability-driven

The current pack seed can add many tools quickly, but there is no quality bar that proves a tool has the context it needs. The Git pack exposed this clearly: a good label with weak context creates surprising answers.

A pack should be approved only when each tool declares:

- Required context providers.
- Fallback behavior.
- Permission scope.
- Preview format.
- Confirmation policy.
- Result artifact type.
- Test fixtures or evaluation examples.

---

## Product Reframe

### Current concept

AI Tool Packs:

- Remote prompt catalog.
- Mobile Add Tile tab.
- Tools mostly run against clipboard.
- Commands are direct shell shortcuts.

### Recommended concept

Contextual Work Packs:

- Broad category-first library: Streamer, Media, Productivity, Developer, Writing, Learning.
- Each pack contains a mix of AI tools, commands, integrations, and workflows.
- Tools declare what context they need.
- The desktop agent gathers context after consent.
- High-value tools become guided workflows with preview, confirmation, and result history.

### Naming recommendation

Use "Packs" or "Work Packs" in the main UX. Use "AI" only as a chip or capability label inside a tool row.

Examples:

- Streamer Pack
- Media Pack
- Productivity Pack
- Developer Pack
- Git Pack as a sub-pack or tool group inside Developer

---

## Feature Health Score

This is a product/UX score for the current AI packs feature, not a code quality score.

| Dimension | Score | Notes |
|---|---:|---|
| Match to user work | 2/5 | Categories exist, but tools are still prompt-first. |
| Context awareness | 1/5 | Context source is declared but mostly not executed. |
| User control and consent | 2/5 | Taps are user-initiated, but context permissions are not explicit enough. |
| Execution safety | 2/5 | Commands have output modes, but cwd, risk, and confirmation need work. |
| Workflow depth | 2/5 | Basic workflows exist, but AI and guided previews are excluded. |
| Result usefulness | 2/5 | Viewer/clipboard works, but history and provenance are missing. |
| Pack discoverability | 2/5 | AI Tools tab exists, but category mental model is too narrow. |
| Business-model strength | 2/5 | The content is easy to copy unless KDeck owns context, workflow, and history. |

**Overall:** 15/40. The feature is a promising skeleton, but not yet a defensible premium capability.

---

## Recommended Modules

Each module below is a decision unit. Approving a module does not automatically approve its full implementation.

### Module 1: Pack Taxonomy and Product Model

**Purpose:** Replace the narrow "AI Tools" mental model with broad Work Pack categories.

**Recommended direction:**

- Top-level categories: Streamer, Media, Productivity, Developer, Writing, Learning.
- Keep Git as a Developer/project-work pack, not the flagship category.
- Rename UI surfaces from "AI Tools" to "Packs" or "Work Packs".
- Tool cards show capability chips: AI, Command, Workflow, Integration.

**Tasks to consider:**

- Define pack category enum and display metadata.
- Add `category` to pack data model.
- Update Add Tile navigation to browse categories first, then packs, then tools.
- Preserve backward compatibility for existing AI pack rows.

**Decision needed:** Approve the Work Packs framing, or keep "AI Tools" as the user-facing label.

### Module 2: Context Permission and Consent

**Purpose:** Let the agent read richer context only with explicit user permission.

**Recommended direction:**

- Permission prompt shows exact provider, scope, and reason.
- Scopes support one-time, current session, or remembered permission.
- Project file access is folder-scoped and revocable.
- Consent state is local-first on the desktop agent.

**Tasks to consider:**

- Add a `CONTEXT_PERMISSION_REQUEST` WebSocket message.
- Add a mobile consent sheet with preview of requested scope.
- Store granted context scopes in the agent config.
- Add revoke controls in settings.
- Add audit metadata to each run history record.

**Decision needed:** Should project-file consent be per run, per folder, per pack, or per session?

### Module 3: Context Provider Runtime

**Purpose:** Make `source` real by giving the agent a provider interface for context gathering.

**Recommended direction:**

Create a `ContextProvider` interface with three phases:

```ts
interface ContextProvider {
  id: string;
  probe(request: ContextRequest): Promise<ContextProbe>;
  preview(request: ContextRequest): Promise<ContextPreview>;
  read(request: ContextRequest): Promise<ContextPayload>;
}
```

Initial providers:

- Clipboard provider.
- Active window provider.
- Active terminal cwd provider.
- Shell command provider.
- Project files provider.
- Git repository provider.
- Media session provider.
- OBS state provider.

**Tasks to consider:**

- Replace direct clipboard reads in AI execution with a context resolver.
- Implement provider registry in the agent.
- Add payload size limits and redaction hooks.
- Return provenance with every context payload.
- Add provider tests with fixture contexts.

**Decision needed:** Which providers are allowed in phase 1?

### Module 4: Project Workspace Context

**Purpose:** Make project-aware tools answer from the actual codebase after consent.

**Recommended direction:**

Start small. Do not build a full code index first. Build a bounded project summary provider:

- Resolve active cwd from terminal/editor if possible.
- Detect project root by `.git`, `package.json`, `pnpm-workspace.yaml`, `requirements.txt`, `Cargo.toml`, etc.
- Read high-signal files after consent: README, package manifests, scripts, config files, top-level tree, git status.
- Cache summaries per folder with invalidation.

**Tasks to consider:**

- Add project root resolver.
- Add project manifest reader.
- Add git summary reader.
- Add "what will be read" preview.
- Add max file count and byte limits.
- Add a local project summary cache.

**Decision needed:** Is phase 1 limited to metadata/manifests, or may it read selected source files too?

### Module 5: Tool Context Contract

**Purpose:** Make each tool declare the context it needs before it can ship.

**Recommended direction:**

Extend pack tools with a structured contract:

```ts
type ToolContextRequirement = {
  provider: 'clipboard' | 'active_window' | 'active_terminal' | 'project_files' | 'git' | 'media' | 'obs';
  required: boolean;
  reason: string;
  maxBytes?: number;
};
```

**Tasks to consider:**

- Add `context_requirements` to pack tool data.
- Add validation in pack registry.
- Hide or degrade tools when the agent lacks required providers.
- Show "Needs project access" or "Needs OBS" chips in mobile.
- Add fallback prompts for missing optional context.

**Decision needed:** Should tools without required context be hidden, disabled, or allowed with degraded output?

### Module 6: Guided Workflow Orchestrator

**Purpose:** Promote high-value tools from one-tap prompts into guided runs.

**Recommended direction:**

Add a workflow run model that supports:

- Context gathering.
- Preview.
- User confirmation.
- Execution.
- Result display.
- Retry or copy actions.
- History record.

This differs from the current simple workflow tile, which is just a sequence of actions.

**Tasks to consider:**

- Add a guided workflow manifest type.
- Add `WORKFLOW_RUN_PREVIEW`, `WORKFLOW_RUN_CONFIRM`, and `WORKFLOW_RUN_RESULT` messages.
- Allow AI steps inside guided workflows with explicit credit and context visibility.
- Add cancellation and timeout handling.
- Keep simple local sequence workflows as a separate lightweight feature.

**Decision needed:** Should guided workflows reuse the existing `WORKFLOW` action or become a new action kind?

### Module 7: Preview, Confirmation, and Risk Policy

**Purpose:** Keep powerful tools safe and understandable.

**Recommended direction:**

Every tool gets a risk level:

- `safe_read`: no confirmation after consent.
- `writes_clipboard`: lightweight confirmation optional.
- `external_side_effect`: confirmation required.
- `file_write`: preview diff and confirmation required.
- `destructive`: strong confirmation required.

**Tasks to consider:**

- Add `risk_level` to pack tools and workflow steps.
- Add preview renderers by result type: text, command, diff, OBS action, file list.
- Require confirmation for git push, file writes, stream start, stream stop, and destructive shell commands.
- Add denylist/allowlist checks for shell commands.

**Decision needed:** Which actions are allowed to run silently?

### Module 8: Result History and Artifacts

**Purpose:** Make work recoverable and valuable after the tap.

**Recommended direction:**

Store a local-first history of tool runs:

- Tool id, pack id, category.
- Context providers used.
- Permission scope used.
- Preview shown.
- Confirmation decision.
- Output/result.
- Errors.
- Duration and timestamp.

Cloud sync can be deferred. Sensitive context should not sync by default.

**Tasks to consider:**

- Add local run history store in the agent.
- Add mobile History screen or per-tile history sheet.
- Add result artifact types: text, command output, copied text, workflow log, diff.
- Add clear history and per-run delete.
- Add redaction before storage.

**Decision needed:** Should history be local-only at first?

### Module 9: Safe Command Runner

**Purpose:** Make command packs reliable and safe.

**Recommended direction:**

Move shell execution behind a service that knows cwd, risk, timeout, environment, and output capture.

**Tasks to consider:**

- Add `ShellRunnerService`.
- Resolve cwd from active terminal/project context.
- Add command preview before execution.
- Add timeout and output truncation.
- Add known-safe templates for common commands.
- Require confirmation for commands with remote side effects, such as `git push`.
- Add tests for cwd, timeout, output modes, and failure output.

**Decision needed:** Are arbitrary pack-defined shell commands allowed, or only command templates with parameters?

### Module 10: Pack Quality and Evaluation

**Purpose:** Prevent packs from becoming a landfill of weak prompts.

**Recommended direction:**

Introduce a pack review checklist:

- User category and job-to-be-done are explicit.
- Each tool has required context providers.
- Each tool has fallback behavior.
- Each tool has test fixtures.
- Each guided workflow has preview and result examples.
- Commands have risk classifications.

**Tasks to consider:**

- Add pack lint script for seed/catalog data.
- Add fixture-based AI prompt evaluations for high-value tools.
- Add manual acceptance scenarios per pack.
- Track run success, cancellation, and retry rates locally.

**Decision needed:** What is the minimum quality bar for a pack to ship?

---

## Recommended Fix Paths

### Path A: Foundation first

Build the consent, context provider runtime, and safe command runner before expanding pack content.

**Pros:**

- Fixes the root cause of weak answers.
- Makes Git and future project-aware packs credible.
- Creates defensible product value.

**Cons:**

- Slower visible progress.
- Requires careful permission design.

**Recommended when:** The next milestone is quality and business-model strength.

### Path B: Streamer/Media vertical first

Start with a broad category that already maps to existing product strengths: media sessions, OBS integration, app launching, volume control, and workflows.

Example guided workflows:

- Go Live Checklist.
- Recording Prep.
- Clip Review Setup.
- Quiet Desk Mode.
- Podcast Prep.
- End Stream Cleanup.

**Pros:**

- Matches the broader category-first direction.
- Uses existing OBS/media infrastructure.
- Requires less project-file privacy work.
- Easier to demo as a premium pack.

**Cons:**

- Does not fix Git/project context immediately.
- Still needs preview/history to feel premium.

**Recommended when:** The next milestone is a product demo users can feel quickly.

### Path C: Productivity vertical first

Build general work tools around clipboard, active window, apps, notes, and email-like drafting.

Example guided workflows:

- Meeting Follow-up.
- Inbox Reply Draft.
- Summarize Active Text.
- Turn Notes Into Tasks.
- Focus Session Setup.

**Pros:**

- Broadest audience.
- Easier to explain.
- Less domain-specific than streaming.

**Cons:**

- Needs stronger app/document context to avoid becoming generic.
- Risks feeling like ordinary AI wrappers if context is weak.

**Recommended when:** The business wants the widest non-technical category first.

### Path D: Developer/Git repair first

Fix the Git pack by implementing project context, git context, active cwd, and command safety.

**Pros:**

- Directly addresses the current broken expectation.
- Great testbed for context contracts.
- Developer users will immediately notice quality.

**Cons:**

- Narrower category than the desired top-level direction.
- Project-file consent must be solved earlier.

**Recommended when:** The Git pack remains in the product and must stop producing unexpected answers.

---

## Recommended Sequence

The strongest path is a hybrid:

1. Approve the Work Packs framing and category model.
2. Implement context permission and context provider runtime.
3. Repair command cwd and command safety.
4. Build one flagship Streamer/Media guided workflow pack.
5. Repair Git as a Developer pack using the same context foundation.
6. Add result history and pack quality checks.

This avoids making Git the whole product story while still fixing the real gap that Git exposed.

---

## Proposed Task Backlog for Approval

### Phase 0: Product model decisions

- [ ] Decide whether the user-facing feature name is "Packs", "Work Packs", or "AI Tools".
- [ ] Decide first top-level categories.
- [ ] Decide whether Git is a top-level pack or a Developer sub-pack.
- [ ] Decide consent duration model: one-time, session, folder, or pack.
- [ ] Decide local-only versus cloud-synced history for phase 1.

### Phase 1: Runtime foundation

- [ ] Add context provider interface and registry.
- [ ] Move AI tool execution from direct clipboard read to context resolver.
- [ ] Implement clipboard provider.
- [ ] Implement active window provider.
- [ ] Implement active terminal cwd provider.
- [ ] Implement safe command runner with cwd, timeout, output truncation, and risk metadata.
- [ ] Add context provenance to AI calls and action results.

### Phase 2: Consent and previews

- [ ] Add context permission request/response WebSocket messages.
- [ ] Add mobile consent sheet.
- [ ] Add context preview renderer.
- [ ] Add local consent storage and revoke settings.
- [ ] Add risk policy and confirmation rules.

### Phase 3: Project-aware context

- [ ] Add project root resolver.
- [ ] Add project manifest reader.
- [ ] Add git status/log/diff provider.
- [ ] Add project summary cache.
- [ ] Update Git tools to use structured project/git context.
- [ ] Add acceptance scenarios for "What does this repo do?" and "How do I run this project?"

### Phase 4: Guided workflows

- [ ] Define guided workflow manifest.
- [ ] Add preview/confirm/result lifecycle.
- [ ] Allow AI steps only in guided workflows with explicit credit and context preview.
- [ ] Add run history store.
- [ ] Add mobile result history UI.

### Phase 5: Flagship vertical pack

- [ ] Define Streamer/Media pack goals and target users.
- [ ] Draft workflow templates: Go Live Checklist, Recording Prep, End Stream Cleanup.
- [ ] Map each workflow to OBS, media, app launch, and optional AI steps.
- [ ] Add fixture scenarios and manual acceptance tests.
- [ ] Ship behind feature flag or preview channel.

---

## First Pack Recommendation

Do not make Git the first flagship Work Pack.

The first flagship should be Streamer/Media because KDeck already has relevant native capabilities:

- OBS integration.
- Media sessions.
- Volume and mute controls.
- App launch and workflows.
- Active window state.

This pack can demonstrate KDeck as a premium control surface without requiring immediate project-file access. Then the same workflow, preview, and history system can be reused for Developer/Git.

Git should become the first deep context proof after the foundation is in place.

---

## Non-Goals for the Next Decision Round

- No full semantic codebase index yet.
- No autonomous file edits yet.
- No cloud sync of sensitive context by default.
- No marketplace/community pack sharing yet.
- No arbitrary AI agent that acts without preview and confirmation.

---

## Open Questions

1. Should project-file permission be granted per folder or per pack?
2. Should command tools be arbitrary shell strings or safe templates with parameters?
3. Should history live on the desktop agent only for the first release?
4. Should AI tools remain in the Add Tile flow, or should Packs get a dedicated navigation surface?
5. Which flagship vertical should be approved first: Streamer/Media, Productivity, or Developer/Git?

---

## Approval Matrix

| Module | Recommendation | Decision |
|---|---|---|
| Pack taxonomy and Work Packs naming | Approve | Pending |
| Context permission and consent | Approve | Pending |
| Context provider runtime | Approve | Pending |
| Project workspace context | Approve with metadata-first scope | Pending |
| Tool context contract | Approve | Pending |
| Guided workflow orchestrator | Approve, but design separately from simple sequence workflows | Pending |
| Preview, confirmation, and risk policy | Approve | Pending |
| Result history and artifacts | Approve local-first | Pending |
| Safe command runner | Approve before expanding command packs | Pending |
| Pack quality and evaluation | Approve lightweight first | Pending |

---

## Bottom Line

The AI packs feature should continue, but its center of gravity should change.

The value is not "more prompts on buttons." The value is KDeck knowing enough about the user's current work, with consent, to turn repeated desk routines into trusted one-tap or guided workflows.
