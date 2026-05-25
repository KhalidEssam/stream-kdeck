-- Twitch cloud plugin first slice. Kept internal until OAuth app credentials
-- and manual provider QA are complete.

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
  'twitch',
  'Twitch',
  'Create clips, add stream markers, update stream info, and send chat messages.',
  'streaming',
  'twitch',
  '#9146FF',
  'KDeck',
  '0.1.0',
  'internal',
  1,
  1,
  ARRAY['win32','darwin'],
  true,
  'oauth2',
  70
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  version = EXCLUDED.version,
  status = EXCLUDED.status,
  min_agent_capability = EXCLUDED.min_agent_capability,
  min_mobile_capability = EXCLUDED.min_mobile_capability,
  supported_platforms = EXCLUDED.supported_platforms,
  requires_connector = EXCLUDED.requires_connector,
  connector_type = EXCLUDED.connector_type,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

WITH plugin AS (
  SELECT id FROM public.integration_plugins WHERE slug = 'twitch'
)
INSERT INTO public.integration_tools (
  plugin_id,
  slug,
  name,
  description,
  icon,
  color,
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
  t.description,
  t.icon,
  '#9146FF',
  t.action_id,
  'cloud',
  t.params_schema::jsonb,
  '{}'::jsonb,
  true,
  false,
  t.requires_confirmation,
  t.sort_order,
  'internal'
FROM plugin, (VALUES
  (
    'create-clip',
    'Create Clip',
    'Create a clip from the connected Twitch channel.',
    'scissors',
    'twitch.clip.create',
    '{"type":"object","properties":{"broadcasterId":{"type":"string"},"hasDelay":{"type":"boolean"}}}',
    false,
    10
  ),
  (
    'create-marker',
    'Create Stream Marker',
    'Add a stream marker to the connected Twitch channel.',
    'bookmark',
    'twitch.marker.create',
    '{"type":"object","properties":{"broadcasterId":{"type":"string"},"description":{"type":"string"}}}',
    false,
    20
  ),
  (
    'update-channel',
    'Update Stream Info',
    'Update the stream title or game category.',
    'edit-3',
    'twitch.channel.update',
    '{"type":"object","properties":{"broadcasterId":{"type":"string"},"title":{"type":"string"},"gameId":{"type":"string"}}}',
    true,
    30
  ),
  (
    'send-chat',
    'Send Chat Message',
    'Send a chat message as the connected Twitch account.',
    'message-circle',
    'twitch.chat.send',
    '{"type":"object","required":["message"],"properties":{"broadcasterId":{"type":"string"},"message":{"type":"string"}}}',
    true,
    40
  )
) AS t(slug, name, description, icon, action_id, params_schema, requires_confirmation, sort_order)
ON CONFLICT (plugin_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  action_id = EXCLUDED.action_id,
  execution_mode = EXCLUDED.execution_mode,
  params_schema = EXCLUDED.params_schema,
  result_schema = EXCLUDED.result_schema,
  supports_workflows = EXCLUDED.supports_workflows,
  supports_state = EXCLUDED.supports_state,
  requires_confirmation = EXCLUDED.requires_confirmation,
  sort_order = EXCLUDED.sort_order,
  status = EXCLUDED.status;
