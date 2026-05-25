-- Make prompt-driven non-Gamer AI tools require explicit user intent.
-- Clipboard remains optional supporting context so dirty clipboard text cannot dominate the run.

WITH tool_contexts(slug, label, requirements) AS (
  VALUES
    ('writer', 'Brainstorm Plot', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The story premise, genre, conflict, character, or direction to brainstorm"},
      {"provider":"clipboard","required":false,"reason":"Story excerpt or notes for additional context","maxBytes":12000}
    ]'::jsonb),

    ('student', 'ELI5', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The concept or question to explain simply"},
      {"provider":"clipboard","required":false,"reason":"Passage or notes that describe the concept","maxBytes":12000}
    ]'::jsonb),
    ('student', 'Study Plan', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The topic, exam date, deadline, current level, or learning goal"},
      {"provider":"clipboard","required":false,"reason":"Syllabus, notes, or constraints for the study plan","maxBytes":12000}
    ]'::jsonb),

    ('designer', 'Write Microcopy', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The UI element, user action, or message goal to write microcopy for"},
      {"provider":"clipboard","required":false,"reason":"Product, flow, or design context","maxBytes":10000},
      {"provider":"active_window","required":false,"reason":"Foreground design or product app name","maxBytes":1000}
    ]'::jsonb),
    ('designer', 'Naming Ideas', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The component, feature, product, or concept to name"},
      {"provider":"clipboard","required":false,"reason":"Component, feature, or product context","maxBytes":10000}
    ]'::jsonb),
    ('designer', 'Color Palette', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The brand, mood, audience, or visual direction for the palette"},
      {"provider":"clipboard","required":false,"reason":"Brand notes, moodboard text, or audience context","maxBytes":8000}
    ]'::jsonb),

    ('social', 'Write Tweet', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The topic, message, product, event, or angle for the tweet"},
      {"provider":"clipboard","required":false,"reason":"Source content or notes for the tweet","maxBytes":10000}
    ]'::jsonb),
    ('social', 'Write Caption', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The platform, content, product, campaign, or image/video description"},
      {"provider":"clipboard","required":false,"reason":"Source content, product notes, or campaign context","maxBytes":12000}
    ]'::jsonb),
    ('social', 'Generate Hashtags', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The post topic, niche, audience, or campaign to generate hashtags for"},
      {"provider":"clipboard","required":false,"reason":"Post draft or topic notes","maxBytes":10000}
    ]'::jsonb),
    ('social', 'A/B Headlines', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The offer, content, audience, or angle to write headline variations for"},
      {"provider":"clipboard","required":false,"reason":"Source content, offer notes, or landing page copy","maxBytes":12000}
    ]'::jsonb),
    ('social', 'Thread Expander', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The idea, topic, or thesis to expand into a thread"},
      {"provider":"clipboard","required":false,"reason":"Draft idea, notes, or source content","maxBytes":12000}
    ]'::jsonb),
    ('social', 'Hook Generator', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The topic, offer, audience, or content angle for hooks"},
      {"provider":"clipboard","required":false,"reason":"Topic notes or source content","maxBytes":10000}
    ]'::jsonb),

    ('productivity', 'Write Email', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The email goal, recipient, tone, and key points"},
      {"provider":"clipboard","required":false,"reason":"Notes, prior email, or source context","maxBytes":12000},
      {"provider":"active_window","required":false,"reason":"Foreground mail or messaging app name","maxBytes":1000}
    ]'::jsonb),
    ('productivity', 'Prioritize', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The task list, goal, deadline, or priority criteria"},
      {"provider":"clipboard","required":false,"reason":"Task list or backlog details","maxBytes":16000}
    ]'::jsonb)
)
UPDATE public.pack_tools AS tool
SET context_requirements = tool_contexts.requirements
FROM tool_contexts
JOIN public.packs AS pack ON pack.slug = tool_contexts.slug
WHERE tool.pack_id = pack.id
  AND tool.label = tool_contexts.label;
