-- Replace clipboard-required with user_input-required for question-driven Gamer tools.
-- Clipboard becomes optional and relevance-checked for these tools.
-- Affected: Explain Mechanic, Build Optimizer, Callout Phrases, Counter Strategy, Quest Helper.
-- Lore Summary and Active Game Tip are unchanged.

WITH gamer_tools(label, requirements) AS (
  VALUES
    ('Explain Mechanic', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The specific mechanic, keybind, agent, item, or rule to explain"},
      {"provider":"clipboard","required":false,"reason":"Any game text, patch notes, or ability description for additional context","maxBytes":10000},
      {"provider":"active_window","required":false,"reason":"Foreground game or launcher name","maxBytes":1000}
    ]'::jsonb),
    ('Build Optimizer', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The build, loadout, or playstyle to optimize"},
      {"provider":"clipboard","required":false,"reason":"Current build stats, loadout details, or constraints","maxBytes":12000},
      {"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}
    ]'::jsonb),
    ('Callout Phrases', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The in-game situation, objective, or map area to generate callouts for"},
      {"provider":"clipboard","required":false,"reason":"Map description or objective context","maxBytes":8000},
      {"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}
    ]'::jsonb),
    ('Counter Strategy', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The strategy, champion, agent, weapon, or loadout to counter"},
      {"provider":"clipboard","required":false,"reason":"Any notes or patch text about the target strategy or opponent","maxBytes":10000},
      {"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}
    ]'::jsonb),
    ('Quest Helper', '[
      {"provider":"user_input","required":true,"role":"intent","priority":100,"captureMode":"speech_or_text","reason":"The quest name, objective description, or specific blocker you are stuck on"},
      {"provider":"clipboard","required":false,"reason":"Quest text, objective description, or walkthrough excerpt","maxBytes":10000},
      {"provider":"active_window","required":false,"reason":"Foreground game name","maxBytes":1000}
    ]'::jsonb)
)
UPDATE public.pack_tools AS tool
SET context_requirements = gamer_tools.requirements
FROM gamer_tools
JOIN public.packs AS pack ON pack.slug = 'gamer'
WHERE tool.pack_id = pack.id
  AND tool.label = gamer_tools.label;
