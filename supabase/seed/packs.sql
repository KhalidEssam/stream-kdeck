-- supabase/seed/packs.sql
-- Apply migrations first:
--   npx supabase db push
-- Then seed:
--   npx supabase db query --linked -f supabase/seed/packs.sql

begin;

insert into public.packs (slug, name, description, icon, color, "order") values
  ('engineer',     'Engineer',     'For developers, DevOps, and CLI power users',            '⚙️', '#1B2631', 1),
  ('writer',       'Writer',       'For novelists, bloggers, and copywriters',               '✍️', '#2C1654', 2),
  ('gamer',        'Gamer',        'For gamers, streamers, and competitive players',          '🎮', '#1A237E', 3),
  ('student',      'Student',      'For students, researchers, and learners',                 '🎓', '#0D3B2E', 4),
  ('designer',     'Designer',     'For UI/UX, visual, and brand designers',                  '🎨', '#1A3C34', 5),
  ('social',       'Social Media', 'For content creators, community managers, and marketers', '📣', '#2D1B69', 6),
  ('productivity', 'Productivity', 'For anyone managing tasks, email, and meetings',          '✅', '#1B2631', 7)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  color = excluded.color,
  "order" = excluded."order";

with tool_rows(slug, label, prompt, output_mode, icon, color, "order", phase, builtin_id, context_requirements) as (
  values
    ('engineer', 'Explain Error',
     'Explain this error clearly and concisely. What is the root cause and how do I fix it?',
     'viewer', 'ai', '#2D1B69', 1, 1, 'builtin-ai-explain',
     '[{"provider":"clipboard","required":true,"reason":"Error output or stack trace to explain","maxBytes":12000},{"provider":"active_terminal","required":false,"reason":"Current terminal directory for command context","maxBytes":1000},{"provider":"project_files","required":false,"reason":"Project README and manifests for framework context","maxBytes":8000}]'::jsonb),

    ('engineer', 'Write Tests',
     'Write comprehensive unit tests for this code. Use the same language and testing framework visible in the code.',
     'viewer', 'ai', '#1B2631', 2, 1, 'builtin-ai-tests',
     '[{"provider":"clipboard","required":true,"reason":"Code to test","maxBytes":16000},{"provider":"project_files","required":false,"reason":"Project manifests and README to infer test framework","maxBytes":12000}]'::jsonb),

    ('engineer', 'Review Code',
     'Review this code. Identify bugs, security issues, performance problems, and style violations. Be specific and actionable.',
     'viewer', 'ai', '#1B2631', 3, 1, 'engineer-review-code',
     '[{"provider":"clipboard","required":true,"reason":"Code or diff to review","maxBytes":18000},{"provider":"project_files","required":false,"reason":"Project files to understand framework and conventions","maxBytes":12000},{"provider":"git","required":false,"reason":"Git state and recent commits for review context","maxBytes":12000}]'::jsonb),

    ('engineer', 'Write Docstring',
     'Write a JSDoc or docstring for this function. Include param descriptions, return type, and a one-line summary. Return only the docstring.',
     'autopaste', 'ai', '#1B2631', 4, 1, 'engineer-write-docstring',
     '[{"provider":"clipboard","required":true,"reason":"Function or class that needs documentation","maxBytes":10000},{"provider":"project_files","required":false,"reason":"Project language and documentation conventions","maxBytes":8000}]'::jsonb),

    ('engineer', 'Convert to TypeScript',
     'Convert this JavaScript to TypeScript. Add proper type annotations for all variables, parameters, and return types. Return only the converted code.',
     'viewer', 'ai', '#1B2631', 5, 1, 'engineer-convert-typescript',
     '[{"provider":"clipboard","required":true,"reason":"JavaScript code to convert","maxBytes":16000},{"provider":"project_files","required":false,"reason":"Project TypeScript configuration and package context","maxBytes":8000}]'::jsonb),

    ('engineer', 'Explain Regex',
     'Explain what this regular expression does in plain English. Break down each part of the pattern.',
     'autopaste', 'ai', '#1B2631', 6, 1, 'engineer-explain-regex',
     '[{"provider":"clipboard","required":true,"reason":"Regular expression to explain","maxBytes":4000}]'::jsonb),

    ('engineer', 'Generate Commit Msg',
     'Generate a conventional commit message for this git diff. Format: type(scope): description. Types: feat, fix, refactor, docs, test, chore.',
     'clipboard', 'ai', '#1B2631', 7, 2, 'engineer-generate-commit-msg',
     '[{"provider":"clipboard","required":true,"reason":"Git diff or change summary","maxBytes":18000},{"provider":"git","required":false,"reason":"Current branch and recent commit context","maxBytes":12000}]'::jsonb),

    ('writer', 'Fix Grammar',
     'Fix all grammar and spelling errors. Return only the corrected text, no commentary.',
     'autopaste', 'ai', '#0D3B2E', 1, 1, 'builtin-ai-grammar',
     '[{"provider":"clipboard","required":true,"reason":"Text to correct","maxBytes":12000}]'::jsonb),

    ('writer', 'Make Shorter',
     'Rewrite this to be shorter and more concise. Cut filler. Keep the core message intact.',
     'autopaste', 'ai', '#2C1654', 2, 1, 'builtin-ai-shorten',
     '[{"provider":"clipboard","required":true,"reason":"Text to shorten","maxBytes":12000}]'::jsonb),

    ('writer', 'Continue Story',
     'Continue this story naturally. Match the tone, style, and pacing of what came before. Write 2-3 paragraphs.',
     'viewer', 'ai', '#2C1654', 3, 1, 'writer-continue-story',
     '[{"provider":"clipboard","required":true,"reason":"Story excerpt to continue","maxBytes":16000}]'::jsonb),

    ('writer', 'Rewrite Tone',
     'Rewrite this text in three versions: Formal, Casual, and Dramatic. Label each clearly.',
     'viewer', 'ai', '#2C1654', 4, 1, 'writer-rewrite-tone',
     '[{"provider":"clipboard","required":true,"reason":"Text to rewrite in different tones","maxBytes":12000}]'::jsonb),

    ('writer', 'Brainstorm Plot',
     'Generate 5 distinct plot direction ideas based on this story premise or excerpt. Each idea should be 2-3 sentences.',
     'viewer', 'ai', '#2C1654', 5, 1, 'writer-brainstorm-plot',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The story premise, genre, conflict, character, or direction to brainstorm"},{"provider":"clipboard","required":false,"reason":"Story excerpt or notes for additional context","maxBytes":12000}]'::jsonb),

    ('writer', 'Add Dialogue',
     'Add natural, purposeful dialogue to this scene. Keep character voices distinct.',
     'viewer', 'ai', '#2C1654', 6, 1, 'writer-add-dialogue',
     '[{"provider":"clipboard","required":true,"reason":"Scene or character context for dialogue","maxBytes":16000}]'::jsonb),

    ('writer', 'Punch It Up',
     'Rewrite this to be more vivid, energetic, and engaging. Use stronger verbs and more specific details. Return the rewritten text only.',
     'autopaste', 'ai', '#2C1654', 7, 1, 'writer-punch-it-up',
     '[{"provider":"clipboard","required":true,"reason":"Text to make more vivid","maxBytes":12000}]'::jsonb),

    ('gamer', 'Explain Mechanic',
     'Explain this game mechanic, ability, or item in plain English. What does it do and when should you use it?',
     'viewer', 'ai', '#1A237E', 1, 1, 'gamer-explain-mechanic',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The specific mechanic, keybind, agent, item, or rule to explain"},{"provider":"clipboard","required":false,"reason":"Any game text, patch notes, or ability description for additional context","maxBytes":10000},{"provider":"active_window","required":false,"reason":"Foreground game or launcher name","maxBytes":1000}]'::jsonb),

    ('gamer', 'Build Optimizer',
     'Analyze this game build and suggest specific improvements. What should change and why?',
     'viewer', 'ai', '#1A237E', 2, 1, 'gamer-build-optimizer',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The build, loadout, or playstyle to optimize"},{"provider":"clipboard","required":false,"reason":"Current build stats, loadout details, or constraints","maxBytes":12000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb),

    ('gamer', 'Lore Summary',
     'Summarize the key lore points from this game text. Keep it concise.',
     'viewer', 'ai', '#1A237E', 3, 1, 'gamer-lore-summary',
     '[{"provider":"clipboard","required":true,"reason":"Game lore text to summarize","maxBytes":12000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb),

    ('gamer', 'Callout Phrases',
     'Generate 5 clear, concise team callout phrases for this in-game situation. Keep them short and copy-ready.',
     'clipboard', 'ai', '#1A237E', 4, 1, 'gamer-callout-phrases',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The in-game situation, objective, or map area to generate callouts for"},{"provider":"clipboard","required":false,"reason":"Map description or objective context","maxBytes":8000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb),

    ('gamer', 'Counter Strategy',
     'What counters this strategy, champion, or loadout? Give 3 specific counter-picks or tactical approaches.',
     'viewer', 'ai', '#1A237E', 5, 1, 'gamer-counter-strategy',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The strategy, champion, agent, weapon, or loadout to counter"},{"provider":"clipboard","required":false,"reason":"Any notes or patch text about the target strategy or opponent","maxBytes":10000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb),

    ('gamer', 'Quest Helper',
     'Give walkthrough hints for this quest without major spoilers. Just enough to unblock progress.',
     'viewer', 'ai', '#1A237E', 6, 1, 'gamer-quest-helper',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The quest name, objective description, or specific blocker you are stuck on"},{"provider":"clipboard","required":false,"reason":"Quest text, objective description, or walkthrough excerpt","maxBytes":10000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb),

    ('gamer', 'Active Game Tip',
     'Give me a quick tactical tip for improving my current gameplay session.',
     'viewer', 'ai', '#1A237E', 7, 2, 'gamer-active-game-tip',
     '[{"provider":"active_window","required":true,"reason":"Foreground game or app for session-specific tip","maxBytes":1000},{"provider":"media","required":false,"reason":"Active audio sessions to identify running game and comms apps","maxBytes":2000},{"provider":"obs","required":false,"reason":"OBS streaming and scene state for creator-aware tips","maxBytes":2000}]'::jsonb),

    ('student', 'Translate ES',
     'Translate this text to Spanish. Return only the translation.',
     'clipboard', 'ai', '#1A3C34', 1, 1, 'builtin-ai-translate',
     '[{"provider":"clipboard","required":true,"reason":"Text to translate","maxBytes":12000}]'::jsonb),

    ('student', 'ELI5',
     'Explain this concept as if I am a curious 12-year-old. Use simple analogies and avoid jargon.',
     'viewer', 'ai', '#0D3B2E', 2, 1, 'student-eli5',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The concept or question to explain simply"},{"provider":"clipboard","required":false,"reason":"Passage or notes that describe the concept","maxBytes":12000}]'::jsonb),

    ('student', 'Summarize Notes',
     'Summarize these notes into clear bullet points. Group related ideas. Keep it concise.',
     'autopaste', 'ai', '#0D3B2E', 3, 1, 'student-summarize-notes',
     '[{"provider":"clipboard","required":true,"reason":"Notes to summarize","maxBytes":18000}]'::jsonb),

    ('student', 'Make Flashcards',
     'Create 5-10 Q&A flashcard pairs from this content. Format each as: Q: [question] / A: [answer]',
     'viewer', 'ai', '#0D3B2E', 4, 1, 'student-make-flashcards',
     '[{"provider":"clipboard","required":true,"reason":"Study material to turn into flashcards","maxBytes":18000}]'::jsonb),

    ('student', 'Check My Answer',
     'Review my answer. Is it correct? What is missing or wrong? Give specific, constructive feedback.',
     'viewer', 'ai', '#0D3B2E', 5, 1, 'student-check-answer',
     '[{"provider":"clipboard","required":true,"reason":"Question, answer, and any rubric or context","maxBytes":16000}]'::jsonb),

    ('student', 'Write Citation',
     'Generate both an APA and MLA citation for this source information.',
     'clipboard', 'ai', '#0D3B2E', 6, 1, 'student-write-citation',
     '[{"provider":"clipboard","required":true,"reason":"Source metadata or URL to cite","maxBytes":8000}]'::jsonb),

    ('student', 'Study Plan',
     'Create a 7-day study plan for this topic. Break it into daily learning goals with specific activities.',
     'viewer', 'ai', '#0D3B2E', 7, 1, 'student-study-plan',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The topic, exam date, deadline, current level, or learning goal"},{"provider":"clipboard","required":false,"reason":"Syllabus, notes, or constraints for the study plan","maxBytes":12000}]'::jsonb),

    ('designer', 'Write Microcopy',
     'Write 3 options for microcopy for this UI element (button label, placeholder, tooltip, or error message). Keep each under 5 words.',
     'viewer', 'ai', '#1A3C34', 1, 1, 'designer-write-microcopy',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The UI element, user action, or message goal to write microcopy for"},{"provider":"clipboard","required":false,"reason":"Product, flow, or design context","maxBytes":10000},{"provider":"active_window","required":false,"reason":"Foreground design or product app name","maxBytes":1000}]'::jsonb),

    ('designer', 'Naming Ideas',
     'Generate 10 name ideas for this component, feature, or product concept. Mix descriptive and creative options.',
     'viewer', 'ai', '#1A3C34', 2, 1, 'designer-naming-ideas',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The component, feature, product, or concept to name"},{"provider":"clipboard","required":false,"reason":"Component, feature, or product context","maxBytes":10000}]'::jsonb),

    ('designer', 'Color Palette',
     'Generate a 5-color palette for this brand or mood description. Return hex codes with names and usage notes.',
     'viewer', 'ai', '#1A3C34', 3, 1, 'designer-color-palette',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The brand, mood, audience, or visual direction for the palette"},{"provider":"clipboard","required":false,"reason":"Brand notes, moodboard text, or audience context","maxBytes":8000}]'::jsonb),

    ('designer', 'Design Critique',
     'Critique this design description or spec. What works well? What are the UX risks? What is missing?',
     'viewer', 'ai', '#1A3C34', 4, 1, 'designer-design-critique',
     '[{"provider":"clipboard","required":true,"reason":"Design description, spec, or critique target","maxBytes":16000},{"provider":"active_window","required":false,"reason":"Foreground design app or product surface","maxBytes":1000}]'::jsonb),

    ('designer', 'Accessibility Check',
     'Review this component or copy for accessibility issues. Flag WCAG violations and suggest specific fixes.',
     'viewer', 'ai', '#1A3C34', 5, 1, 'designer-accessibility-check',
     '[{"provider":"clipboard","required":true,"reason":"Component code, copy, or design notes to audit","maxBytes":16000},{"provider":"project_files","required":false,"reason":"Project UI framework and conventions","maxBytes":10000}]'::jsonb),

    ('designer', 'Simplify UX Copy',
     'Rewrite this UI text to be clearer and more user-friendly. Use plain language and active voice. Return the rewritten text only.',
     'autopaste', 'ai', '#1A3C34', 6, 1, 'designer-simplify-ux-copy',
     '[{"provider":"clipboard","required":true,"reason":"UI copy to simplify","maxBytes":10000}]'::jsonb),

    ('social', 'Write Tweet',
     'Write a compelling tweet based on this content. Max 280 characters. No hashtags unless relevant.',
     'clipboard', 'ai', '#2D1B69', 1, 1, 'builtin-ai-tweet',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The topic, message, product, event, or angle for the tweet"},{"provider":"clipboard","required":false,"reason":"Source content or notes for the tweet","maxBytes":10000}]'::jsonb),

    ('social', 'Write Caption',
     'Write an engaging Instagram or TikTok caption for this content. Include a call to action.',
     'clipboard', 'ai', '#2D1B69', 2, 1, 'social-write-caption',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The platform, content, product, campaign, or image/video description"},{"provider":"clipboard","required":false,"reason":"Source content, product notes, or campaign context","maxBytes":12000}]'::jsonb),

    ('social', 'Generate Hashtags',
     'Generate 15 relevant hashtags for this post. Mix popular and niche. Return as a space-separated hashtag list.',
     'clipboard', 'ai', '#2D1B69', 3, 1, 'social-generate-hashtags',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The post topic, niche, audience, or campaign to generate hashtags for"},{"provider":"clipboard","required":false,"reason":"Post draft or topic notes","maxBytes":10000}]'::jsonb),

    ('social', 'LinkedIn Rephrase',
     'Rewrite this for LinkedIn. Professional tone, value-forward, ends with a clear takeaway. Return the rewritten text only.',
     'autopaste', 'ai', '#2D1B69', 4, 1, 'social-linkedin-rephrase',
     '[{"provider":"clipboard","required":true,"reason":"Text to adapt for LinkedIn","maxBytes":12000}]'::jsonb),

    ('social', 'A/B Headlines',
     'Write 3 headline variations for this content. Each should take a different angle or emotional tone.',
     'viewer', 'ai', '#2D1B69', 5, 1, 'social-ab-headlines',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The offer, content, audience, or angle to write headline variations for"},{"provider":"clipboard","required":false,"reason":"Source content, offer notes, or landing page copy","maxBytes":12000}]'::jsonb),

    ('social', 'Thread Expander',
     'Expand this idea into a Twitter/X thread of 5-7 tweets. Each tweet should be punchy and standalone. Number them.',
     'viewer', 'ai', '#2D1B69', 6, 1, 'social-thread-expander',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The idea, topic, or thesis to expand into a thread"},{"provider":"clipboard","required":false,"reason":"Draft idea, notes, or source content","maxBytes":12000}]'::jsonb),

    ('social', 'Hook Generator',
     'Write 5 opening hook sentences for this topic. Each should be surprising, bold, or counter-intuitive.',
     'clipboard', 'ai', '#2D1B69', 7, 1, 'social-hook-generator',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The topic, offer, audience, or content angle for hooks"},{"provider":"clipboard","required":false,"reason":"Topic notes or source content","maxBytes":10000}]'::jsonb),

    ('productivity', 'TL;DR',
     'Summarize this in 3 sentences or less. Cut to what matters most. Return the summary only.',
     'autopaste', 'ai', '#1B2631', 1, 1, 'productivity-tldr',
     '[{"provider":"clipboard","required":true,"reason":"Text, notes, or thread to summarize","maxBytes":18000}]'::jsonb),

    ('productivity', 'Write Email',
     'Draft a professional email based on this context. Include a clear subject line suggestion, concise body, and polite close.',
     'viewer', 'ai', '#1B2631', 2, 1, 'productivity-write-email',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The email goal, recipient, tone, and key points"},{"provider":"clipboard","required":false,"reason":"Notes, prior email, or source context","maxBytes":12000},{"provider":"active_window","required":false,"reason":"Foreground mail or messaging app name","maxBytes":1000}]'::jsonb),

    ('productivity', 'Action Items',
     'Extract all action items from these meeting notes. Format each as: - [ ] [action] -> [owner] by [date if mentioned]',
     'viewer', 'ai', '#1B2631', 3, 1, 'productivity-action-items',
     '[{"provider":"clipboard","required":true,"reason":"Meeting notes or transcript","maxBytes":18000}]'::jsonb),

    ('productivity', 'Prioritize',
     'Prioritize this task list by impact and urgency. Group into four buckets: Do Now, Schedule, Delegate, Drop.',
     'viewer', 'ai', '#1B2631', 4, 1, 'productivity-prioritize',
     '[{"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The task list, goal, deadline, or priority criteria"},{"provider":"clipboard","required":false,"reason":"Task list or backlog details","maxBytes":16000}]'::jsonb),

    ('productivity', 'Rewrite Clearly',
     'Rewrite this to remove ambiguity. Every sentence should have exactly one clear meaning. Return the rewritten text only.',
     'autopaste', 'ai', '#1B2631', 5, 1, 'productivity-rewrite-clearly',
     '[{"provider":"clipboard","required":true,"reason":"Text to clarify","maxBytes":12000}]'::jsonb),

    ('productivity', 'Reply Draft',
     'Draft a professional reply to this email or message. Match the formality level of the original.',
     'viewer', 'ai', '#1B2631', 6, 1, 'productivity-reply-draft',
     '[{"provider":"clipboard","required":true,"reason":"Email or message to reply to","maxBytes":12000},{"provider":"active_window","required":false,"reason":"Foreground mail or messaging app name","maxBytes":1000}]'::jsonb)
),
backfilled as (
  update public.pack_tools as tool
  set builtin_id = tool_rows.builtin_id
  from tool_rows
  join public.packs as pack on pack.slug = tool_rows.slug
  where tool.pack_id = pack.id
    and tool.label = tool_rows.label
    and tool.builtin_id is null
  returning tool.id
)
insert into public.pack_tools (
  pack_id,
  kind,
  label,
  prompt,
  command,
  output_mode,
  context_requirements,
  icon,
  color,
  "order",
  phase,
  builtin_id
)
select
  pack.id,
  'ai',
  tool_rows.label,
  tool_rows.prompt,
  null,
  tool_rows.output_mode,
  tool_rows.context_requirements,
  tool_rows.icon,
  tool_rows.color,
  tool_rows."order",
  tool_rows.phase,
  tool_rows.builtin_id
from tool_rows
join public.packs as pack on pack.slug = tool_rows.slug
on conflict (builtin_id) where builtin_id is not null do update set
  pack_id = excluded.pack_id,
  kind = excluded.kind,
  label = excluded.label,
  prompt = excluded.prompt,
  command = excluded.command,
  output_mode = excluded.output_mode,
  context_requirements = excluded.context_requirements,
  icon = excluded.icon,
  color = excluded.color,
  "order" = excluded."order",
  phase = excluded.phase;

commit;
