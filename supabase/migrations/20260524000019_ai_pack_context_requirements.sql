-- Assign context requirements to all non-Git AI pack tools so the context
-- assembler can gather the right inputs for each task.

WITH tool_contexts(slug, label, builtin_id, requirements) AS (
  VALUES
    ('engineer', 'Explain Error', 'builtin-ai-explain', '[{"provider":"clipboard","required":true,"reason":"Error output or stack trace to explain","maxBytes":12000},{"provider":"active_terminal","required":false,"reason":"Current terminal directory for command context","maxBytes":1000},{"provider":"project_files","required":false,"reason":"Project README and manifests for framework context","maxBytes":8000}]'::jsonb),
    ('engineer', 'Write Tests', 'builtin-ai-tests', '[{"provider":"clipboard","required":true,"reason":"Code to test","maxBytes":16000},{"provider":"project_files","required":false,"reason":"Project manifests and README to infer test framework","maxBytes":12000}]'::jsonb),
    ('engineer', 'Review Code', 'engineer-review-code', '[{"provider":"clipboard","required":true,"reason":"Code or diff to review","maxBytes":18000},{"provider":"project_files","required":false,"reason":"Project files to understand framework and conventions","maxBytes":12000},{"provider":"git","required":false,"reason":"Git state and recent commits for review context","maxBytes":12000}]'::jsonb),
    ('engineer', 'Write Docstring', 'engineer-write-docstring', '[{"provider":"clipboard","required":true,"reason":"Function or class that needs documentation","maxBytes":10000},{"provider":"project_files","required":false,"reason":"Project language and documentation conventions","maxBytes":8000}]'::jsonb),
    ('engineer', 'Convert to TypeScript', 'engineer-convert-typescript', '[{"provider":"clipboard","required":true,"reason":"JavaScript code to convert","maxBytes":16000},{"provider":"project_files","required":false,"reason":"Project TypeScript configuration and package context","maxBytes":8000}]'::jsonb),
    ('engineer', 'Explain Regex', 'engineer-explain-regex', '[{"provider":"clipboard","required":true,"reason":"Regular expression to explain","maxBytes":4000}]'::jsonb),
    ('engineer', 'Generate Commit Msg', 'engineer-generate-commit-msg', '[{"provider":"clipboard","required":true,"reason":"Git diff or change summary","maxBytes":18000},{"provider":"git","required":false,"reason":"Current branch and recent commit context","maxBytes":12000}]'::jsonb),

    ('writer', 'Fix Grammar', 'builtin-ai-grammar', '[{"provider":"clipboard","required":true,"reason":"Text to correct","maxBytes":12000}]'::jsonb),
    ('writer', 'Make Shorter', 'builtin-ai-shorten', '[{"provider":"clipboard","required":true,"reason":"Text to shorten","maxBytes":12000}]'::jsonb),
    ('writer', 'Continue Story', 'writer-continue-story', '[{"provider":"clipboard","required":true,"reason":"Story excerpt to continue","maxBytes":16000}]'::jsonb),
    ('writer', 'Rewrite Tone', 'writer-rewrite-tone', '[{"provider":"clipboard","required":true,"reason":"Text to rewrite in different tones","maxBytes":12000}]'::jsonb),
    ('writer', 'Brainstorm Plot', 'writer-brainstorm-plot', '[{"provider":"clipboard","required":true,"reason":"Story premise or excerpt","maxBytes":12000}]'::jsonb),
    ('writer', 'Add Dialogue', 'writer-add-dialogue', '[{"provider":"clipboard","required":true,"reason":"Scene or character context for dialogue","maxBytes":16000}]'::jsonb),
    ('writer', 'Punch It Up', 'writer-punch-it-up', '[{"provider":"clipboard","required":true,"reason":"Text to make more vivid","maxBytes":12000}]'::jsonb),

    ('gamer', 'Explain Mechanic', 'gamer-explain-mechanic', '[{"provider":"clipboard","required":true,"reason":"Game mechanic, ability, item, or patch text","maxBytes":10000},{"provider":"active_window","required":false,"reason":"Foreground game or launcher name","maxBytes":1000}]'::jsonb),
    ('gamer', 'Build Optimizer', 'gamer-build-optimizer', '[{"provider":"clipboard","required":true,"reason":"Current build, loadout, stats, or constraints","maxBytes":12000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb),
    ('gamer', 'Lore Summary', 'gamer-lore-summary', '[{"provider":"clipboard","required":true,"reason":"Game lore text to summarize","maxBytes":12000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb),
    ('gamer', 'Callout Phrases', 'gamer-callout-phrases', '[{"provider":"clipboard","required":true,"reason":"In-game situation or objective to make callouts for","maxBytes":8000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb),
    ('gamer', 'Counter Strategy', 'gamer-counter-strategy', '[{"provider":"clipboard","required":true,"reason":"Strategy, champion, character, weapon, or loadout to counter","maxBytes":10000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb),
    ('gamer', 'Quest Helper', 'gamer-quest-helper', '[{"provider":"clipboard","required":true,"reason":"Quest text, objective, or blocker","maxBytes":10000},{"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}]'::jsonb),
    ('gamer', 'Active Game Tip', 'gamer-active-game-tip', '[{"provider":"active_window","required":true,"reason":"Foreground game or app for session-specific tip","maxBytes":1000},{"provider":"media","required":false,"reason":"Active audio sessions to identify running game and comms apps","maxBytes":2000},{"provider":"obs","required":false,"reason":"OBS streaming and scene state for creator-aware tips","maxBytes":2000}]'::jsonb),

    ('student', 'Translate ES', 'builtin-ai-translate', '[{"provider":"clipboard","required":true,"reason":"Text to translate","maxBytes":12000}]'::jsonb),
    ('student', 'ELI5', 'student-eli5', '[{"provider":"clipboard","required":true,"reason":"Concept or passage to explain simply","maxBytes":12000}]'::jsonb),
    ('student', 'Summarize Notes', 'student-summarize-notes', '[{"provider":"clipboard","required":true,"reason":"Notes to summarize","maxBytes":18000}]'::jsonb),
    ('student', 'Make Flashcards', 'student-make-flashcards', '[{"provider":"clipboard","required":true,"reason":"Study material to turn into flashcards","maxBytes":18000}]'::jsonb),
    ('student', 'Check My Answer', 'student-check-answer', '[{"provider":"clipboard","required":true,"reason":"Question, answer, and any rubric or context","maxBytes":16000}]'::jsonb),
    ('student', 'Write Citation', 'student-write-citation', '[{"provider":"clipboard","required":true,"reason":"Source metadata or URL to cite","maxBytes":8000}]'::jsonb),
    ('student', 'Study Plan', 'student-study-plan', '[{"provider":"clipboard","required":true,"reason":"Topic, syllabus, deadline, or learning goal","maxBytes":12000}]'::jsonb),

    ('designer', 'Write Microcopy', 'designer-write-microcopy', '[{"provider":"clipboard","required":true,"reason":"UI element, flow, or product context","maxBytes":10000},{"provider":"active_window","required":false,"reason":"Foreground design or product app name","maxBytes":1000}]'::jsonb),
    ('designer', 'Naming Ideas', 'designer-naming-ideas', '[{"provider":"clipboard","required":true,"reason":"Component, feature, or product concept","maxBytes":10000}]'::jsonb),
    ('designer', 'Color Palette', 'designer-color-palette', '[{"provider":"clipboard","required":true,"reason":"Brand, mood, audience, or visual direction","maxBytes":8000}]'::jsonb),
    ('designer', 'Design Critique', 'designer-design-critique', '[{"provider":"clipboard","required":true,"reason":"Design description, spec, or critique target","maxBytes":16000},{"provider":"active_window","required":false,"reason":"Foreground design app or product surface","maxBytes":1000}]'::jsonb),
    ('designer', 'Accessibility Check', 'designer-accessibility-check', '[{"provider":"clipboard","required":true,"reason":"Component code, copy, or design notes to audit","maxBytes":16000},{"provider":"project_files","required":false,"reason":"Project UI framework and conventions","maxBytes":10000}]'::jsonb),
    ('designer', 'Simplify UX Copy', 'designer-simplify-ux-copy', '[{"provider":"clipboard","required":true,"reason":"UI copy to simplify","maxBytes":10000}]'::jsonb),

    ('social', 'Write Tweet', 'builtin-ai-tweet', '[{"provider":"clipboard","required":true,"reason":"Source content or idea for the tweet","maxBytes":10000}]'::jsonb),
    ('social', 'Write Caption', 'social-write-caption', '[{"provider":"clipboard","required":true,"reason":"Source content, product, image description, or campaign context","maxBytes":12000}]'::jsonb),
    ('social', 'Generate Hashtags', 'social-generate-hashtags', '[{"provider":"clipboard","required":true,"reason":"Post topic or draft content","maxBytes":10000}]'::jsonb),
    ('social', 'LinkedIn Rephrase', 'social-linkedin-rephrase', '[{"provider":"clipboard","required":true,"reason":"Text to adapt for LinkedIn","maxBytes":12000}]'::jsonb),
    ('social', 'A/B Headlines', 'social-ab-headlines', '[{"provider":"clipboard","required":true,"reason":"Content or offer to write headline variants for","maxBytes":12000}]'::jsonb),
    ('social', 'Thread Expander', 'social-thread-expander', '[{"provider":"clipboard","required":true,"reason":"Idea or draft to expand into a thread","maxBytes":12000}]'::jsonb),
    ('social', 'Hook Generator', 'social-hook-generator', '[{"provider":"clipboard","required":true,"reason":"Topic, offer, or content angle","maxBytes":10000}]'::jsonb),

    ('productivity', 'TL;DR', 'productivity-tldr', '[{"provider":"clipboard","required":true,"reason":"Text, notes, or thread to summarize","maxBytes":18000}]'::jsonb),
    ('productivity', 'Write Email', 'productivity-write-email', '[{"provider":"clipboard","required":true,"reason":"Email goal, notes, or source context","maxBytes":12000},{"provider":"active_window","required":false,"reason":"Foreground mail or messaging app name","maxBytes":1000}]'::jsonb),
    ('productivity', 'Action Items', 'productivity-action-items', '[{"provider":"clipboard","required":true,"reason":"Meeting notes or transcript","maxBytes":18000}]'::jsonb),
    ('productivity', 'Prioritize', 'productivity-prioritize', '[{"provider":"clipboard","required":true,"reason":"Task list or backlog to prioritize","maxBytes":16000}]'::jsonb),
    ('productivity', 'Rewrite Clearly', 'productivity-rewrite-clearly', '[{"provider":"clipboard","required":true,"reason":"Text to clarify","maxBytes":12000}]'::jsonb),
    ('productivity', 'Reply Draft', 'productivity-reply-draft', '[{"provider":"clipboard","required":true,"reason":"Email or message to reply to","maxBytes":12000},{"provider":"active_window","required":false,"reason":"Foreground mail or messaging app name","maxBytes":1000}]'::jsonb)
)
UPDATE public.pack_tools AS tool
SET builtin_id = COALESCE(tool.builtin_id, tool_contexts.builtin_id),
    context_requirements = tool_contexts.requirements
FROM tool_contexts
JOIN public.packs AS pack ON pack.slug = tool_contexts.slug
WHERE tool.pack_id = pack.id
  AND tool.label = tool_contexts.label;
