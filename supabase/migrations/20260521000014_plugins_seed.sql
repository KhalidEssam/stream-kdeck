-- Seed: OBS Studio plugin
INSERT INTO public.integration_plugins (
  slug,
  name,
  description,
  category,
  icon,
  color,
  publisher,
  version,
  status,
  min_agent_capability,
  min_mobile_capability,
  supported_platforms,
  requires_connector,
  connector_type,
  sort_order
) VALUES (
  'obs',
  'OBS Studio',
  'Control your OBS stream: start/stop, switch scenes, toggle sources, and see live status badges.',
  'streaming',
  'video-camera',
  '#1a1a2e',
  'KDeck',
  '1.0.0',
  'published',
  1,
  1,
  ARRAY['win32','darwin'],
  true,
  'local-websocket',
  10
)
ON CONFLICT (slug) DO NOTHING;

-- Seed: OBS Studio tools
WITH plugin AS (
  SELECT id FROM public.integration_plugins WHERE slug = 'obs'
)
INSERT INTO public.integration_tools (
  plugin_id,
  slug,
  name,
  action_id,
  execution_mode,
  params_schema,
  result_schema,
  supports_workflows,
  supports_state,
  requires_confirmation,
  sort_order,
  status
)
SELECT
  plugin.id,
  t.slug,
  t.name,
  t.action_id,
  t.execution_mode,
  t.params_schema::jsonb,
  '{}'::jsonb,
  t.supports_workflows,
  t.supports_state,
  t.requires_confirmation,
  t.sort_order,
  'published'
FROM plugin, (VALUES
  ('start-stream',    'Start Stream',    'obs.stream.start',  'agent', '{}',                                                                                                                                                             true,  true,  false, 10),
  ('stop-stream',     'Stop Stream',     'obs.stream.stop',   'agent', '{}',                                                                                                                                                             true,  true,  false, 20),
  ('start-recording', 'Start Recording', 'obs.record.start',  'agent', '{}',                                                                                                                                                             true,  true,  false, 30),
  ('stop-recording',  'Stop Recording',  'obs.record.stop',   'agent', '{}',                                                                                                                                                             true,  true,  false, 40),
  ('switch-scene',    'Switch Scene',    'obs.scene.switch',  'agent', '{"type":"object","required":["sceneName"],"properties":{"sceneName":{"type":"string"}}}',                                                                        true,  true,  false, 50),
  ('toggle-source',   'Toggle Source',   'obs.source.toggle', 'agent', '{"type":"object","required":["sceneName","sourceName"],"properties":{"sceneName":{"type":"string"},"sourceName":{"type":"string"}}}', true,  false, false, 60)
) AS t(slug, name, action_id, execution_mode, params_schema, supports_workflows, supports_state, requires_confirmation, sort_order)
ON CONFLICT (plugin_id, slug) DO NOTHING;
