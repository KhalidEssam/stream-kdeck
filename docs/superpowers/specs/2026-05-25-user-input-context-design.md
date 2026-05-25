# User Input Context for AI Packs - Design Spec

**Date:** 2026-05-25
**Status:** Draft for review
**Implementation status:** Do not implement yet. This document is for context design, pack policy, and sequencing decisions.

---

## Purpose

Design a first-class user-input context layer for AI pack tools.

The goal is to let a user tap an AI tool and, when that tool needs clarification, provide intentional context through speech or text before the model runs. This input becomes the highest-priority intent anchor, while inferred context such as active window, clipboard, project files, media state, and OBS state becomes supporting evidence.

---

## Problem

The current context engine can gather useful data from multiple providers, but it still risks sending unrelated or stale context to the model.

Example failure:

1. Active app context detects `Valorant`.
2. User taps Gamer -> Explain Mechanic.
3. Clipboard contains dirty text from an unrelated engineering task.
4. The model receives both contexts and tries to reconcile them.
5. It invents a bridge from engineering text to a game agent such as Killjoy and gives an inaccurate answer.

The issue is not provider collection. The issue is that inferred context is being treated too much like intentional context.

The model should not be forced to decide whether the clipboard is relevant. KDeck should evaluate and label context before the model sees it.

---

## Product Thesis

Intentional user context should outrank inferred context.

The user saying:

> "How do I open the buy weapons window in Valorant?"

is stronger than clipboard text, stale terminal output, or a noisy active app guess.

The context flow should move from:

```text
collect all declared context -> send all to model -> model guesses relevance
```

to:

```text
capture user intent -> collect declared context -> evaluate relevance -> send trusted context to model
```

---

## Goals

- Add `user_input` as a first-class context provider.
- Support speech and text as input modalities.
- Allow each AI tool to mark user input as required, optional, or not used.
- Treat user input as high-priority intent context when present.
- Prevent unrelated clipboard/project/app context from polluting the model prompt.
- Preserve fast one-tap behavior for tools that already have enough artifact context.
- Define a pack-by-pack integration policy for required and optional user input.
- Leave the speech-to-text engine choice behind a provider abstraction.

---

## Non-Goals

- No always-listening microphone.
- No wake word.
- No generic Siri/Copilot-style assistant behavior.
- No autonomous execution based only on speech.
- No immediate vendor decision for Whisper, Apple Speech, Android Speech, or another STT provider.
- No implementation in this document.

---

## Definitions

### Intentional context

Context the user actively provides for this run.

Examples:

- Spoken question.
- Typed instruction.
- Edited transcript.
- Pasted clarification in a run prompt.

### Inferred context

Context KDeck reads from the environment.

Examples:

- Clipboard.
- Active window.
- Active terminal cwd.
- Project files.
- Git state.
- Media sessions.
- OBS state.

### Intent anchor

The primary instruction that explains what the user actually wants the model to answer.

When `user_input` is present, it should become the intent anchor.

### Context candidate

A provider result before final prompt assembly. Candidates can be accepted, downgraded, or rejected.

---

## Recommended Runtime Flow

```text
Mobile BUTTON_TAP
  -> Agent resolves PackTool by toolId
  -> Agent reads tool context contract
  -> If user_input is required:
       UserContextRequestService.capture(client, toolMeta)
         sends USER_CONTEXT_REQUEST to mobile
         awaits USER_CONTEXT_RESPONSE or timeout
       stop if user cancels, timeout expires, or transcript is empty
  -> If user_input is optional and user-initiated:
       same capture path, but tap proceeds without it if absent
  -> Resolved user_input text is passed directly into prompt composer
     (NOT routed through ContextRegistryService or ConsentStoreService)
  -> Agent collects inferred context providers via ContextAssemblerService
  -> Context evaluator scores candidates against:
       tool domain
       user intent
       provider role
       recency
       confidence
  -> Prompt composer builds:
       User Intent
       Trusted Context
       Optional Context Used
       Rejected Context Summary
       Missing Context
  -> AiRouterService calls the model
```

### Concurrent tap handling

If the user taps a tile again while a `USER_CONTEXT_REQUEST` is pending for that tile, the agent sends `USER_CONTEXT_CANCEL` for the old `requestId`, then starts a new request. Requests are keyed per tile per client — there should never be two live requests for the same tile. `UserContextCancelMessage` must be added to the `AgentMessage` union so mobile can handle it.

---

## UX Model

### Required user input

When a tool marks `user_input` as required, tapping the tile opens a short input capture sheet before the AI call.

The first implementation should support:

- Text input.
- Native keyboard dictation through the OS keyboard mic.
- Submit and cancel.
- Empty-input validation.

Later implementations can replace or enhance this with native push-to-talk speech recognition.

### Optional user input

Optional user input should not block every tap by default. It should be user-initiated.

Recommended options:

- Long-press an AI tile to "Run with question".
- Add a small mic/context modifier in the AI result flow.
- Let specific tools opt into a lightweight pre-run prompt if their value depends heavily on clarification.

The default fast path remains:

```text
tap tile -> gather inferred context -> run
```

unless the tool explicitly requires user input.

### Timeout behavior

If `timeoutMs` elapses on a required `USER_CONTEXT_REQUEST` with no response, the agent sends `USER_CONTEXT_CANCEL` for that `requestId` and treats the run as canceled: no AI call is made and the tile returns to its idle state with a clear error. Mobile dismisses the input sheet on receipt of `USER_CONTEXT_CANCEL`.

### Low confidence or empty transcripts

If speech capture returns empty or low-confidence text, the command should not silently continue for required tools.

The user should be asked to:

- Try again.
- Edit the transcript.
- Cancel.

---

## Speech-to-Text Strategy

### Phase 1: Text sheet plus keyboard dictation

Use a mobile input sheet and let users use the native keyboard microphone.

Benefits:

- Fastest to ship.
- Multilingual support comes from the OS keyboard.
- No cloud STT cost.
- No audio capture pipeline yet.
- Validates the context contract before investing in STT.

Limitations:

- The app cannot reliably auto-start keyboard dictation.
- The user must tap the keyboard microphone manually.

#### Phase 1 capture mode behavior

In Phase 1, `captureMode: 'speech'` and `captureMode: 'speech_or_text'` are functionally identical on mobile — both show the text input sheet and let the user invoke the OS keyboard microphone manually. The distinction only matters in Phase 2 when native push-to-talk is available. Do not implement separate UI paths for these two modes in Phase 1.

The `languageHint` field in `USER_CONTEXT_REQUEST` has no effect in Phase 1 (the OS keyboard controls language). It is included for forward compatibility with Phase 2 native STT.

### Phase 2: Native push-to-talk

Use native iOS and Android speech recognition APIs behind a `SpeechCaptureService`.

Benefits:

- Real "tap AI command and listen" experience.
- Good for short commands and questions.
- Lower latency than cloud in many cases.

Risks:

- Platform-specific implementation.
- OS permission handling.
- Recognition behavior varies by device and language.

### Phase 3: Cloud or model-based STT

Use Whisper or another STT provider only if the product needs more consistent recognition across languages, accents, and devices.

Benefits:

- Consistent behavior across platforms.
- Strong multilingual accuracy.
- Easier provider-side improvements.

Risks:

- Cost.
- Latency.
- Privacy expectations.
- Requires clear disclosure when audio leaves the device.

Recommendation: build Phase 1 first, design the code so Phase 2 and Phase 3 are provider swaps.

---

## Schema Direction

### Add `user_input` provider

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
```

### Extend context requirement metadata

The current shape is:

```ts
export interface ToolContextRequirement {
  provider: ContextProviderId;
  required: boolean;
  reason: string;
  maxBytes?: number;
}
```

Recommended v2 shape:

```ts
export type ContextRole =
  | 'intent'
  | 'artifact'
  | 'environment'
  | 'supporting';

export type UserInputMode =
  | 'text'
  | 'speech'
  | 'speech_or_text';

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

`user_input` requirements should usually use:

```json
{
  "provider": "user_input",
  "required": true,
  "role": "intent",
  "priority": 100,
  "captureMode": "speech_or_text",
  "reason": "The specific question or target the user wants this tool to answer"
}
```

### Optional future: alternative requirement groups

Some tools need either clipboard content or user input, not both.

Example:

- Study Plan can use a copied syllabus or a spoken topic.
- Color Palette can use a copied brief or a spoken brand direction.

The current `required: true` model cannot express "one of these providers is required." A future extension should support grouped requirements:

```ts
export interface ToolContextRequirement {
  provider: ContextProviderId;
  required: boolean;
  reason: string;
  group?: string;
  minRequiredInGroup?: number;
}
```

Example:

```json
[
  {
    "provider": "user_input",
    "required": false,
    "group": "primary_subject",
    "minRequiredInGroup": 1,
    "reason": "Topic or question supplied by the user"
  },
  {
    "provider": "clipboard",
    "required": false,
    "group": "primary_subject",
    "minRequiredInGroup": 1,
    "reason": "Selected or copied source material"
  }
]
```

This should be treated as a v2 capability after the basic `user_input` provider works.

---

## WebSocket Message Direction

User input capture is not the same as context permission. Permission asks, "May KDeck read this provider?" User input asks, "What do you want this run to do?"

Recommended messages:

```ts
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

export interface UserContextCancelMessage {
  type: 'USER_CONTEXT_CANCEL';
  requestId: string;
}
```

`USER_CONTEXT_CANCEL` is sent **agent → mobile** when the agent supersedes a pending request (e.g. the user tapped the tile again, or the agent-side timeout fired). On receipt, mobile should dismiss the input sheet for that `requestId` without sending a response. If mobile has already sent a `USER_CONTEXT_RESPONSE` before the cancel arrives, the agent ignores the cancel — the response wins.

The agent should only call the AI model after a required request returns valid text.

---

## Pre-Assembly Resolution

`user_input` is architecturally different from all other context providers. Every other provider reads from the desktop environment synchronously. `user_input` requires a round-trip to the mobile client before the assembler runs.

For this reason, `user_input` must NOT be routed through `ContextRegistryService` or `ConsentStoreService`.

- `ContextRegistryService` has no WebSocket client reference and cannot fire `USER_CONTEXT_REQUEST`.
- `ConsentStoreService` models provider permission, not user input capture. Asking for consent on `user_input` is wrong behavior.
- The existing `ContextProvider` interface (`probe`, `preview`, `read`) does not carry the tool metadata needed to build a meaningful input prompt.

### Correct integration point

A new `UserContextRequestService` handles capture. It is called by the AI action handler directly, before the assembler is invoked:

```text
AI action handler
  -> inspect contextRequirements for user_input entries
  -> if found: call UserContextRequestService.capture(client, { toolId, title, prompt, captureMode, required, timeoutMs })
  -> await UserContextResponseMessage or timeout
  -> on cancel or timeout: throw, do not call assembler
  -> on valid text: pass resolved text to prompt composer as the User Intent section
  -> call ContextAssemblerService for all remaining (inferred) requirements
```

The assembler never sees a `user_input` requirement. `ContextProviderId` is extended to include `'user_input'` in the shared schema, but the assembler skips it (or asserts it is never passed a `user_input` entry).

The `PROVIDER_LABELS` record in `context-assembler.service.ts` should add `user_input: 'User Intent'` as a documentation entry even though the assembler never processes it directly.

---

## Context Payload Direction

`user_input` should produce a structured payload internally even if final assembly is markdown.

```ts
export interface UserInputContextPayload {
  providerId: 'user_input';
  text: string;
  modality: 'text' | 'speech';
  language?: string;
  confidence?: number;
  capturedAt: string;
  provenance: 'mobile_input_sheet' | 'native_stt' | 'cloud_stt';
}
```

The final prompt section should be explicit:

```text
### User Intent
How do I open the buy weapons window in Valorant?

### Trusted Context
- Active app: Valorant

### Rejected Context Summary
- Clipboard was ignored because it appears to be software engineering text and does not match the gamer tool or user intent.
```

Do not include the full rejected clipboard content unless a debugging mode is explicitly enabled. The summary is enough to explain provenance without inviting the model to create a false bridge.

---

## Relevance Evaluation Layer

The current assembler mostly reads and appends provider output. The next layer should evaluate context before prompt composition.

### Candidate fields

```ts
export interface ContextCandidate {
  providerId: ContextProviderId;
  role: ContextRole;
  content: string;
  byteSize: number;
  provenance: string;
  confidence: number;
  recencyMs?: number;
  domainHints?: ContextDomain[];
}

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
```

### Evaluation outcomes

```ts
export type ContextCandidateDecision =
  | 'accepted'
  | 'downgraded'
  | 'rejected';
```

Each rejected or downgraded candidate should carry a reason.

Examples:

- `clipboard_domain_mismatch`
- `clipboard_stale`
- `required_provider_missing`
- `active_window_low_confidence`
- `user_input_empty`

### Evaluation rules

1. `user_input` with valid text is always the top intent source.
2. Required providers must be present unless the user cancels the run.
3. Optional providers can be rejected when they conflict with the tool domain or user intent.
4. Dirty clipboard should not be passed through just because it exists.
5. The model should receive rejected-context summaries, not rejected-context bodies.
6. Do not allow semantic bridge guessing. A random engineering task should not become a Valorant Killjoy explanation just because both contain the word "engineering."

### Domain classification strategy (Phase 3)

The evaluator needs a lightweight signal to decide whether an optional provider's content matches the tool's domain. The recommended approach for Phase 3 is **keyword vocabulary matching** — fast, free, deterministic, and auditable.

Each `ContextDomain` maps to a short word list. The evaluator scores a provider's content string against every domain vocabulary and identifies the best-matching domain. That score drives the decision — but the outcome has two distinct cases:

**No domain signal** — the content scores near-zero across all domains (e.g. a clipboard that only contains a URL, a bare filename, or a number). Decision: **downgrade**, not reject. The content may still be useful; the evaluator cannot say it conflicts.

**Clear conflicting domain** — the content scores high for a domain that is different from the tool's domain (e.g. software vocabulary in a gamer tool, or gaming vocabulary in an email tool). Decision: **reject** with `_domain_mismatch`. Do not pass conflicting content to the model even summarized.

Example vocabularies:

```ts
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
```

The decision rule:

```text
detectedDomain = domain with highest keyword hit count
toolDomain     = domain from the active tool's pack

if detectedDomain == 'unknown' or hit count < MIN_HITS:
  -> downgrade (no signal)
elif detectedDomain != toolDomain:
  -> reject with clipboard_domain_mismatch
else:
  -> accept
```

`MIN_HITS` should start at 2 and be tuned against real evaluation fixtures before Phase 3 ships. Full LLM-based classification is explicitly deferred and should only be considered if vocabulary matching produces too many false positives in real usage.

---

## Pack Integration Policy

### Tool patterns

| Pattern | Description | User input policy | Examples |
|---|---|---|---|
| Artifact-driven | The tool transforms copied or selected content | Optional | Fix Grammar, Review Code, Summarize Notes |
| Question-driven | The user is asking a specific question that cannot be inferred safely | Required | Explain Mechanic, Counter Strategy, Quest Helper |
| Environment-driven | Active app/system state is enough for a broad tip | Optional | Active Game Tip |
| Brief-driven | The user needs to supply a goal, audience, brand, or constraints | Required or grouped with clipboard | Color Palette, Study Plan, Write Email |
| Project-driven | Project/git context is primary; user can refine intent | Optional | Git branch summary, Explain Error |

### Engineer pack

| Tool | Recommended `user_input` policy | Notes |
|---|---|---|
| Explain Error | Optional | Clipboard error remains primary. User input can add "this happened after npm install" or "explain in simple terms." |
| Write Tests | Optional | Clipboard code is primary. Project files infer framework. |
| Review Code | Optional | Clipboard diff/code is primary. User input can focus review on security, performance, or bugs. |
| Write Docstring | Optional | Clipboard function is primary. |
| Convert to TypeScript | Optional | Clipboard JavaScript is primary. |
| Explain Regex | Optional | Clipboard regex is primary. |
| Generate Commit Msg | Optional | Git/clipboard diff is primary. User input can specify scope or tone. |

### Writer pack

| Tool | Recommended `user_input` policy | Notes |
|---|---|---|
| Fix Grammar | Optional | Clipboard text is primary. |
| Make Shorter | Optional | User input can specify target length. |
| Continue Story | Optional | Clipboard excerpt is primary. |
| Rewrite Tone | Optional | User input can specify the desired tone instead of the default three versions. |
| Brainstorm Plot | Optional now, grouped later | Either clipboard premise or user-spoken premise should satisfy the tool. |
| Add Dialogue | Optional | User input can add character notes. |
| Punch It Up | Optional | Clipboard text is primary. |

### Gamer pack

| Tool | Recommended `user_input` policy | Migration change needed | Notes |
|---|---|---|---|
| Explain Mechanic | Required | Yes — replace clipboard-required with user_input-required; clipboard becomes optional | The model needs the specific mechanic, keybind, agent, item, or rule. Active game is supporting context. Clipboard is relevance-checked. |
| Build Optimizer | Required | Yes — same change | User should say what build/loadout they want optimized unless a relevant clipboard artifact is present in a later grouped-contract version. |
| Lore Summary | Optional | No | Clipboard lore text can be primary. User input can clarify game or spoiler preference. |
| Callout Phrases | Required | Yes — same change | Needs the in-game situation or objective. |
| Counter Strategy | Required | Yes — same change | Needs the target strategy, champion, agent, weapon, or loadout. |
| Quest Helper | Required | Yes — same change | Needs quest name, objective, or blocker. |
| Active Game Tip | Optional | No | Active window/media/OBS can be primary. User input can focus the tip, such as "aiming" or "economy." |

### Student pack

| Tool | Recommended `user_input` policy | Notes |
|---|---|---|
| Translate ES | Optional | Clipboard text is primary. |
| ELI5 | Optional now, grouped later | Either clipboard concept or spoken question should work. |
| Summarize Notes | Optional | Clipboard notes are primary. |
| Make Flashcards | Optional | Clipboard study material is primary. |
| Check My Answer | Optional | Clipboard question/answer is primary. User input can specify rubric. |
| Write Citation | Optional | Clipboard source metadata is primary. |
| Study Plan | Required or grouped later | Needs a topic, deadline, exam, or syllabus. User input is a natural primary source. |

### Designer pack

| Tool | Recommended `user_input` policy | Notes |
|---|---|---|
| Write Microcopy | Required or grouped later | Needs UI element and intent. Clipboard can satisfy this if relevant. |
| Naming Ideas | Required or grouped later | Needs concept or feature brief. |
| Color Palette | Required or grouped later | Needs brand, mood, audience, or visual direction. |
| Design Critique | Optional | Clipboard spec/design description is primary. Active app can support. |
| Accessibility Check | Optional | Clipboard component/copy is primary. Project files can support. |
| Simplify UX Copy | Optional | Clipboard text is primary. |

### Social Media pack

| Tool | Recommended `user_input` policy | Notes |
|---|---|---|
| Write Tweet | Optional | Clipboard/source content is primary. |
| Write Caption | Required or grouped later | Needs content description, platform, or campaign goal. Clipboard can satisfy if relevant. |
| Generate Hashtags | Optional | Clipboard topic/content is primary. |
| LinkedIn Rephrase | Optional | Clipboard text is primary. |
| A/B Headlines | Optional | Clipboard content is primary. |
| Thread Expander | Optional | Clipboard idea/draft is primary. |
| Hook Generator | Required or grouped later | Needs topic, offer, or content angle. |

### Productivity pack

| Tool | Recommended `user_input` policy | Notes |
|---|---|---|
| TL;DR | Optional | Clipboard text is primary. |
| Write Email | Required or grouped later | Needs goal, recipient context, or notes. Clipboard can satisfy if relevant. |
| Action Items | Optional | Clipboard meeting notes are primary. |
| Prioritize | Optional | Clipboard task list is primary. User input can specify criteria. |
| Rewrite Clearly | Optional | Clipboard text is primary. |
| Reply Draft | Optional | Clipboard message is primary. User input can specify stance or constraints. |

### Git and Developer project pack

| Tool class | Recommended `user_input` policy | Notes |
|---|---|---|
| Repository summary | Optional | Project files and git are primary. User input can ask for detail level. |
| Branch summary | Optional | Git is primary. |
| PR description | Optional | Git diff/log is primary. User input can specify audience. |
| Conflict explanation | Optional | Git conflict files are primary. User input can add intent. |
| Command tools | Not used | User input should not become arbitrary shell generation. Commands need explicit templates and confirmation. |

---

## Prompt Composition Policy

The model should receive context in priority order.

Recommended format:

```text
### User Intent
{user_input_text}

### Trusted Context
{accepted high-confidence provider sections}

### Supporting Context
{accepted optional provider sections}

### Context Not Used
- {provider}: {reason}

### Missing Context
- {required provider or recommended clarification, if any}
```

Rules:

- Put `User Intent` first when present.
- Never place rejected context bodies in the prompt.
- Keep active app/game/environment context concise.
- Keep clipboard context only when it matches the tool domain or user intent.
- If the user intent and inferred context conflict, ask for clarification or trust the user intent and downgrade the inferred context.

---

## Data and Privacy Policy

- Push-to-talk or explicit input only.
- No background microphone capture.
- No audio sent to the AI model; only transcript text is sent.
- If cloud STT is used later, disclose that audio leaves the device before capture.
- Do not store transcripts by default in phase 1.
- If run history later stores transcripts, make it local-first and deletable.
- Required user input should be scoped to a single run unless the user saves it into a reusable workflow or tile configuration.

---

## Implementation Plan

### Phase 0: Decisions

- [ ] Decide whether Phase 1 uses text sheet plus keyboard dictation.
- [ ] Decide whether optional user input is triggered by long-press, a mic modifier, or a per-tool prompt.
- [ ] Decide whether grouped requirements are needed before updating broad pack data.
- [ ] Decide transcript storage default.

### Phase 1: User input request loop

- [ ] Add `user_input` to shared context provider types.
- [ ] Add `USER_CONTEXT_REQUEST` and `USER_CONTEXT_RESPONSE` messages.
- [ ] Add mobile input capture sheet with text entry and keyboard dictation support.
- [ ] Add agent-side request service with timeout and cancellation.
- [ ] Add `UserContextRequestService` that sends `USER_CONTEXT_REQUEST`, awaits `USER_CONTEXT_RESPONSE` or timeout, and returns the resolved text to the AI action handler. This is not a registry provider.
- [ ] Make required `user_input` block the AI call until valid text is returned.

### Phase 2: Prompt composer upgrade

- [ ] Add provider roles and priority metadata.
- [ ] Split context assembly into candidate collection and prompt composition.
- [ ] Put `User Intent` before inferred context.
- [ ] Add rejected-context summaries.
- [ ] Add tests for empty, canceled, and low-confidence required input.

### Phase 3: Relevance evaluator

- [ ] Add lightweight domain classification for clipboard and active window context.
- [ ] Reject clipboard when it clearly conflicts with tool domain and user intent.
- [ ] Downgrade stale or low-confidence optional context.
- [ ] Add acceptance tests for dirty clipboard plus active game.
- [ ] Add debug logging for context decisions without logging sensitive full content by default.

### Phase 4: Pack contract update

**Migration impact:** The current migration `20260524000019_ai_pack_context_requirements.sql` sets `clipboard` as `required: true` for these Gamer tools: Explain Mechanic, Build Optimizer, Callout Phrases, Counter Strategy, and Quest Helper. Phase 4 requires a new migration that changes these five tools to require `user_input` instead of clipboard, and makes clipboard optional and relevance-checked for them.

All other packs are additive — their existing clipboard requirements stay, and `user_input` is layered in as optional or grouped.

- [ ] Write and apply migration changing question-driven Gamer tools from clipboard-required to user_input-required.
- [ ] Update Designer, Social, Student, and Productivity brief-driven tools with required or grouped user input.
- [ ] Keep artifact-driven tools fast and optional.
- [ ] Add pack lint rules for `user_input` policies.
- [ ] Add manual evaluation fixtures per pack.

### Phase 5: Native STT

- [ ] Add speech capture abstraction on mobile.
- [ ] Implement native push-to-talk for one platform first.
- [ ] Add language and confidence metadata.
- [ ] Add transcript edit-before-submit.
- [ ] Keep text fallback always available.

### Phase 6: Cloud/model STT, if needed

- [ ] Add provider config for cloud STT.
- [ ] Add privacy disclosure and user setting.
- [ ] Add cost controls and timeout handling.
- [ ] Compare accuracy against native STT before making it default.

---

## Testing Strategy

### Unit tests

- Required `user_input` request resolves and is inserted as `User Intent`.
- Required `user_input` cancellation returns a user-facing error and skips the AI call.
- Optional `user_input` is skipped when absent.
- Low-confidence speech response asks for edit/retry instead of calling AI.
- Rejected context body is not included in final prompt.

### Integration tests

- Gamer Explain Mechanic with active window Valorant and dirty engineering clipboard should use user intent plus Valorant only.
- Engineer Explain Error with error clipboard and optional empty user input should still work.
- Writer Fix Grammar should not require a prompt before running.
- Study Plan with no clipboard should require or request a topic.
- Active Game Tip should run from active window/media context and optionally include user input.

### Manual acceptance scenarios

1. User taps Gamer -> Explain Mechanic and says "How do I open the buy menu in Valorant?"
   - Expected: model answers the keybind/mechanic question.
   - Dirty clipboard is rejected.

2. User taps Designer -> Color Palette and says "Cyberpunk dashboard for finance traders."
   - Expected: model uses spoken brief as primary context.

3. User taps Engineer -> Review Code with copied diff.
   - Expected: no speech prompt appears by default.

4. User long-presses Engineer -> Review Code and says "Focus only on security issues."
   - Expected: user input is added as intent/focus, diff remains artifact context.

5. User cancels required speech/text input.
   - Expected: no AI call and a clear canceled state.

---

## Risks

### Too much friction

If every AI tool asks for speech/text first, the product loses its one-tap feel.

Mitigation: only require user input for question-driven or brief-driven tools. Keep artifact-driven tools fast.

### False confidence from speech

Misheard text can be worse than dirty clipboard.

Mitigation: show transcript and allow edit before submit, especially for required input.

### Privacy concerns

Microphone capture changes user expectations.

Mitigation: push-to-talk only, visible listening state, no transcript storage by default, no cloud STT without disclosure.

### Schema complexity

Grouped requirements and relevance metadata could make pack authoring harder.

Mitigation: ship basic required/optional `user_input` first. Add grouped requirements after real pack examples prove the need.

---

## Open Questions

1. Should optional user input be triggered by long-press, a global mic modifier, or per-tool prompt configuration?
2. Should Phase 1 require grouped requirements, or can broad tools temporarily require user input? Tools like Brainstorm Plot, Study Plan, and Color Palette currently require clipboard content — without grouped requirements they will fail when clipboard is empty. Interim options: (a) accept this limitation in Phase 1; (b) make these tools temporarily require `user_input` instead of clipboard; (c) implement grouped requirements earlier than planned.
3. Should transcripts be stored in run history at all?
4. Should native STT be mobile-only first, or should desktop push-to-talk be part of the same feature?
5. Should cloud STT be a Pro feature, a BYOK feature, or avoided until native STT proves insufficient?
6. Should rejected-context summaries be visible to users in the result viewer for transparency?
7. Should the assembler assert (throw) when it receives a `user_input` requirement, as a safeguard against accidental routing? Or silently skip it?

---

## Approval Matrix

| Module | Recommendation | Decision |
|---|---|---|
| `user_input` provider | Approve | Pending |
| Text sheet plus keyboard dictation MVP | Approve | Pending |
| Native push-to-talk STT | Approve after MVP | Pending |
| Cloud/model STT | Defer | Pending |
| Relevance evaluator | Approve | Pending |
| Rejected-context summaries | Approve | Pending |
| Grouped context requirements | Defer until needed | Pending |
| Gamer required user input | Approve | Pending |
| Artifact-driven tools remain fast | Approve | Pending |

---

## Bottom Line

User-input context should become the intent anchor for AI tools that need clarification.

KDeck should not dump every available provider into the model. It should capture what the user wants, evaluate the surrounding context, reject noise, and then call the model with a smaller, trusted prompt.

This makes the AI packs feel less like prompt buttons and more like context-aware tools that understand the user's current task.
