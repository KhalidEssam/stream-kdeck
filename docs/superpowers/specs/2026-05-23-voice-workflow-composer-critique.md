# Voice Workflow Composer Critique and Redesign Paths

**Date:** 2026-05-23
**Status:** Draft for review
**Implementation status:** Do not implement yet. This document is for critique, module approval, and sequencing decisions.

---

## Purpose

This document critiques the idea of adding speech-to-text input that is interpreted by an AI model and converted into executable workflows, tasks, and commands.

The core question is whether KDeck should become a PC/mobile assistant similar to Cortana, Copilot, Google Assistant, or Siri, but with deeper execution layers.

The answer is: yes, this direction can add real business strength, but only if it is framed as a **voice workflow composer and safe local execution layer**, not as a general-purpose assistant.

---

## Product Thesis

KDeck should not compete as a broad assistant that answers anything.

KDeck can win as:

> A voice-operated workflow composer for the user's own desktop environment.

The moat is not speech-to-text. The moat is turning messy human intent into safe, reviewable, reusable, local workflows that can control apps, commands, integrations, AI tools, media sessions, and work packs.

---

## Current Strategic Context

KDeck already has ingredients that make this idea credible:

- Mobile app as a remote control surface.
- Desktop agent with local execution authority.
- Tile actions for apps, URLs, shortcuts, clipboard, shell commands, integrations, and workflows.
- Workflow builder for multi-step action sequences.
- OBS integration and media session control.
- AI tool packs and command packs.
- A planned context provider, consent, preview, confirmation, and result history foundation.

Voice should sit on top of these systems. It should not bypass them.

---

## Strong Version

The strong feature is not:

> "Ask KDeck anything."

The strong feature is:

> "Tell KDeck what workflow you want, review the generated plan, then save or run it."

Example:

User says:

> "Make a go-live workflow. Open OBS, switch to my gaming scene, mute Chrome, set Spotify to 20 percent, open my stream notes, and start stream only after I confirm."

KDeck drafts:

1. Open OBS.
2. Switch OBS scene to Gaming.
3. Mute Chrome.
4. Set Spotify volume to 20%.
5. Open stream notes.
6. Ask for confirmation.
7. Start stream.

The user can edit the steps, confirm execution, and save the workflow as a tile.

That is meaningfully stronger than a prompt catalog because KDeck becomes the user's automation memory.

---

## Weak Version

The weak feature is:

> Speech -> AI -> Execute.

This is dangerous and undifferentiated.

Problems:

- Speech recognition can mishear the user.
- The model can infer the wrong action.
- A command can run in the wrong directory.
- A workflow can affect the wrong app.
- The user may not understand what context was used.
- Destructive actions can happen too quickly.
- The product gets compared to Siri, Copilot, and Google Assistant.

This version would be expensive to build, hard to trust, and easy to criticize.

---

## Recommended Lifecycle

Voice-triggered execution should use this lifecycle:

```text
Speech
-> Transcript
-> Intent parse
-> Draft workflow plan
-> Context and permission preview
-> User edit
-> Risk-based confirmation
-> Execution
-> Result history
-> Save as reusable tile or workflow
```

The user should always see what KDeck heard, what it understood, and what it is about to do.

---

## Business Strength Assessment

### As a generic assistant

**Score:** 12/40

This is a poor business direction. The product would compete against platform assistants with deeper OS access, wake words, ecosystem integrations, and massive AI budgets.

### As a voice workflow composer

**Score:** 32/40

This is a strong business direction. It reinforces KDeck's identity as a premium control surface and creates switching costs through saved workflows, context permissions, connected tools, run history, and personal routines.

---

## What This Adds to the Business

### 1. Faster workflow creation

Manually building workflows is powerful but tedious. Voice can make workflow creation feel instant while still keeping the user in control.

This lowers the barrier to using advanced automation.

### 2. Stronger premium differentiation

Most control surface tools let users configure buttons. Fewer tools can listen to an instruction, convert it into a workflow, preview it, confirm it, and save it as a reusable tile.

This makes KDeck feel like a professional automation layer, not a customizable button grid.

### 3. Better pack monetization

Voice can make Work Packs more valuable:

- "Create a recording prep workflow."
- "Make a daily standup workflow."
- "Build a project review workflow."
- "Create a writing focus mode."

The pack supplies the domain vocabulary, available actions, safety rules, templates, and workflow examples. The user's voice customizes the pack into personal automation.

### 4. Higher switching cost

The valuable asset becomes the user's library of saved workflows and run history. Once users build routines around KDeck, replacing it becomes harder.

### 5. Better onboarding into complex features

Instead of teaching users every workflow builder control up front, KDeck can draft a first workflow from natural language, then let users edit it visually.

---

## Core Critique

### 1. Voice is not the moat

Speech-to-text engines are commodities. The product should not sell "voice input" as the differentiator.

The differentiator is the safe translation from speech into local executable workflows.

### 2. General assistant expectations are dangerous

If users think this is "KDeck Siri", they will expect broad knowledge, web search, calendar access, messages, email, OS settings, reminders, wake word support, and cross-device continuity.

KDeck should set a narrower expectation:

- Compose workflows.
- Trigger saved workflows.
- Configure deck actions.
- Explain available actions.
- Ask for missing parameters.
- Preview and confirm local execution.

### 3. Voice plus execution magnifies risk

A misheard phrase is harmless in a note-taking app. It is not harmless when it becomes a shell command, file operation, OBS control, Git action, or automation sequence.

The feature must use risk levels:

- Safe read.
- Clipboard write.
- App launch.
- Local setting change.
- External side effect.
- File write.
- Shell command.
- Destructive command.

Higher-risk actions require stronger confirmation.

### 4. The assistant must ask clarifying questions

Natural language will often be incomplete:

- "Open my notes" - which app or file?
- "Switch to gaming scene" - which OBS profile?
- "Push my changes" - which branch and remote?
- "Make this ready for recording" - what does ready mean?

The assistant should not guess silently. It should draft what it can and ask for missing details.

### 5. Context permissions become more important

Voice commands often imply context:

- "This project."
- "My current branch."
- "The app I am using."
- "My recording setup."
- "The last result."

The context system needs explicit consent and provenance before voice automation becomes safe.

### 6. Always-listening is not the first version

Always-listening wake word support adds privacy concerns, battery cost, platform complexity, false activations, and user trust issues.

Phase 1 should be push-to-talk only.

---

## Recommended Product Shape

### Name

Use one of:

- Voice Workflow Composer.
- Speak a Workflow.
- Voice Draft.
- KDeck Command Draft.

Avoid:

- Assistant.
- Copilot.
- Siri-like.
- Voice AI.

The name should communicate that the output is a workflow draft, not autonomous magic.

### Primary surfaces

1. Mobile mic button in the Work Packs or Workflow screen.
2. Desktop push-to-talk shortcut.
3. Optional tile action: "Voice Command".

### Primary outputs

1. Draft workflow.
2. Draft tile.
3. Run existing workflow.
4. Ask clarification.
5. Show unsupported request.

### First-use promise

> Tell KDeck the workflow you want. Review the plan before anything runs.

---

## Safety Model

Voice requests should never execute high-risk actions directly.

### Safe by default

Allowed after preview or lightweight confirmation:

- Draft a workflow.
- Search available actions.
- Open a local app.
- Copy generated text.
- Show project summary.
- Show command output.

### Confirmation required

Always require confirmation for:

- Shell commands.
- Git push, pull, stash, reset, clean, checkout.
- File writes.
- OBS stream start/stop.
- External API actions.
- Sending messages.
- Deleting or overwriting anything.

### Strong confirmation required

Use stronger confirmation for destructive actions:

- Show exact command.
- Show working directory.
- Show affected files or target account.
- Require an explicit confirm tap.

---

## Recommended Modules

### Module 1: Speech Capture and Transcription

**Purpose:** Convert user speech into text reliably.

**Recommended direction:**

- Start with push-to-talk.
- Show live or completed transcript.
- Let the user edit transcript before interpretation.
- Support mobile microphone first; desktop shortcut later.

**Tasks to consider:**

- Add mobile push-to-talk capture.
- Add transcription provider abstraction.
- Add transcript correction UI.
- Add privacy disclosure for microphone use.
- Add local fallback decision if offline speech-to-text is desired later.

**Decision needed:** Should transcription run on-device, cloud, or provider-configurable?

### Module 2: Intent Parser

**Purpose:** Convert transcript into structured intent.

**Recommended direction:**

The AI model should output a structured draft, not freeform instructions.

Example intent types:

- Create workflow.
- Run workflow.
- Add tile.
- Search pack tools.
- Configure integration.
- Ask for explanation.
- Unsupported request.

**Tasks to consider:**

- Define intent schema.
- Add model validation and repair.
- Add confidence score.
- Add missing-parameter detection.
- Add tests with realistic spoken phrases.

**Decision needed:** Should the model only use known actions, or can it propose new actions for user approval?

### Module 3: Action and Capability Resolver

**Purpose:** Map intent to actual KDeck capabilities.

**Recommended direction:**

The resolver should only produce actions that exist in the user's installed packs, integrations, workflows, and deck capabilities.

**Tasks to consider:**

- Build an action catalog from installed packs and plugins.
- Include app search, OBS tools, media actions, command templates, and user workflows.
- Add fuzzy matching for app names and workflow names.
- Add "cannot resolve" responses with alternatives.

**Decision needed:** Should voice only use installed capabilities, or can it recommend installing missing packs/plugins?

### Module 4: Workflow Draft Builder

**Purpose:** Turn resolved actions into an editable workflow plan.

**Recommended direction:**

Drafts should be explicit, ordered, editable, and non-executing by default.

**Tasks to consider:**

- Add workflow draft type separate from saved workflow.
- Add draft step confidence and warnings.
- Let user reorder, remove, edit, or replace steps.
- Allow saving draft as a workflow tile.
- Support conversion from draft to existing `WORKFLOW` tile.

**Decision needed:** Should draft workflows support AI steps in phase 1?

### Module 5: Preview and Confirmation

**Purpose:** Make execution trustworthy.

**Recommended direction:**

Every generated plan should show:

- Transcript.
- Parsed intent.
- Steps to execute.
- Context to be read.
- Permissions required.
- Risk level.
- Confirmation requirements.

**Tasks to consider:**

- Add preview UI.
- Add risk badges.
- Add confirmation policy.
- Add per-step preview renderers.
- Add "run once" versus "save workflow" choices.

**Decision needed:** Which risk levels require confirmation every time?

### Module 6: Guided Execution Engine

**Purpose:** Execute the approved plan with state, progress, and recovery.

**Recommended direction:**

Voice-generated workflows should execute through the same guided workflow lifecycle recommended for Work Packs.

**Tasks to consider:**

- Add run id.
- Add per-step progress events.
- Add cancellation.
- Add timeout handling.
- Add partial failure handling.
- Add undo or recovery where possible.

**Decision needed:** Should voice-triggered execution be blocked while mobile is disconnected?

### Module 7: Result History and Learning

**Purpose:** Store what happened and improve future workflow drafting.

**Recommended direction:**

Store local-first history:

- Transcript.
- Parsed intent.
- Draft plan.
- User edits.
- Final executed workflow.
- Results and errors.
- Saved workflow link.

Use this history to improve suggestions, not to silently execute future commands.

**Tasks to consider:**

- Add local voice run history.
- Add "save this as tile" from history.
- Add "repeat with changes."
- Add privacy controls and delete history.
- Add analytics only after redaction and consent.

**Decision needed:** Should transcripts be stored by default, or only final workflow plans?

### Module 8: Pack-Aware Voice Templates

**Purpose:** Make voice stronger inside categories like Streamer, Media, Productivity, and Developer.

**Recommended direction:**

Each Work Pack should expose:

- Voice examples.
- Supported vocabulary.
- Common workflow templates.
- Required permissions.
- Risk policies.
- Clarifying questions.

**Tasks to consider:**

- Add voice examples to pack metadata.
- Add pack-specific intent hints.
- Add pack-specific workflow templates.
- Add acceptance phrases for each pack.

**Decision needed:** Should voice launch globally, or only within a selected pack context first?

---

## Recommended Fix Paths

### Path A: Voice composer after foundation

Build context providers, consent, safe command runner, guided workflow previews, and history first. Then add voice as a new input layer.

**Pros:**

- Strongest safety posture.
- Reuses existing planned foundation.
- Avoids building a risky direct execution path.

**Cons:**

- Slower to demo.
- Voice value appears later.

**Recommended when:** Quality and trust matter more than a quick prototype.

### Path B: Prototype voice-to-draft only

Build a limited prototype that converts speech into a draft workflow, but cannot execute it.

**Pros:**

- Fast learning.
- Low safety risk.
- Tests whether users actually want voice workflow creation.

**Cons:**

- May feel incomplete.
- Still needs action resolver and draft UI.

**Recommended when:** You want validation without committing to full execution.

### Path C: Streamer/Media voice vertical

Start with Streamer/Media workflows only:

- Go Live.
- Recording Prep.
- Quiet Desk Mode.
- End Stream Cleanup.

**Pros:**

- Strong fit with existing OBS/media capabilities.
- Less need for project file access.
- Easier to explain and demo.

**Cons:**

- Narrower initial audience.
- Needs robust OBS/media action resolution.

**Recommended when:** You want the first voice feature to feel premium and concrete.

### Path D: General assistant

Build a broad assistant that can answer questions, run commands, manage workflows, and interpret arbitrary user requests.

**Pros:**

- Big vision.
- Easy to describe in marketing.

**Cons:**

- Very high scope.
- Weak differentiation against platform assistants.
- Higher privacy and safety risk.
- Harder to make reliable.

**Recommendation:** Do not choose this path now.

---

## Recommended Sequence

1. Approve voice as a workflow composer, not a general assistant.
2. Build or prototype voice-to-draft with no execution.
3. Connect drafts to the guided workflow preview/confirmation lifecycle.
4. Add push-to-talk mobile capture.
5. Add pack-aware templates for Streamer/Media.
6. Add safe execution only after preview, confirmation, and history exist.
7. Later, add desktop push-to-talk and optional hotkey activation.

---

## Proposed Task Backlog for Approval

### Phase 0: Product decisions

- [ ] Decide whether this is named Voice Workflow Composer, Voice Draft, or another focused name.
- [ ] Decide whether phase 1 is mobile-only push-to-talk.
- [ ] Decide whether voice can execute actions in phase 1 or only draft workflows.
- [ ] Decide whether transcripts are stored.
- [ ] Decide first supported vertical: Streamer/Media, Productivity, or Developer.

### Phase 1: Voice-to-draft prototype

- [ ] Add transcript capture surface.
- [ ] Add transcript review/edit step.
- [ ] Define intent schema.
- [ ] Define workflow draft schema.
- [ ] Add model output validation.
- [ ] Generate editable workflow drafts from spoken commands.
- [ ] Disable execution in this phase.

### Phase 2: Capability resolver

- [ ] Build installed action catalog.
- [ ] Map voice phrases to installed pack/plugin/workflow capabilities.
- [ ] Add missing parameter prompts.
- [ ] Add unsupported request response.
- [ ] Add test phrases for streamer/media workflows.

### Phase 3: Preview and safety

- [ ] Add preview UI for voice-generated plans.
- [ ] Add risk classification.
- [ ] Add confirmation policy.
- [ ] Add permission preview.
- [ ] Add save as workflow tile.

### Phase 4: Guided execution

- [ ] Execute approved voice-generated workflows through guided workflow runner.
- [ ] Add per-step progress.
- [ ] Add cancellation.
- [ ] Add result history.
- [ ] Add repeat/edit from history.

### Phase 5: Pack-aware voice

- [ ] Add voice examples to Work Packs.
- [ ] Add pack-specific vocabulary.
- [ ] Add Streamer/Media workflow templates.
- [ ] Add acceptance scenarios.
- [ ] Add quality checks for voice workflows.

---

## First Vertical Recommendation

Start with Streamer/Media, not Developer/Git.

Reasons:

- It fits KDeck's control surface identity.
- It uses existing OBS and media session capabilities.
- It creates an impressive demo without requiring project-file access.
- It has clear, repeated workflows.
- It avoids the complexity of arbitrary shell/project commands in the first release.

Git and Developer workflows should come after command safety, cwd resolution, project context, and consent are solid.

---

## Non-Goals for the First Version

- No always-listening wake word.
- No general web answers.
- No autonomous command execution.
- No destructive actions without confirmation.
- No arbitrary shell command generation.
- No background microphone capture.
- No promise to control every app on the system.

---

## Open Questions

1. Should phase 1 generate workflow drafts only, or allow low-risk execution?
2. Should transcript storage be disabled by default?
3. Should voice be global, or scoped to the currently selected Work Pack?
4. Should the assistant ask clarifying questions in chat form, or through structured forms?
5. Should desktop push-to-talk be part of v1, or mobile-only first?

---

## Approval Matrix

| Module | Recommendation | Decision |
|---|---|---|
| Speech capture and transcription | Approve push-to-talk only | Pending |
| Intent parser | Approve with strict schema validation | Pending |
| Action and capability resolver | Approve installed-capabilities-only first | Pending |
| Workflow draft builder | Approve before execution | Pending |
| Preview and confirmation | Approve as mandatory | Pending |
| Guided execution engine | Defer until foundation exists | Pending |
| Result history and learning | Approve local-first | Pending |
| Pack-aware voice templates | Approve for Streamer/Media first | Pending |

---

## Bottom Line

This feature is worth pursuing if KDeck avoids the assistant trap.

Do not build "Siri for PC." Build a voice layer that helps users create, preview, confirm, run, and save local workflows.

The business strength is not speech. The business strength is trusted workflow execution from natural language.
