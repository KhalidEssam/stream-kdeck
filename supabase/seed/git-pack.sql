-- supabase/seed/git-pack.sql
-- Requires migration 20260523000015_pack_tools_command_support.sql.
-- Run against your Supabase project after migrations:
-- supabase db seed --file supabase/seed/git-pack.sql

BEGIN;

INSERT INTO public.packs (slug, name, description, icon, color, "order")
VALUES (
  'git',
  'Git',
  'Version control tools - AI-powered helpers and one-tap git commands',
  'git',
  '#F05033',
  8
)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    "order" = EXCLUDED."order";

WITH pack AS (
  SELECT id FROM public.packs WHERE slug = 'git'
)
DELETE FROM public.pack_tools
WHERE pack_id = (SELECT id FROM pack);

WITH pack AS (
  SELECT id FROM public.packs WHERE slug = 'git'
)
INSERT INTO public.pack_tools (
  pack_id,
  kind,
  label,
  prompt,
  command,
  output_mode,
  source,
  icon,
  color,
  "order",
  phase,
  builtin_id
) VALUES
  (
    (SELECT id FROM pack),
    'ai',
    'Write Commit Message',
    'Write a concise conventional commit message for the provided git diff or visible changes. Use the format type(scope): summary. Prefer feat, fix, refactor, docs, test, chore, build, ci, perf, or style. Return only the commit message.',
    NULL,
    'clipboard',
    'active_window',
    'git-commit',
    '#F05033',
    1,
    1,
    'git-write-commit-message'
  ),
  (
    (SELECT id FROM pack),
    'ai',
    'Improve Commit Message',
    'Improve this draft commit message. Make it conventional, specific, and concise. Preserve the intent. Return only the improved commit message.',
    NULL,
    'clipboard',
    'clipboard',
    'git-commit',
    '#F05033',
    2,
    1,
    'git-improve-commit-message'
  ),
  (
    (SELECT id FROM pack),
    'ai',
    'Explain This Commit',
    'Explain this commit in plain English. Summarize what changed, why it matters, and any risk a reviewer should notice.',
    NULL,
    'viewer',
    'active_window',
    'git-commit',
    '#F05033',
    3,
    1,
    'git-explain-this-commit'
  ),
  (
    (SELECT id FROM pack),
    'ai',
    'Draft PR Description',
    'Draft a pull request title and body from the provided diff or branch summary. Include summary, key changes, testing notes, and risks. Keep it ready to paste into a PR.',
    NULL,
    'clipboard',
    'active_window',
    'git-pull-request',
    '#F05033',
    4,
    1,
    'git-draft-pr-description'
  ),
  (
    (SELECT id FROM pack),
    'ai',
    'Review This Diff',
    'Review this diff as a senior engineer. Prioritize bugs, regressions, security issues, data loss risks, and missing tests. Be specific and actionable.',
    NULL,
    'viewer',
    'active_window',
    'git-compare',
    '#F05033',
    5,
    1,
    'git-review-this-diff'
  ),
  (
    (SELECT id FROM pack),
    'ai',
    'Summarize Changes',
    'Summarize these changes in one concise paragraph, then list the most important files or behaviors touched.',
    NULL,
    'viewer',
    'active_window',
    'git-compare',
    '#F05033',
    6,
    1,
    'git-summarize-changes'
  ),
  (
    (SELECT id FROM pack),
    'ai',
    'Suggest Branch Name',
    'Suggest a short kebab-case git branch name for this task or ticket. Use a practical prefix like feat, fix, chore, docs, refactor, or test. Return only the branch name.',
    NULL,
    'clipboard',
    'clipboard',
    'git-branch',
    '#F05033',
    7,
    1,
    'git-suggest-branch-name'
  ),
  (
    (SELECT id FROM pack),
    'ai',
    'Summarize This Branch',
    'Summarize what this branch changed compared with main. Group related commits and mention likely review focus areas.',
    NULL,
    'viewer',
    'shell',
    'git-branch',
    '#F05033',
    8,
    1,
    'git-summarize-this-branch'
  ),
  (
    (SELECT id FROM pack),
    'ai',
    'Explain Recent Commits',
    'Explain the recent git commit history in plain English. Identify themes, notable changes, and anything that looks risky or unusual.',
    NULL,
    'viewer',
    'shell',
    'git-log',
    '#F05033',
    9,
    1,
    'git-explain-recent-commits'
  ),
  (
    (SELECT id FROM pack),
    'ai',
    'Find When Bug Was Introduced',
    'Given this bug or error description, suggest a focused git investigation plan. Include likely git log, git blame, and git bisect commands where useful.',
    NULL,
    'viewer',
    'clipboard',
    'git-branch',
    '#F05033',
    10,
    1,
    'git-find-bug-introduced'
  ),
  (
    (SELECT id FROM pack),
    'ai',
    'Explain This Conflict',
    'Explain this merge conflict. Identify each side of the conflict, what changed, and the likely intent behind both versions.',
    NULL,
    'viewer',
    'active_window',
    'git-merge',
    '#F05033',
    11,
    1,
    'git-explain-conflict'
  ),
  (
    (SELECT id FROM pack),
    'ai',
    'Suggest Conflict Resolution',
    'Suggest a resolved version for this merge conflict. Preserve both sides where appropriate and explain any assumptions briefly after the resolved code.',
    NULL,
    'clipboard',
    'active_window',
    'git-merge',
    '#F05033',
    12,
    1,
    'git-suggest-conflict-resolution'
  ),
  (
    (SELECT id FROM pack),
    'ai',
    'What Does This Repo Do?',
    'Explain what this repository does based on the visible README, package metadata, files, or project structure. Keep it practical and beginner-friendly.',
    NULL,
    'viewer',
    'active_window',
    'repo',
    '#F05033',
    13,
    1,
    'git-what-does-this-repo-do'
  ),
  (
    (SELECT id FROM pack),
    'ai',
    'How Do I Run This Project?',
    'Extract setup and run instructions from the visible README, package.json, Makefile, or project files. Include install, dev, test, and build commands when available.',
    NULL,
    'viewer',
    'active_window',
    'terminal',
    '#F05033',
    14,
    1,
    'git-how-run-project'
  ),
  (
    (SELECT id FROM pack),
    'command',
    'Git Status',
    '',
    'git status',
    'viewer',
    'shell',
    'terminal',
    '#F05033',
    15,
    1,
    'git-status'
  ),
  (
    (SELECT id FROM pack),
    'command',
    'Git Pull',
    '',
    'git pull',
    'viewer',
    'shell',
    'terminal',
    '#F05033',
    16,
    1,
    'git-pull'
  ),
  (
    (SELECT id FROM pack),
    'command',
    'Git Push',
    '',
    'git push',
    'viewer',
    'shell',
    'terminal',
    '#F05033',
    17,
    1,
    'git-push'
  ),
  (
    (SELECT id FROM pack),
    'command',
    'Git Stash',
    '',
    'git stash',
    'silent',
    'shell',
    'terminal',
    '#F05033',
    18,
    1,
    'git-stash'
  ),
  (
    (SELECT id FROM pack),
    'command',
    'Git Stash Pop',
    '',
    'git stash pop',
    'viewer',
    'shell',
    'terminal',
    '#F05033',
    19,
    1,
    'git-stash-pop'
  ),
  (
    (SELECT id FROM pack),
    'command',
    'Git Log',
    '',
    'git log --oneline -20',
    'viewer',
    'shell',
    'terminal',
    '#F05033',
    20,
    1,
    'git-log'
  );

COMMIT;

