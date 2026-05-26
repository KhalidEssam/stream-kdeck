-- Spotify cloud plugin — playback controls for the deck.

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
  'spotify',
  'Spotify',
  'Control Spotify playback — play, pause, skip, volume, and shuffle from your deck.',
  'music',
  'spotify',
  '#1DB954',
  'KDeck',
  '0.1.0',
  'published',
  1,
  1,
  ARRAY['win32','darwin'],
  true,
  'oauth2',
  90
)
ON CONFLICT (slug) DO UPDATE SET
  name                  = EXCLUDED.name,
  description           = EXCLUDED.description,
  category              = EXCLUDED.category,
  icon                  = EXCLUDED.icon,
  color                 = EXCLUDED.color,
  version               = EXCLUDED.version,
  status                = EXCLUDED.status,
  min_agent_capability  = EXCLUDED.min_agent_capability,
  min_mobile_capability = EXCLUDED.min_mobile_capability,
  supported_platforms   = EXCLUDED.supported_platforms,
  requires_connector    = EXCLUDED.requires_connector,
  connector_type        = EXCLUDED.connector_type,
  sort_order            = EXCLUDED.sort_order,
  updated_at            = now();

WITH plugin AS (
  SELECT id FROM public.integration_plugins WHERE slug = 'spotify'
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
  '#1DB954',
  t.action_id,
  'cloud',
  t.params_schema::jsonb,
  '{}'::jsonb,
  true,
  false,
  false,
  t.sort_order,
  'published'
FROM plugin, (VALUES
  (
    'playback-toggle',
    'Play / Pause',
    'Toggle Spotify playback on the active device.',
    'play',
    'spotify.playback.toggle',
    '{"type":"object","properties":{}}',
    10
  ),
  (
    'playback-next',
    'Next Track',
    'Skip to the next track.',
    'skip-forward',
    'spotify.playback.next',
    '{"type":"object","properties":{}}',
    20
  ),
  (
    'playback-previous',
    'Previous Track',
    'Go back to the previous track.',
    'skip-back',
    'spotify.playback.previous',
    '{"type":"object","properties":{}}',
    30
  ),
  (
    'volume-set',
    'Set Volume',
    'Set Spotify playback volume.',
    'volume-2',
    'spotify.volume.set',
    '{"type":"object","required":["volumePercent"],"properties":{"volumePercent":{"type":"number","description":"Volume level 0–100"}}}',
    40
  ),
  (
    'shuffle-toggle',
    'Toggle Shuffle',
    'Toggle shuffle mode on or off.',
    'shuffle',
    'spotify.shuffle.toggle',
    '{"type":"object","properties":{}}',
    50
  ),
  (
    'track-save',
    'Save Track',
    'Save the currently playing track to your Liked Songs.',
    'heart',
    'spotify.track.save',
    '{"type":"object","properties":{}}',
    60
  )
) AS t(slug, name, description, icon, action_id, params_schema, sort_order)
ON CONFLICT (plugin_id, slug) DO UPDATE SET
  name                  = EXCLUDED.name,
  description           = EXCLUDED.description,
  icon                  = EXCLUDED.icon,
  color                 = EXCLUDED.color,
  action_id             = EXCLUDED.action_id,
  execution_mode        = EXCLUDED.execution_mode,
  params_schema         = EXCLUDED.params_schema,
  result_schema         = EXCLUDED.result_schema,
  supports_workflows    = EXCLUDED.supports_workflows,
  supports_state        = EXCLUDED.supports_state,
  requires_confirmation = EXCLUDED.requires_confirmation,
  sort_order            = EXCLUDED.sort_order,
  status                = EXCLUDED.status;
