import { getProviderClientId } from '../../oauth/providers';

interface GitHubAdapterInput {
  actionId: string;
  params: Record<string, unknown>;
  accessToken: string;
}

interface GitHubAdapterResult {
  success: boolean;
  output?: string;
  error?: string;
  safeResult?: Record<string, unknown>;
}

export const githubAdapter = {
  async execute(input: GitHubAdapterInput): Promise<GitHubAdapterResult> {
    switch (input.actionId) {
      case 'github.workflow.dispatch':
        return dispatchWorkflow(input);
      case 'github.issue.create':
        return createIssue(input);
      case 'github.repo.star':
        return starRepo(input);
      default:
        return { success: false, error: `Unsupported GitHub action: ${input.actionId}` };
    }
  },
};

async function dispatchWorkflow(input: GitHubAdapterInput): Promise<GitHubAdapterResult> {
  const { owner, repo } = splitRepo(input.params.repo);
  if (!owner || !repo) return { success: false, error: 'Invalid repo format — use owner/repo (e.g. myuser/my-project)' };

  const workflow = stringParam(input.params.workflow);
  if (!workflow) return { success: false, error: 'workflow is required (filename or ID, e.g. deploy.yml)' };

  const ref = stringParam(input.params.ref) ?? 'HEAD';
  const inputs = isRecord(input.params.inputs) ? input.params.inputs : {};

  await githubFetch(input.accessToken, `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref, inputs }),
  });

  return {
    success: true,
    output: `Workflow "${workflow}" triggered on ${owner}/${repo} (${ref}).`,
    safeResult: { owner, repo, workflow, ref },
  };
}

async function createIssue(input: GitHubAdapterInput): Promise<GitHubAdapterResult> {
  const { owner, repo } = splitRepo(input.params.repo);
  if (!owner || !repo) return { success: false, error: 'Invalid repo format — use owner/repo (e.g. myuser/my-project)' };

  const title = stringParam(input.params.title);
  if (!title) return { success: false, error: 'title is required' };

  const body: Record<string, unknown> = { title };
  const bodyText = stringParam(input.params.body);
  if (bodyText) body.body = bodyText;

  const json = await githubFetch(input.accessToken, `https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const issueNumber = typeof json.number === 'number' ? json.number : undefined;
  const issueUrl = stringParam(json.html_url);

  return {
    success: true,
    output: issueUrl
      ? `Issue #${issueNumber} created: ${issueUrl}`
      : `Issue created in ${owner}/${repo}.`,
    safeResult: { owner, repo, number: issueNumber, url: issueUrl },
  };
}

async function starRepo(input: GitHubAdapterInput): Promise<GitHubAdapterResult> {
  const { owner, repo } = splitRepo(input.params.repo);
  if (!owner || !repo) return { success: false, error: 'Invalid repo format — use owner/repo (e.g. myuser/my-project)' };

  await githubFetch(input.accessToken, `https://api.github.com/user/starred/${owner}/${repo}`, {
    method: 'PUT',
    headers: { 'Content-Length': '0' },
  });

  return {
    success: true,
    output: `Starred ${owner}/${repo}.`,
    safeResult: { owner, repo },
  };
}

async function githubFetch(
  accessToken: string,
  url: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  // 204 No Content (workflow dispatch, star) — success with no body
  if (response.status === 204) return {};

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(githubErrorMessage(json, response.status));
  }

  return json;
}

function githubErrorMessage(json: Record<string, unknown>, status: number): string {
  const message = stringParam(json.message);
  return message ?? `GitHub API request failed (${status})`;
}

function splitRepo(value: unknown): { owner: string | null; repo: string | null } {
  const str = stringParam(value);
  if (!str) return { owner: null, repo: null };
  const slash = str.indexOf('/');
  if (slash <= 0 || slash === str.length - 1) return { owner: null, repo: null };
  return { owner: str.slice(0, slash), repo: str.slice(slash + 1) };
}

function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
