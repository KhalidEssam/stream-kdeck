-- Add context_requirements column, populate git pack tools, drop legacy source column.
--
-- context_requirements replaces source as the sole AI context driver.
-- Each entry: { "provider": string, "required": boolean, "reason": string, "maxBytes"?: number }

ALTER TABLE public.pack_tools
  ADD COLUMN IF NOT EXISTS context_requirements jsonb;

-- Git pack: tools that were active_window
UPDATE public.pack_tools SET context_requirements = '[
  {"provider":"active_window","required":true,"reason":"Git diff or changed files to write commit message for"}
]'::jsonb WHERE builtin_id = 'git-write-commit-message';

UPDATE public.pack_tools SET context_requirements = '[
  {"provider":"active_window","required":true,"reason":"Commit diff to explain"}
]'::jsonb WHERE builtin_id = 'git-explain-this-commit';

UPDATE public.pack_tools SET context_requirements = '[
  {"provider":"active_window","required":true,"reason":"Branch diff or changed files to draft PR from"},
  {"provider":"git","required":false,"reason":"Git branch and commit metadata"}
]'::jsonb WHERE builtin_id = 'git-draft-pr-description';

UPDATE public.pack_tools SET context_requirements = '[
  {"provider":"active_window","required":true,"reason":"Diff to review as senior engineer"}
]'::jsonb WHERE builtin_id = 'git-review-this-diff';

UPDATE public.pack_tools SET context_requirements = '[
  {"provider":"active_window","required":true,"reason":"Changed files or diff to summarize"}
]'::jsonb WHERE builtin_id = 'git-summarize-changes';

UPDATE public.pack_tools SET context_requirements = '[
  {"provider":"active_window","required":true,"reason":"Merge conflict markers to explain"}
]'::jsonb WHERE builtin_id = 'git-explain-conflict';

UPDATE public.pack_tools SET context_requirements = '[
  {"provider":"active_window","required":true,"reason":"Merge conflict to suggest resolution for"}
]'::jsonb WHERE builtin_id = 'git-suggest-conflict-resolution';

-- Git pack: tools that were shell (active_terminal)
UPDATE public.pack_tools SET context_requirements = '[
  {"provider":"active_terminal","required":true,"reason":"Git log output to summarize branch history"},
  {"provider":"git","required":false,"reason":"Git branch and commit metadata"}
]'::jsonb WHERE builtin_id = 'git-summarize-this-branch';

UPDATE public.pack_tools SET context_requirements = '[
  {"provider":"active_terminal","required":true,"reason":"Git log output to explain recent history"}
]'::jsonb WHERE builtin_id = 'git-explain-recent-commits';

-- Git pack: tools that were active_window but need project_files
UPDATE public.pack_tools SET context_requirements = '[
  {"provider":"project_files","required":true,"reason":"README and project structure files"}
]'::jsonb WHERE builtin_id = 'git-what-does-this-repo-do';

UPDATE public.pack_tools SET context_requirements = '[
  {"provider":"project_files","required":true,"reason":"README, package.json, Makefile, and setup files"}
]'::jsonb WHERE builtin_id = 'git-how-run-project';

-- Drop the legacy source column (no longer read by application code).
-- Inline CHECK constraint is dropped automatically with the column.
ALTER TABLE public.pack_tools
  DROP COLUMN IF EXISTS source;
