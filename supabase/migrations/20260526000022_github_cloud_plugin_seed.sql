-- GitHub cloud plugin — first slice.
-- Three tools covering the core developer deck actions: workflow dispatch,
-- issue creation, and repo starring.

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
  'github',
  'GitHub',
  'Trigger workflows, create issues, and star repositories from your deck.',
  'developer',
  'github',
  '#24292E',
  'KDeck',
  '0.1.0',
  'published',
  1,
  1,
  ARRAY['win32','darwin'],
  true,
  'oauth2',
  80
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
  SELECT id FROM public.integration_plugins WHERE slug = 'github'
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
  '#24292E',
  t.action_id,
  'cloud',
  t.params_schema::jsonb,
  '{}'::jsonb,
  true,
  false,
  t.requires_confirmation,
  t.sort_order,
  'published'
FROM plugin, (VALUES
  (
    'workflow-dispatch',
    'Trigger Workflow',
    'Trigger a GitHub Actions workflow run.',
    'play',
    'github.workflow.dispatch',
    '{"type":"object","required":["repo","workflow"],"properties":{"repo":{"type":"string","description":"owner/repo, e.g. myuser/my-project"},"workflow":{"type":"string","description":"Workflow filename or ID, e.g. deploy.yml"},"ref":{"type":"string","description":"Branch or tag to run on (default: repo default branch)"}}}',
    false,
    10
  ),
  (
    'issue-create',
    'Create Issue',
    'Open a new GitHub issue in a repository.',
    'alert-circle',
    'github.issue.create',
    '{"type":"object","required":["repo","title"],"properties":{"repo":{"type":"string","description":"owner/repo, e.g. myuser/my-project"},"title":{"type":"string"},"body":{"type":"string"}}}',
    false,
    20
  ),
  (
    'repo-star',
    'Star Repository',
    'Star a GitHub repository.',
    'star',
    'github.repo.star',
    '{"type":"object","required":["repo"],"properties":{"repo":{"type":"string","description":"owner/repo, e.g. myuser/my-project"}}}',
    false,
    30
  )
) AS t(slug, name, description, icon, action_id, params_schema, requires_confirmation, sort_order)
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
