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
