# AI Tool Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 6 hardcoded AI tools with a remote-defined pack library of 47 tools across 7 audience-specific packs, selectable individually from a new AI Tools tab in the mobile app.

**Architecture:** Pack/tool catalog lives in Supabase and is fetched by the agent (`PackRegistryService`) at startup. The agent emits a `PACK_REGISTRY` message on every mobile connect. Users browse packs in a new `AiToolsTab`, select tools individually via the existing `ADD_TILE`/`REMOVE_TILE` mechanism, and the `AI_CLIPBOARD` action gains an optional `toolId` so the agent resolves prompt/outputMode from its in-memory registry cache.

**Tech Stack:** NestJS (agent), React Native / Expo (mobile), Supabase (PostgreSQL + REST), TypeScript, Jest.

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `supabase/migrations/20260520000012_packs.sql` | Create `packs` and `pack_tools` tables with RLS |
| `supabase/seed/packs.sql` | Seed 7 packs + 47 tools with actual prompts |
| `apps/agent/src/packs/pack-registry.service.ts` | Fetch & cache pack catalog; resolve by toolId |
| `apps/agent/tests/pack-registry.service.test.ts` | Unit tests for PackRegistryService |
| `apps/mobile/src/screens/AiToolsTab.tsx` | Pack grid → tool list → toggle UI |
| `apps/mobile/src/screens/OnboardingScreen.tsx` | 2-step first-launch pack selection |

### Modified files
| File | Change |
|------|--------|
| `packages/shared/src/schema.ts` | Add `Pack`, `PackTool`, `PackRegistryMessage`; extend `AI_CLIPBOARD` with optional `toolId`; add to `AgentMessage` union |
| `apps/mobile/src/types/schema.ts` | Same additions (mobile local copy of shared types) |
| `apps/agent/src/app-launch/app-registry.service.ts` | Remove `DEFAULT_AI_TILES` constant and its usage from `getTiles()`; remove `builtin-` guard in `removeTile()` |
| `apps/agent/src/command/command.service.ts` | Inject `PackRegistryService`; resolve `toolId` before calling AI |
| `apps/agent/src/app.module.ts` | Register `PackRegistryService` as provider |
| `apps/agent/src/websocket/ws.gateway.ts` | Inject `PackRegistryService`; call `sendPackRegistry(client)` on connect |
| `apps/agent/tests/command.service.test.ts` | Add `toolId` resolution tests |
| `apps/agent/tests/ws.gateway.test.ts` | Increment initial-message counts (+1 for `PACK_REGISTRY`) |
| `apps/mobile/src/services/websocket.service.ts` | Add `packRegistryCallbacks` and `onPackRegistry()` method |
| `apps/mobile/src/screens/AddTileScreen.tsx` | Add `'ai'` to `Tab` union; render `AiToolsTab`; accept `packRegistry` prop |
| `apps/mobile/src/screens/DeckScreen.tsx` | Store `packRegistry` state; check onboarding flag; show `OnboardingScreen` on first launch |

---

## Task 1: Supabase migration — create packs tables

**Files:**
- Create: `supabase/migrations/20260520000012_packs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260520000012_packs.sql

create table public.packs (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  icon        text not null,
  color       text,
  "order"     int not null default 0
);

create table public.pack_tools (
  id          uuid primary key default gen_random_uuid(),
  pack_id     uuid not null references public.packs(id) on delete cascade,
  label       text not null,
  prompt      text not null,
  output_mode text not null check (output_mode in ('clipboard','autopaste','viewer')),
  source      text not null default 'clipboard'
                check (source in ('clipboard','active_window','shell')),
  icon        text,
  color       text,
  "order"     int not null default 0,
  phase       int not null default 1,
  builtin_id  text
);

-- Public read for catalog (anon key is safe — these are not user data)
alter table public.packs    enable row level security;
alter table public.pack_tools enable row level security;

create policy "packs_public_read"      on public.packs      for select using (true);
create policy "pack_tools_public_read" on public.pack_tools  for select using (true);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260520000012_packs.sql
git commit -m "feat(supabase): add packs and pack_tools tables"
```

---

## Task 2: Supabase seed — 7 packs + 47 tools

**Files:**
- Create: `supabase/seed/packs.sql`

- [ ] **Step 1: Write the seed file**

```sql
-- supabase/seed/packs.sql
-- Run once against your Supabase project: supabase db seed --file supabase/seed/packs.sql

-- ─── Packs ────────────────────────────────────────────────────────────────────
insert into public.packs (slug, name, description, icon, color, "order") values
  ('engineer',    'Engineer',     'For developers, DevOps, and CLI power users',              '⚙️',  '#1B2631', 1),
  ('writer',      'Writer',       'For novelists, bloggers, and copywriters',                 '✍️',  '#2C1654', 2),
  ('gamer',       'Gamer',        'For gamers, streamers, and competitive players',            '🎮',  '#1A237E', 3),
  ('student',     'Student',      'For students, researchers, and learners',                   '🎓',  '#0D3B2E', 4),
  ('designer',    'Designer',     'For UI/UX, visual, and brand designers',                    '🎨',  '#1A3C34', 5),
  ('social',      'Social Media', 'For content creators, community managers, and marketers',   '📣',  '#2D1B69', 6),
  ('productivity','Productivity', 'For anyone managing tasks, email, and meetings',             '✅',  '#1B2631', 7);

-- ─── Engineer tools ───────────────────────────────────────────────────────────
with pack as (select id from public.packs where slug = 'engineer')
insert into public.pack_tools (pack_id, label, prompt, output_mode, icon, color, "order", phase, builtin_id) values
  ((select id from pack), 'Explain Error',
   'Explain this error clearly and concisely. What is the root cause and how do I fix it?',
   'viewer', 'ai', '#2D1B69', 1, 1, 'builtin-ai-explain'),

  ((select id from pack), 'Write Tests',
   'Write comprehensive unit tests for this code. Use the same language and testing framework visible in the code.',
   'viewer', 'ai', '#1B2631', 2, 1, 'builtin-ai-tests'),

  ((select id from pack), 'Review Code',
   'Review this code. Identify bugs, security issues, performance problems, and style violations. Be specific and actionable.',
   'viewer', 'ai', '#1B2631', 3, 1, null),

  ((select id from pack), 'Write Docstring',
   'Write a JSDoc or docstring for this function. Include param descriptions, return type, and a one-line summary. Return only the docstring.',
   'autopaste', 'ai', '#1B2631', 4, 1, null),

  ((select id from pack), 'Convert to TypeScript',
   'Convert this JavaScript to TypeScript. Add proper type annotations for all variables, parameters, and return types. Return only the converted code.',
   'viewer', 'ai', '#1B2631', 5, 1, null),

  ((select id from pack), 'Explain Regex',
   'Explain what this regular expression does in plain English. Break down each part of the pattern.',
   'autopaste', 'ai', '#1B2631', 6, 1, null),

  ((select id from pack), 'Generate Commit Msg',
   'Generate a conventional commit message for this git diff. Format: type(scope): description. Types: feat, fix, refactor, docs, test, chore.',
   'clipboard', 'ai', '#1B2631', 7, 2, null);

-- ─── Writer tools ─────────────────────────────────────────────────────────────
with pack as (select id from public.packs where slug = 'writer')
insert into public.pack_tools (pack_id, label, prompt, output_mode, icon, color, "order", phase, builtin_id) values
  ((select id from pack), 'Fix Grammar',
   'Fix all grammar and spelling errors. Return only the corrected text, no commentary.',
   'autopaste', 'ai', '#0D3B2E', 1, 1, 'builtin-ai-grammar'),

  ((select id from pack), 'Make Shorter',
   'Rewrite this to be shorter and more concise. Cut filler. Keep the core message intact.',
   'autopaste', 'ai', '#2C1654', 2, 1, 'builtin-ai-shorten'),

  ((select id from pack), 'Continue Story',
   'Continue this story naturally. Match the tone, style, and pacing of what came before. Write 2–3 paragraphs.',
   'viewer', 'ai', '#2C1654', 3, 1, null),

  ((select id from pack), 'Rewrite Tone',
   'Rewrite this text in three versions: Formal, Casual, and Dramatic. Label each clearly.',
   'viewer', 'ai', '#2C1654', 4, 1, null),

  ((select id from pack), 'Brainstorm Plot',
   'Generate 5 distinct plot direction ideas based on this story premise or excerpt. Each idea should be 2–3 sentences.',
   'viewer', 'ai', '#2C1654', 5, 1, null),

  ((select id from pack), 'Add Dialogue',
   'Add natural, purposeful dialogue to this scene. Keep character voices distinct.',
   'viewer', 'ai', '#2C1654', 6, 1, null),

  ((select id from pack), 'Punch It Up',
   'Rewrite this to be more vivid, energetic, and engaging. Use stronger verbs and more specific details. Return the rewritten text only.',
   'autopaste', 'ai', '#2C1654', 7, 1, null);

-- ─── Gamer tools ──────────────────────────────────────────────────────────────
with pack as (select id from public.packs where slug = 'gamer')
insert into public.pack_tools (pack_id, label, prompt, output_mode, icon, color, "order", phase, builtin_id) values
  ((select id from pack), 'Explain Mechanic',
   'Explain this game mechanic, ability, or item in plain English. What does it do and when should you use it?',
   'viewer', 'ai', '#1A237E', 1, 1, null),

  ((select id from pack), 'Build Optimizer',
   'Analyze this game build and suggest specific improvements. What should change and why?',
   'viewer', 'ai', '#1A237E', 2, 1, null),

  ((select id from pack), 'Lore Summary',
   'Summarize the key lore points from this game text. Keep it concise.',
   'viewer', 'ai', '#1A237E', 3, 1, null),

  ((select id from pack), 'Callout Phrases',
   'Generate 5 clear, concise team callout phrases for this in-game situation. Keep them short and copy-ready.',
   'clipboard', 'ai', '#1A237E', 4, 1, null),

  ((select id from pack), 'Counter Strategy',
   'What counters this strategy, champion, or loadout? Give 3 specific counter-picks or tactical approaches.',
   'viewer', 'ai', '#1A237E', 5, 1, null),

  ((select id from pack), 'Quest Helper',
   'Give walkthrough hints for this quest without major spoilers. Just enough to unblock progress.',
   'viewer', 'ai', '#1A237E', 6, 1, null),

  ((select id from pack), 'Active Game Tip',
   'Give me a quick tactical tip for improving my current gameplay session.',
   'viewer', 'ai', '#1A237E', 7, 2, null);

-- ─── Student tools ────────────────────────────────────────────────────────────
with pack as (select id from public.packs where slug = 'student')
insert into public.pack_tools (pack_id, label, prompt, output_mode, icon, color, "order", phase, builtin_id) values
  ((select id from pack), 'Translate ES',
   'Translate this text to Spanish. Return only the translation.',
   'clipboard', 'ai', '#1A3C34', 1, 1, 'builtin-ai-translate'),

  ((select id from pack), 'ELI5',
   'Explain this concept as if I am a curious 12-year-old. Use simple analogies and avoid jargon.',
   'viewer', 'ai', '#0D3B2E', 2, 1, null),

  ((select id from pack), 'Summarize Notes',
   'Summarize these notes into clear bullet points. Group related ideas. Keep it concise.',
   'autopaste', 'ai', '#0D3B2E', 3, 1, null),

  ((select id from pack), 'Make Flashcards',
   'Create 5–10 Q&A flashcard pairs from this content. Format each as: Q: [question] / A: [answer]',
   'viewer', 'ai', '#0D3B2E', 4, 1, null),

  ((select id from pack), 'Check My Answer',
   'Review my answer. Is it correct? What is missing or wrong? Give specific, constructive feedback.',
   'viewer', 'ai', '#0D3B2E', 5, 1, null),

  ((select id from pack), 'Write Citation',
   'Generate both an APA and MLA citation for this source information.',
   'clipboard', 'ai', '#0D3B2E', 6, 1, null),

  ((select id from pack), 'Study Plan',
   'Create a 7-day study plan for this topic. Break it into daily learning goals with specific activities.',
   'viewer', 'ai', '#0D3B2E', 7, 1, null);

-- ─── Designer tools ───────────────────────────────────────────────────────────
with pack as (select id from public.packs where slug = 'designer')
insert into public.pack_tools (pack_id, label, prompt, output_mode, icon, color, "order", phase, builtin_id) values
  ((select id from pack), 'Write Microcopy',
   'Write 3 options for microcopy for this UI element (button label, placeholder, tooltip, or error message). Keep each under 5 words.',
   'viewer', 'ai', '#1A3C34', 1, 1, null),

  ((select id from pack), 'Naming Ideas',
   'Generate 10 name ideas for this component, feature, or product concept. Mix descriptive and creative options.',
   'viewer', 'ai', '#1A3C34', 2, 1, null),

  ((select id from pack), 'Color Palette',
   'Generate a 5-color palette for this brand or mood description. Return hex codes with names and usage notes.',
   'viewer', 'ai', '#1A3C34', 3, 1, null),

  ((select id from pack), 'Design Critique',
   'Critique this design description or spec. What works well? What are the UX risks? What is missing?',
   'viewer', 'ai', '#1A3C34', 4, 1, null),

  ((select id from pack), 'Accessibility Check',
   'Review this component or copy for accessibility issues. Flag WCAG violations and suggest specific fixes.',
   'viewer', 'ai', '#1A3C34', 5, 1, null),

  ((select id from pack), 'Simplify UX Copy',
   'Rewrite this UI text to be clearer and more user-friendly. Use plain language and active voice. Return the rewritten text only.',
   'autopaste', 'ai', '#1A3C34', 6, 1, null);

-- ─── Social Media tools ───────────────────────────────────────────────────────
with pack as (select id from public.packs where slug = 'social')
insert into public.pack_tools (pack_id, label, prompt, output_mode, icon, color, "order", phase, builtin_id) values
  ((select id from pack), 'Write Tweet',
   'Write a compelling tweet based on this content. Max 280 characters. No hashtags unless relevant.',
   'clipboard', 'ai', '#2D1B69', 1, 1, 'builtin-ai-tweet'),

  ((select id from pack), 'Write Caption',
   'Write an engaging Instagram or TikTok caption for this content. Include a call to action.',
   'clipboard', 'ai', '#2D1B69', 2, 1, null),

  ((select id from pack), 'Generate Hashtags',
   'Generate 15 relevant hashtags for this post. Mix popular and niche. Return as a space-separated hashtag list.',
   'clipboard', 'ai', '#2D1B69', 3, 1, null),

  ((select id from pack), 'LinkedIn Rephrase',
   'Rewrite this for LinkedIn. Professional tone, value-forward, ends with a clear takeaway. Return the rewritten text only.',
   'autopaste', 'ai', '#2D1B69', 4, 1, null),

  ((select id from pack), 'A/B Headlines',
   'Write 3 headline variations for this content. Each should take a different angle or emotional tone.',
   'viewer', 'ai', '#2D1B69', 5, 1, null),

  ((select id from pack), 'Thread Expander',
   'Expand this idea into a Twitter/X thread of 5–7 tweets. Each tweet should be punchy and standalone. Number them.',
   'viewer', 'ai', '#2D1B69', 6, 1, null),

  ((select id from pack), 'Hook Generator',
   'Write 5 opening hook sentences for this topic. Each should be surprising, bold, or counter-intuitive.',
   'clipboard', 'ai', '#2D1B69', 7, 1, null);

-- ─── Productivity tools ───────────────────────────────────────────────────────
with pack as (select id from public.packs where slug = 'productivity')
insert into public.pack_tools (pack_id, label, prompt, output_mode, icon, color, "order", phase, builtin_id) values
  ((select id from pack), 'TL;DR',
   'Summarize this in 3 sentences or less. Cut to what matters most. Return the summary only.',
   'autopaste', 'ai', '#1B2631', 1, 1, null),

  ((select id from pack), 'Write Email',
   'Draft a professional email based on this context. Include a clear subject line suggestion, concise body, and polite close.',
   'viewer', 'ai', '#1B2631', 2, 1, null),

  ((select id from pack), 'Action Items',
   'Extract all action items from these meeting notes. Format each as: - [ ] [action] → [owner] by [date if mentioned]',
   'viewer', 'ai', '#1B2631', 3, 1, null),

  ((select id from pack), 'Prioritize',
   'Prioritize this task list by impact and urgency. Group into four buckets: Do Now, Schedule, Delegate, Drop.',
   'viewer', 'ai', '#1B2631', 4, 1, null),

  ((select id from pack), 'Rewrite Clearly',
   'Rewrite this to remove ambiguity. Every sentence should have exactly one clear meaning. Return the rewritten text only.',
   'autopaste', 'ai', '#1B2631', 5, 1, null),

  ((select id from pack), 'Reply Draft',
   'Draft a professional reply to this email or message. Match the formality level of the original.',
   'viewer', 'ai', '#1B2631', 6, 1, null);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/seed/packs.sql
git commit -m "feat(supabase): seed 7 packs and 47 AI tools"
```

---

## Task 3: Shared schema types

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Modify: `apps/mobile/src/types/schema.ts`

- [ ] **Step 1: Add Pack/PackTool types and PackRegistryMessage to `packages/shared/src/schema.ts`**

Add after line 14 (after the `ButtonAction` type):

```typescript
// Pack catalog types (Agent → Mobile via PACK_REGISTRY)
export interface PackTool {
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

export interface Pack {
  id: string;
  slug: string;
  name: string;
  description?: string;
  icon: string;
  color?: string;
  order: number;
  tools: PackTool[];
}

export interface PackRegistryMessage {
  type: 'PACK_REGISTRY';
  packs: Pack[];
}
```

Change the `AI_CLIPBOARD` variant in `ButtonAction` (line 9) to add the optional `toolId`:

```typescript
export type ButtonAction =
  | { kind: 'AI_CLIPBOARD'; prompt: string; outputMode: 'clipboard' | 'autopaste' | 'viewer'; toolId?: string }
  | { kind: 'KEYSTROKE'; keys: string[] }
  | { kind: 'APP_LAUNCH'; appId: string }
  | { kind: 'URL_OPEN'; url: string }
  | { kind: 'CLIPBOARD_WRITE'; text: string }
  | { kind: 'EXEC'; exePath: string };
```

Add `PackRegistryMessage` to the `AgentMessage` union (line 166):

```typescript
export type AgentMessage =
  | ActionResultMessage
  | ConnectedMessage
  | DeckConfigMessage
  | SearchAppsResultMessage
  | ValidatePathResultMessage
  | LicenseStatusMessage
  | AiQuotaExceededMessage
  | ContextShortcutsMessage
  | ContextProfilesMessage
  | PackRegistryMessage;
```

- [ ] **Step 2: Apply the same changes to `apps/mobile/src/types/schema.ts`**

The mobile file is a local copy with extra mouse message types. Apply the identical three edits:
1. Add `PackTool`, `Pack`, `PackRegistryMessage` interfaces after the `ButtonAction` type
2. Add `toolId?: string` to the `AI_CLIPBOARD` variant
3. Add `PackRegistryMessage` to `AgentMessage` union (which is not in this file — add it, or add the import)

Actually this file does not export `AgentMessage` — check the file and add `PackRegistryMessage` to the `type` union that `websocket.service.ts` uses. In `websocket.service.ts`, the line is:
```typescript
const msg: AgentMessage = JSON.parse(event.data as string);
```
where `AgentMessage` is imported from `'../types/schema'`. So add `PackRegistryMessage` to the `AgentMessage` union in `apps/mobile/src/types/schema.ts` (if it exists) or create it to include `PackRegistryMessage`.

Check the bottom of `apps/mobile/src/types/schema.ts` — if there is already an `AgentMessage` union, add `| PackRegistryMessage` to it.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schema.ts apps/mobile/src/types/schema.ts
git commit -m "feat(schema): add Pack, PackTool, PackRegistryMessage types; extend AI_CLIPBOARD with toolId"
```

---

## Task 4: PackRegistryService

**Files:**
- Create: `apps/agent/src/packs/pack-registry.service.ts`
- Create: `apps/agent/tests/pack-registry.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/agent/tests/pack-registry.service.test.ts
import { Test } from '@nestjs/testing';
import { PackRegistryService } from '../src/packs/pack-registry.service';

const mockTool = {
  id: 'tool-uuid-1',
  pack_id: 'pack-uuid-1',
  label: 'Explain Error',
  prompt: 'Explain this error.',
  output_mode: 'viewer',
  source: 'clipboard',
  icon: 'ai',
  color: '#2D1B69',
  order: 1,
  phase: 1,
  builtin_id: 'builtin-ai-explain',
};

const mockPack = {
  id: 'pack-uuid-1',
  slug: 'engineer',
  name: 'Engineer',
  description: 'For developers',
  icon: '⚙️',
  color: '#1B2631',
  order: 1,
  pack_tools: [mockTool],
};

const mockPhase2Tool = {
  id: 'tool-uuid-2',
  pack_id: 'pack-uuid-1',
  label: 'Generate Commit Msg',
  prompt: 'Generate a commit message.',
  output_mode: 'clipboard',
  source: 'clipboard',
  icon: 'ai',
  color: null,
  order: 7,
  phase: 2,
  builtin_id: null,
};

let mockSupabaseData: typeof mockPack[] = [mockPack];
let mockSupabaseError: object | null = null;

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        lte: jest.fn().mockResolvedValue({ data: mockSupabaseData, error: mockSupabaseError }),
      })),
    })),
  })),
}));

describe('PackRegistryService', () => {
  let service: PackRegistryService;

  beforeEach(async () => {
    mockSupabaseData = [mockPack];
    mockSupabaseError = null;
    const moduleRef = await Test.createTestingModule({
      providers: [PackRegistryService],
    }).compile();
    service = moduleRef.get(PackRegistryService);
  });

  it('loads packs from Supabase on load()', async () => {
    await service.load();
    const packs = service.getPacks();
    expect(packs).toHaveLength(1);
    expect(packs[0].slug).toBe('engineer');
    expect(packs[0].tools).toHaveLength(1);
    expect(packs[0].tools[0].label).toBe('Explain Error');
  });

  it('getById returns the correct tool after load()', async () => {
    await service.load();
    const tool = service.getById('tool-uuid-1');
    expect(tool).toBeDefined();
    expect(tool!.prompt).toBe('Explain this error.');
    expect(tool!.outputMode).toBe('viewer');
  });

  it('getById returns undefined for unknown toolId', async () => {
    await service.load();
    expect(service.getById('not-a-real-id')).toBeUndefined();
  });

  it('filters out phase-2 tools (agentCapability = 1)', async () => {
    mockSupabaseData = [{ ...mockPack, pack_tools: [mockTool, mockPhase2Tool] }];
    await service.load();
    const packs = service.getPacks();
    expect(packs[0].tools).toHaveLength(1);
    expect(packs[0].tools[0].label).toBe('Explain Error');
  });

  it('getPacks returns empty array before load()', () => {
    expect(service.getPacks()).toEqual([]);
  });

  it('does not throw if Supabase returns an error — logs and returns empty', async () => {
    mockSupabaseError = { message: 'network error' };
    mockSupabaseData = [];
    await expect(service.load()).resolves.not.toThrow();
    expect(service.getPacks()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/agent && npx jest tests/pack-registry.service.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../src/packs/pack-registry.service'`

- [ ] **Step 3: Write the implementation**

```typescript
// apps/agent/src/packs/pack-registry.service.ts
import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pack, PackTool } from '@control-surface/shared';

const AGENT_CAPABILITY = 1;

interface RawTool {
  id: string;
  pack_id: string;
  label: string;
  prompt: string;
  output_mode: 'clipboard' | 'autopaste' | 'viewer';
  source: 'clipboard' | 'active_window' | 'shell';
  icon: string;
  color: string | null;
  order: number;
  phase: number;
  builtin_id: string | null;
}

interface RawPack {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  color: string | null;
  order: number;
  pack_tools: RawTool[];
}

@Injectable()
export class PackRegistryService {
  private readonly supabase: SupabaseClient;
  private packs: Pack[] = [];
  private toolsById = new Map<string, PackTool>();

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL ?? '',
      process.env.SUPABASE_ANON_KEY ?? '',
    );
  }

  async load(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('packs')
        .select('*, pack_tools(*)')
        .lte('pack_tools.phase', AGENT_CAPABILITY);

      if (error || !data) {
        console.warn('[PackRegistry] Failed to load packs:', error?.message);
        return;
      }

      this.toolsById.clear();
      this.packs = (data as RawPack[]).map((raw) => {
        const tools: PackTool[] = (raw.pack_tools ?? [])
          .filter((t) => t.phase <= AGENT_CAPABILITY)
          .sort((a, b) => a.order - b.order)
          .map((t) => ({
            id: t.id,
            packId: t.pack_id,
            label: t.label,
            prompt: t.prompt,
            outputMode: t.output_mode,
            source: t.source,
            icon: t.icon,
            color: t.color ?? undefined,
            order: t.order,
            phase: t.phase,
            builtinId: t.builtin_id ?? undefined,
          }));

        tools.forEach((tool) => this.toolsById.set(tool.id, tool));

        return {
          id: raw.id,
          slug: raw.slug,
          name: raw.name,
          description: raw.description ?? undefined,
          icon: raw.icon,
          color: raw.color ?? undefined,
          order: raw.order,
          tools,
        };
      });

      this.packs.sort((a, b) => a.order - b.order);
      console.log(`[PackRegistry] Loaded ${this.packs.length} packs, ${this.toolsById.size} tools`);
    } catch (err) {
      console.warn('[PackRegistry] Unexpected error during load:', err);
    }
  }

  getPacks(): Pack[] {
    return this.packs;
  }

  getById(toolId: string): PackTool | undefined {
    return this.toolsById.get(toolId);
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/agent && npx jest tests/pack-registry.service.test.ts --no-coverage
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/packs/pack-registry.service.ts apps/agent/tests/pack-registry.service.test.ts
git commit -m "feat(agent): add PackRegistryService with Supabase catalog fetch and in-memory cache"
```

---

## Task 5: Register PackRegistryService in AppModule

**Files:**
- Modify: `apps/agent/src/app.module.ts`

- [ ] **Step 1: Add `PackRegistryService` to the module**

```typescript
// apps/agent/src/app.module.ts
import { Module } from '@nestjs/common';
import { WsGateway } from './websocket/ws.gateway';
import { ClipboardService } from './clipboard/clipboard.service';
import { AiRouterService } from './ai/ai-router.service';
import { CommandService } from './command/command.service';
import { AppLaunchService } from './app-launch/app-launch.service';
import { AppRegistryService } from './app-launch/app-registry.service';
import { KeystrokeService } from './keystroke/keystroke.service';
import { AppSearchService } from './app-search/app-search.service';
import { LicenseModule } from './license/license.module';
import { NetworkModule } from './network/network.module';
import { ContextModule } from './context-profile/context.module';
import { PackRegistryService } from './packs/pack-registry.service';

@Module({
  imports: [LicenseModule, NetworkModule, ContextModule],
  providers: [
    WsGateway,
    ClipboardService,
    AiRouterService,
    CommandService,
    AppLaunchService,
    AppRegistryService,
    KeystrokeService,
    AppSearchService,
    PackRegistryService,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent/src/app.module.ts
git commit -m "feat(agent): register PackRegistryService in AppModule"
```

---

## Task 6: CommandService — resolve toolId

**Files:**
- Modify: `apps/agent/src/command/command.service.ts`
- Modify: `apps/agent/tests/command.service.test.ts`

- [ ] **Step 1: Add failing tests for toolId resolution**

Add to `apps/agent/tests/command.service.test.ts` — append inside the `describe('CommandService', ...)` block:

```typescript
  // -- toolId resolution tests --

  let mockPackRegistry: { getById: jest.Mock };

  // Re-build the module with PackRegistryService mock for these tests
  // Also rebinds clipboardService so writes reach the new CommandService instance
  async function buildModuleWithRegistry(tool: object | undefined) {
    mockPackRegistry = { getById: jest.fn().mockReturnValue(tool) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CommandService,
        ClipboardService,
        { provide: AiRouterService,     useValue: mockAiRouter },
        { provide: AppLaunchService,    useValue: mockAppLaunch },
        { provide: KeystrokeService,    useValue: mockKeystroke },
        { provide: LicenseService,      useValue: mockLicenseService },
        { provide: PackRegistryService, useValue: mockPackRegistry },
      ],
    }).compile();
    clipboardService = moduleRef.get(ClipboardService); // rebind to this module's instance
    return moduleRef.get(CommandService);
  }

  it('resolves prompt and outputMode from registry when toolId is present', async () => {
    const registryTool = { prompt: 'Registry prompt', outputMode: 'viewer' };
    const svc = await buildModuleWithRegistry(registryTool);
    await clipboardService.write('some text');
    const result = await svc.execute({
      kind: 'AI_CLIPBOARD',
      prompt: '',
      outputMode: 'clipboard',
      toolId: 'tool-uuid-1',
    });
    expect(result.success).toBe(true);
    expect(mockAiRouter.call).toHaveBeenCalledWith('Registry prompt', 'some text');
    expect(result.output).toBe('AI result text');
  });

  it('falls back to inline prompt when toolId is absent', async () => {
    const svc = await buildModuleWithRegistry(undefined);
    await clipboardService.write('some text');
    await svc.execute({
      kind: 'AI_CLIPBOARD',
      prompt: 'Inline prompt',
      outputMode: 'clipboard',
    });
    expect(mockAiRouter.call).toHaveBeenCalledWith('Inline prompt', 'some text');
  });
```

- [ ] **Step 2: Run test — verify new tests fail**

```bash
cd apps/agent && npx jest tests/command.service.test.ts --no-coverage
```

Expected: FAIL — new tests fail because `PackRegistryService` is not injected yet.

- [ ] **Step 3: Update `CommandService` to inject `PackRegistryService` and resolve `toolId`**

```typescript
// apps/agent/src/command/command.service.ts
import { Injectable } from '@nestjs/common';
import { ButtonAction } from '@control-surface/shared';
import { shell } from 'electron';
import { ClipboardService } from '../clipboard/clipboard.service';
import { AiRouterService, AiQuotaError } from '../ai/ai-router.service';
import { AppLaunchService } from '../app-launch/app-launch.service';
import { KeystrokeService } from '../keystroke/keystroke.service';
import { LicenseService } from '../license/license.service';
import { PackRegistryService } from '../packs/pack-registry.service';

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
  ) {}

  async execute(action: ButtonAction): Promise<CommandResult> {
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

          if (action.toolId) {
            const tool = this.packRegistry.getById(action.toolId);
            if (tool) {
              prompt = tool.prompt;
              outputMode = tool.outputMode;
            }
          }

          const context = await this.clipboard.read();
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

Also update the existing test's module setup to include a mock `PackRegistryService` (the tests that existed before need it to compile). At the top of `describe('CommandService', ...)`, update the `beforeEach` to add:

```typescript
    mockPackRegistry = { getById: jest.fn().mockReturnValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommandService,
        ClipboardService,
        { provide: AiRouterService,       useValue: mockAiRouter },
        { provide: AppLaunchService,      useValue: mockAppLaunch },
        { provide: KeystrokeService,      useValue: mockKeystroke },
        { provide: LicenseService,        useValue: mockLicenseService },
        { provide: PackRegistryService,   useValue: mockPackRegistry },
      ],
    }).compile();
```

And declare `mockPackRegistry` at the top of the describe block:
```typescript
  let mockPackRegistry: { getById: jest.Mock };
```

- [ ] **Step 4: Run test — verify all pass**

```bash
cd apps/agent && npx jest tests/command.service.test.ts --no-coverage
```

Expected: PASS (all existing tests + 2 new)

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/command/command.service.ts apps/agent/tests/command.service.test.ts
git commit -m "feat(agent): resolve toolId from PackRegistryService in CommandService"
```

---

## Task 7: WsGateway — emit PACK_REGISTRY on connect

**Files:**
- Modify: `apps/agent/src/websocket/ws.gateway.ts`
- Modify: `apps/agent/tests/ws.gateway.test.ts`

- [ ] **Step 1: Update `ws.gateway.test.ts` — add PACK_REGISTRY to initial message counts**

The connection now sends 5 messages: `CONNECTED`, `DECK_CONFIG`, `LICENSE_STATUS`, `CONTEXT_SHORTCUTS`, `PACK_REGISTRY`.

In `ws.gateway.test.ts`, update every `messages.length === 3` or `messages.length === 4` threshold that represents "all initial messages received":

- The first test (`sends CONNECTED, DECK_CONFIG, then LICENSE_STATUS on connect`) currently waits for 3 messages. Change it to wait for 5 and add assertion for `PACK_REGISTRY`:

```typescript
  it('sends CONNECTED, DECK_CONFIG, LICENSE_STATUS, CONTEXT_SHORTCUTS, PACK_REGISTRY on connect', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());
      if (messages.length === 5) {
        const connected = JSON.parse(messages[0]);
        expect(connected.type).toBe('CONNECTED');

        const deckConfig = JSON.parse(messages[1]);
        expect(deckConfig.type).toBe('DECK_CONFIG');

        const licStatus = JSON.parse(messages[2]);
        expect(licStatus.type).toBe('LICENSE_STATUS');

        // messages[3] is CONTEXT_SHORTCUTS
        const packRegistry = JSON.parse(messages[4]);
        expect(packRegistry.type).toBe('PACK_REGISTRY');
        expect(Array.isArray(packRegistry.packs)).toBe(true);

        ws.close();
        done();
      }
    });
  });
```

- All other tests that use `messages.length === 4` as the "initial messages done" gate — change to `messages.length === 5`.

- [ ] **Step 2: Run gateway tests — verify they fail**

```bash
cd apps/agent && npx jest tests/ws.gateway.test.ts --no-coverage
```

Expected: FAIL — `PACK_REGISTRY` not sent yet, message counts wrong.

- [ ] **Step 3: Update `WsGateway` to load and send `PACK_REGISTRY`**

Three changes to `apps/agent/src/websocket/ws.gateway.ts`:

**Change 1 — add imports** (add to the existing import blocks at the top):
```typescript
import { PackRegistryMessage } from '@control-surface/shared';
import { PackRegistryService } from '../packs/pack-registry.service';
```

**Change 2 — extend constructor** (replace existing constructor with):
```typescript
  constructor(
    private readonly commandService: CommandService,
    private readonly appRegistry: AppRegistryService,
    private readonly appSearch: AppSearchService,
    private readonly licenseService: LicenseService,
    private readonly activationDialog: ActivationDialogService,
    private readonly activeWindow: ActiveWindowService,
    private readonly contextProfile: ContextProfileService,
    private readonly packRegistry: PackRegistryService,
  ) {
    this.activationDialog.onActivated?.(() => this.broadcastLicenseStatus());
    this.activeWindow.on('appChanged', (processName: string | null) => {
      void this.handleAppChanged(processName);
    });
    void this.packRegistry.load();
  }
```

**Change 3 — add private method and call it in `handleConnection`**

Add this method after `sendContextShortcuts`:
```typescript
  private sendPackRegistry(client: WebSocket): void {
    const msg: PackRegistryMessage = { type: 'PACK_REGISTRY', packs: this.packRegistry.getPacks() };
    client.send(JSON.stringify(msg));
  }
```

In `handleConnection`, add one line after `this.sendContextShortcuts(client)`:
```typescript
    this.sendContextShortcuts(client);
    this.sendPackRegistry(client);      // ← add this line
```

- [ ] **Step 4: Run gateway tests — verify they pass**

```bash
cd apps/agent && npx jest tests/ws.gateway.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Run full agent test suite**

```bash
cd apps/agent && npx jest --no-coverage
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/websocket/ws.gateway.ts apps/agent/tests/ws.gateway.test.ts
git commit -m "feat(agent): emit PACK_REGISTRY on connect; load catalog at startup"
```

---

## Task 8: AppRegistryService — remove legacy AI tiles

**Files:**
- Modify: `apps/agent/src/app-launch/app-registry.service.ts`

- [ ] **Step 1: Remove `DEFAULT_AI_TILES` constant and its usage**

Delete lines 26–100 entirely (the `DEFAULT_AI_TILES` constant).

Update `getTiles()` — remove the `DEFAULT_AI_TILES` spread:

```typescript
  getTiles(): TileConfig[] {
    const pinnedTiles = this.config.tiles.filter((tile) => tile.pinned);
    const unpinnedTiles = this.config.tiles.filter((tile) => !tile.pinned);
    return [...pinnedTiles, ...unpinnedTiles];
  }
```

Update `removeTile()` — remove the `builtin-` guard comment (the tiles can now all be removed):

```typescript
  removeTile(tileId: string): void {
    this.config.tiles = this.config.tiles.filter((t) => t.id !== tileId);
    this.persist();
  }
```

- [ ] **Step 2: Run the app-registry tests**

```bash
cd apps/agent && npx jest tests/app-registry.service.test.ts --no-coverage
```

Expected: PASS (removing hardcoded tiles should not break existing tests; if any test asserts presence of `builtin-ai-*` tiles, update it to remove that assertion)

- [ ] **Step 3: Run full agent test suite**

```bash
cd apps/agent && npx jest --no-coverage
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/app-launch/app-registry.service.ts
git commit -m "feat(agent): remove hardcoded DEFAULT_AI_TILES — tools now served from PackRegistryService"
```

---

## Task 9: Mobile WebSocketService — handle PACK_REGISTRY

**Files:**
- Modify: `apps/mobile/src/services/websocket.service.ts`

- [ ] **Step 1: Add the `packRegistry` callback infrastructure**

Add import at the top:
```typescript
import {
  // ... existing imports ...
  PackRegistryMessage,
} from '../types/schema';
```

Add callback type and array:
```typescript
type PackRegistryCallback = (msg: PackRegistryMessage) => void;
```

```typescript
  private packRegistryCallbacks: PackRegistryCallback[] = [];
```

In `ws.onmessage`, add the new case after the `CONTEXT_PROFILES` branch:
```typescript
      } else if (msg.type === 'PACK_REGISTRY') {
        this.packRegistryCallbacks.forEach((cb) => cb(msg));
      }
```

Add the subscription method:
```typescript
  onPackRegistry(cb: PackRegistryCallback): () => void {
    this.packRegistryCallbacks.push(cb);
    return () => {
      this.packRegistryCallbacks = this.packRegistryCallbacks.filter((c) => c !== cb);
    };
  }
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/services/websocket.service.ts
git commit -m "feat(mobile): handle PACK_REGISTRY message in WebSocketService"
```

---

## Task 10: Mobile — AiToolsTab component

**Files:**
- Create: `apps/mobile/src/screens/AiToolsTab.tsx`

- [ ] **Step 1: Write the component**

```typescript
// apps/mobile/src/screens/AiToolsTab.tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Pack, PackTool, TileConfig } from '../types/schema';

interface Props {
  packs: Pack[];
  currentTiles: TileConfig[];
  onAdd: (tile: Omit<TileConfig, 'id'>) => void;
  onRemove: (tileId: string) => void;
}

export function AiToolsTab({ packs, currentTiles, onAdd, onRemove }: Props) {
  const [selectedPackId, setSelectedPackId] = useState<string | null>(
    packs.length > 0 ? packs[0].id : null,
  );

  const selectedTilesByToolId = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const tile of currentTiles) {
      if (tile.action.kind === 'AI_CLIPBOARD' && tile.action.toolId) {
        map.set(tile.action.toolId, tile.id);
      }
    }
    return map;
  }, [currentTiles]);

  const activePack = packs.find((p) => p.id === selectedPackId) ?? null;

  const handleToggle = (tool: PackTool) => {
    const existingId = selectedTilesByToolId.get(tool.id);
    if (existingId) {
      onRemove(existingId);
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

  if (packs.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No AI tools available.</Text>
        <Text style={styles.emptySubtext}>Make sure your agent is connected.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Pack selector row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.packRow}
      >
        {packs.map((pack) => (
          <TouchableOpacity
            key={pack.id}
            style={[styles.packChip, selectedPackId === pack.id && styles.packChipActive]}
            onPress={() => setSelectedPackId(pack.id)}
          >
            <Text style={styles.packChipIcon}>{pack.icon}</Text>
            <Text style={[styles.packChipLabel, selectedPackId === pack.id && styles.packChipLabelActive]}>
              {pack.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tool list */}
      {activePack && (
        <FlatList
          data={activePack.tools}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.toolList}
          renderItem={({ item: tool }) => {
            const selected = selectedTilesByToolId.has(tool.id);
            return (
              <TouchableOpacity
                style={[styles.toolRow, selected && styles.toolRowSelected]}
                onPress={() => handleToggle(tool)}
              >
                <View style={styles.toolInfo}>
                  <Text style={styles.toolLabel}>{tool.label}</Text>
                  <Text style={styles.toolMode}>{tool.outputMode}</Text>
                </View>
                <View style={[styles.checkBox, selected && styles.checkBoxSelected]}>
                  {selected && <Text style={styles.checkMark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: '#FFFFFF', fontSize: 16, marginBottom: 8 },
  emptySubtext: { color: '#6B6B8A', fontSize: 13, textAlign: 'center' },
  packRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  packChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#1A1A2E', borderWidth: 1, borderColor: '#2A2A45',
  },
  packChipActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  packChipIcon: { fontSize: 16 },
  packChipLabel: { color: '#9898B0', fontSize: 13, fontWeight: '500' },
  packChipLabelActive: { color: '#FFFFFF' },
  toolList: { paddingHorizontal: 16, paddingBottom: 24 },
  toolRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: '#1A1A2E', borderRadius: 10, marginBottom: 8,
    borderWidth: 1, borderColor: '#2A2A45',
  },
  toolRowSelected: { borderColor: '#6C63FF', backgroundColor: '#1E1A3A' },
  toolInfo: { flex: 1, gap: 3 },
  toolLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  toolMode: { color: '#6B6B8A', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  checkBox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#3A3A55', alignItems: 'center', justifyContent: 'center',
  },
  checkBoxSelected: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  checkMark: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/AiToolsTab.tsx
git commit -m "feat(mobile): add AiToolsTab with pack browser and tool toggle"
```

---

## Task 11: Mobile — OnboardingScreen

**Files:**
- Create: `apps/mobile/src/screens/OnboardingScreen.tsx`

- [ ] **Step 1: Write the component**

```typescript
// apps/mobile/src/screens/OnboardingScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Pack, PackTool, TileConfig } from '../types/schema';

interface Props {
  packs: Pack[];
  onComplete: (selectedTools: Omit<TileConfig, 'id'>[]) => void;
  onSkip: () => void;
}

export function OnboardingScreen({ packs, onComplete, onSkip }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [chosenPackId, setChosenPackId] = useState<string | null>(null);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());

  const chosenPack = packs.find((p) => p.id === chosenPackId) ?? null;

  const handlePackSelect = (packId: string) => {
    setChosenPackId(packId);
    setDeselected(new Set());
  };

  const handleNext = () => {
    if (chosenPackId) setStep(2);
  };

  const toggleDeselect = (toolId: string) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  const handleStart = () => {
    if (!chosenPack) return;
    const selectedTools: Omit<TileConfig, 'id'>[] = chosenPack.tools
      .filter((t) => !deselected.has(t.id))
      .map((tool: PackTool) => ({
        kind: 'ai' as const,
        label: tool.label,
        iconId: tool.icon ?? 'ai',
        color: tool.color,
        action: {
          kind: 'AI_CLIPBOARD' as const,
          toolId: tool.id,
          prompt: '',
          outputMode: tool.outputMode,
        },
      }));
    onComplete(selectedTools);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      {step === 1 && (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>What best describes you?</Text>
            <Text style={styles.subtitle}>We'll pick your starter AI tools.</Text>
          </View>
          <ScrollView contentContainerStyle={styles.packGrid}>
            {packs.map((pack) => (
              <TouchableOpacity
                key={pack.id}
                style={[styles.packCard, chosenPackId === pack.id && styles.packCardSelected]}
                onPress={() => handlePackSelect(pack.id)}
              >
                <Text style={styles.packCardIcon}>{pack.icon}</Text>
                <Text style={styles.packCardName}>{pack.name}</Text>
                <Text style={styles.packCardDesc} numberOfLines={2}>{pack.description}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.primaryBtn, !chosenPackId && styles.primaryBtnDisabled]}
              onPress={handleNext}
              disabled={!chosenPackId}
            >
              <Text style={styles.primaryBtnText}>Next →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === 2 && chosenPack && (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>{chosenPack.icon} {chosenPack.name} tools</Text>
            <Text style={styles.subtitle}>All selected — deselect any you don't want.</Text>
          </View>
          <ScrollView contentContainerStyle={styles.toolList}>
            {chosenPack.tools.map((tool: PackTool) => {
              const selected = !deselected.has(tool.id);
              return (
                <TouchableOpacity
                  key={tool.id}
                  style={[styles.toolRow, selected && styles.toolRowSelected]}
                  onPress={() => toggleDeselect(tool.id)}
                >
                  <View style={styles.toolInfo}>
                    <Text style={styles.toolLabel}>{tool.label}</Text>
                    <Text style={styles.toolMode}>{tool.outputMode}</Text>
                  </View>
                  <View style={[styles.checkBox, selected && styles.checkBoxSelected]}>
                    {selected && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleStart}>
              <Text style={styles.primaryBtnText}>Start with these tools</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  header: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 20 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subtitle: { color: '#9898B0', fontSize: 14 },
  packGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 16, gap: 12, paddingBottom: 24,
  },
  packCard: {
    width: '46%', backgroundColor: '#1A1A2E',
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2A2A45',
  },
  packCardSelected: { borderColor: '#6C63FF', backgroundColor: '#1E1A3A' },
  packCardIcon: { fontSize: 28, marginBottom: 8 },
  packCardName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  packCardDesc: { color: '#6B6B8A', fontSize: 12, lineHeight: 17 },
  footer: { padding: 24, gap: 12 },
  primaryBtn: {
    backgroundColor: '#6C63FF', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
  },
  primaryBtnDisabled: { backgroundColor: '#2A2A45' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { color: '#6B6B8A', fontSize: 14 },
  toolList: { paddingHorizontal: 16, paddingBottom: 24 },
  toolRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: '#1A1A2E', borderRadius: 10, marginBottom: 8,
    borderWidth: 1, borderColor: '#2A2A45',
  },
  toolRowSelected: { borderColor: '#6C63FF', backgroundColor: '#1E1A3A' },
  toolInfo: { flex: 1, gap: 3 },
  toolLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  toolMode: { color: '#6B6B8A', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  checkBox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#3A3A55', alignItems: 'center', justifyContent: 'center',
  },
  checkBoxSelected: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  checkMark: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/OnboardingScreen.tsx
git commit -m "feat(mobile): add OnboardingScreen two-step pack selection"
```

---

## Task 12: Mobile — AddTileScreen AI Tools tab

**Files:**
- Modify: `apps/mobile/src/screens/AddTileScreen.tsx`

- [ ] **Step 1: Add the `'ai'` tab and `packRegistry` prop**

Change the `Tab` type (line 47):
```typescript
type Tab = 'apps' | 'shortcut' | 'ai' | 'games';
```

Add `packRegistry` to the `Props` interface:
```typescript
interface Props {
  currentTiles: TileConfig[];
  onAdd: (tile: Omit<TileConfig, 'id'>) => void;
  onRemove: (tileId: string) => void;
  onDismiss: () => void;
  ws: WebSocketService;
  packRegistry: Pack[] | null;
}
```

Add `Pack` to the existing imports from `'../types/schema'`:
```typescript
import { TileConfig, Pack } from '../types/schema';
```

Add `AiToolsTab` import:
```typescript
import { AiToolsTab } from './AiToolsTab';
```

Update the tab bar render (change the hardcoded string array):
```typescript
      <View style={styles.tabBar}>
        {(['apps', 'shortcut', 'ai', 'games'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'apps' ? 'Apps' : tab === 'shortcut' ? 'Shortcut' : tab === 'ai' ? 'AI Tools' : 'Games'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
```

Add the AI Tools tab render (inside `KeyboardAvoidingView`, after `shortcut` branch):
```typescript
        {activeTab === 'ai' && (
          <AiToolsTab
            packs={packRegistry ?? []}
            currentTiles={currentTiles}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        )}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/AddTileScreen.tsx
git commit -m "feat(mobile): add AI Tools tab to AddTileScreen"
```

---

## Task 13: Mobile — DeckScreen onboarding + packs state

**Files:**
- Modify: `apps/mobile/src/screens/DeckScreen.tsx`

- [ ] **Step 1: Add imports**

Add to the existing import blocks in `DeckScreen.tsx` (do not duplicate `TileConfig` — it is already imported):
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pack, PackRegistryMessage } from '../types/schema';
import { OnboardingScreen } from './OnboardingScreen';
```

Check if `@react-native-async-storage/async-storage` is already a dependency in `apps/mobile/package.json`. If not, run:
```bash
cd apps/mobile && npx expo install @react-native-async-storage/async-storage
```

- [ ] **Step 2: Add state and onboarding logic**

Add to the state declarations inside `DeckScreen`:
```typescript
  const [packRegistry, setPackRegistry] = useState<Pack[] | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
```

In the WebSocket effect (Effect 2, where `ws.on*` subscriptions are set up), add:
```typescript
    const unsubscribePackRegistry = ws.onPackRegistry((msg: PackRegistryMessage) => {
      setPackRegistry(msg.packs);
      // Show onboarding if first launch and packs have loaded
      AsyncStorage.getItem('onboarded').then((val) => {
        if (!val && msg.packs.length > 0) setShowOnboarding(true);
      });
    });
```

And add it to the cleanup:
```typescript
    return () => {
      unsubscribeLicense();
      unsubscribeQuota();
      unsubscribeContext();
      unsubscribePackRegistry();   // ← add
      // ...
    };
```

Add the onboarding completion handler:
```typescript
  const handleOnboardingComplete = (selectedTools: Omit<TileConfig, 'id'>[]) => {
    selectedTools.forEach((tile) => wsRef.current?.addTile(tile));
    void AsyncStorage.setItem('onboarded', 'true');
    setShowOnboarding(false);
  };

  const handleOnboardingSkip = () => {
    void AsyncStorage.setItem('onboarded', 'true');
    setShowOnboarding(false);
  };
```

- [ ] **Step 3: Render OnboardingScreen as a modal overlay**

In the JSX, add the `OnboardingScreen` modal just before the closing tag of the root `SafeAreaView`:
```typescript
      <Modal visible={showOnboarding} animationType="slide">
        <OnboardingScreen
          packs={packRegistry ?? []}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      </Modal>
```

Make sure `Modal` is imported from `react-native`.

- [ ] **Step 4: Pass `packRegistry` to `AddTileScreen`**

Find the `Modal` that renders `AddTileScreen` (search for `showAddTile`) and add the `packRegistry` prop:
```typescript
          <AddTileScreen
            currentTiles={tiles ?? []}
            onAdd={handleAddTile}
            onRemove={handleRemoveTile}
            onDismiss={() => setShowAddTile(false)}
            ws={wsService!}
            packRegistry={packRegistry}
          />
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/DeckScreen.tsx
git commit -m "feat(mobile): add packRegistry state, onboarding modal, and pass packs to AddTileScreen"
```

---

## Task 14: Self-review — run full test suite

- [ ] **Step 1: Run agent tests**

```bash
cd apps/agent && npx jest --no-coverage
```

Expected: all pass

- [ ] **Step 2: TypeScript check — agent**

```bash
cd apps/agent && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: TypeScript check — shared package**

```bash
cd packages/shared && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: TypeScript check — mobile**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Final commit**

```bash
git add -p  # stage any remaining cleanup
git commit -m "chore: post-implementation cleanup and type fixes"
```
