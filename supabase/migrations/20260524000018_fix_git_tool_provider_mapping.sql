-- Fix incorrect provider mappings introduced in migration 20260523000016.
-- "Explain Recent Commits" and "Summarize This Branch" were mapped to
-- active_terminal (which only returns CWD) instead of git (which runs
-- git log/status and returns actual output).

UPDATE public.pack_tools
SET context_requirements = '[{"provider":"git","required":true,"reason":"Git commit history to explain"}]'
WHERE builtin_id = 'git-explain-recent-commits';

UPDATE public.pack_tools
SET context_requirements = '[{"provider":"git","required":true,"reason":"Git branch and commit history"}]'
WHERE builtin_id = 'git-summarize-this-branch';
