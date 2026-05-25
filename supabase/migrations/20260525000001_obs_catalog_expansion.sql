-- Adds the OBS tool entries that obs.service.ts implements but the catalog
-- does not yet expose. Uses ON CONFLICT DO UPDATE so future re-runs are
-- idempotent and tool metadata changes actually land.

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
  ('stream-toggle',         'Toggle Stream',         'obs.stream.toggle',         'agent', '{}', true,  true,  false, 11),
  ('record-toggle',         'Toggle Recording',      'obs.record.toggle',         'agent', '{}', true,  true,  false, 31),
  ('replay-start',          'Start Replay Buffer',   'obs.replay.start',          'agent', '{}', true,  true,  false, 61),
  ('replay-stop',           'Stop Replay Buffer',    'obs.replay.stop',           'agent', '{}', true,  true,  false, 62),
  ('replay-save',           'Save Replay Buffer',    'obs.replay.save',           'agent', '{}', true,  false, false, 63),
  ('replay-toggle',         'Toggle Replay Buffer',  'obs.replay.toggle',         'agent', '{}', true,  true,  false, 64),
  ('virtual-camera-start',  'Start Virtual Camera',  'obs.virtual_camera.start',  'agent', '{}', true,  true,  false, 71),
  ('virtual-camera-stop',   'Stop Virtual Camera',   'obs.virtual_camera.stop',   'agent', '{}', true,  true,  false, 72),
  ('virtual-camera-toggle', 'Toggle Virtual Camera', 'obs.virtual_camera.toggle', 'agent', '{}', true,  true,  false, 73),
  ('studio-mode-enable',    'Enable Studio Mode',    'obs.studio_mode.enable',    'agent', '{}', true,  true,  false, 81),
  ('studio-mode-disable',   'Disable Studio Mode',   'obs.studio_mode.disable',   'agent', '{}', true,  true,  false, 82),
  ('studio-mode-toggle',    'Toggle Studio Mode',    'obs.studio_mode.toggle',    'agent', '{}', true,  true,  false, 83),
  ('input-mute-toggle',     'Toggle Input Mute',     'obs.input.mute.toggle',     'agent',
   '{"type":"object","required":["inputName"],"properties":{"inputName":{"type":"string"}}}',
   true, false, false, 91),
  ('input-mute-set',        'Set Input Mute',        'obs.input.mute.set',        'agent',
   '{"type":"object","required":["inputName","muted"],"properties":{"inputName":{"type":"string"},"muted":{"type":"boolean"}}}',
   true, false, false, 92),
  ('input-volume-set',      'Set Input Volume',      'obs.input.volume.set',      'agent',
   '{"type":"object","required":["inputName","volume"],"properties":{"inputName":{"type":"string"},"volume":{"type":"number","minimum":0,"maximum":1}}}',
   true, false, false, 93)
) AS t(slug, name, action_id, execution_mode, params_schema, supports_workflows, supports_state, requires_confirmation, sort_order)
ON CONFLICT (plugin_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  action_id = EXCLUDED.action_id,
  execution_mode = EXCLUDED.execution_mode,
  params_schema = EXCLUDED.params_schema,
  result_schema = EXCLUDED.result_schema,
  supports_workflows = EXCLUDED.supports_workflows,
  supports_state = EXCLUDED.supports_state,
  requires_confirmation = EXCLUDED.requires_confirmation,
  sort_order = EXCLUDED.sort_order,
  status = EXCLUDED.status;
