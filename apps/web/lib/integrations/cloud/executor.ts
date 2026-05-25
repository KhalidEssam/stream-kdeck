import { getSupabaseAdmin } from '../../supabase-admin';
import {
  CatalogPlugin,
  CatalogTool,
  getPluginById,
  getToolById,
  isPluginInstalled,
} from '../catalog';
import { getProvider } from '../oauth/providers';
import { getFreshAccessToken } from '../oauth/refresh';
import { twitchAdapter } from './providers/twitch';
import { githubAdapter } from './providers/github';

export interface CloudActionRequest {
  userId: string;
  pluginId: string;
  toolId: string;
  actionId: string;
  params: Record<string, unknown>;
  confirmed?: boolean;
}

export interface CloudActionResult {
  success: boolean;
  output?: string;
  error?: string;
}

interface CloudProviderAdapter {
  execute(input: {
    actionId: string;
    params: Record<string, unknown>;
    accessToken: string;
    providerAccountId?: string;
    plugin: CatalogPlugin;
    tool: CatalogTool;
  }): Promise<CloudActionResult & { providerRequestId?: string; safeResult?: Record<string, unknown> }>;
}

const PROVIDER_ADAPTERS: Record<string, CloudProviderAdapter | undefined> = {
  twitch: twitchAdapter,
  github: githubAdapter,
};

export async function executeCloudAction(input: CloudActionRequest): Promise<CloudActionResult> {
  const plugin = await getPluginById(input.pluginId);
  const tool = await getToolById(input.pluginId, input.toolId);

  if (!plugin) return { success: false, error: 'Plugin not found' };
  if (!(await isPluginInstalled(input.userId, plugin.id))) {
    return { success: false, error: 'Plugin is not installed' };
  }
  if (!tool || tool.actionId !== input.actionId) {
    return { success: false, error: 'Plugin tool not found' };
  }
  if (tool.executionMode !== 'cloud') {
    return { success: false, error: 'Plugin tool is not a cloud tool' };
  }
  if (tool.status === 'disabled' || tool.status === 'deprecated') {
    return { success: false, error: 'Plugin tool is not available' };
  }

  const validationError = validateParams(input.params, tool.paramsSchema);
  if (validationError) return { success: false, error: validationError };

  if (tool.requiresConfirmation && input.confirmed !== true) {
    return { success: false, error: 'Confirmation required' };
  }

  const provider = getProvider(plugin.slug);
  const token = await getFreshAccessToken({
    userId: input.userId,
    pluginId: plugin.id,
    provider,
  });
  const missingScopes = requiredScopesForAction(input.actionId).filter((scope) => !token.scopes.includes(scope));
  if (missingScopes.length) {
    return { success: false, error: `Reconnect ${plugin.slug} to grant: ${missingScopes.join(', ')}` };
  }

  const adapter = PROVIDER_ADAPTERS[provider.slug];
  if (!adapter) {
    const result = { success: false, error: `Cloud provider adapter not implemented: ${provider.slug}` };
    await recordCloudActionRun(input.userId, plugin.id, tool.id, input.actionId, result);
    return result;
  }

  const result: CloudActionResult & { providerRequestId?: string; safeResult?: Record<string, unknown> } = await adapter.execute({
    actionId: input.actionId,
    params: input.params,
    accessToken: token.accessToken,
    providerAccountId: token.providerAccountId,
    plugin,
    tool,
  }).catch((err: unknown): CloudActionResult => ({
    success: false,
    error: err instanceof Error ? err.message : String(err),
  }));
  await recordCloudActionRun(input.userId, plugin.id, tool.id, input.actionId, result);
  return {
    success: result.success,
    output: result.output,
    error: result.error,
  };
}

async function recordCloudActionRun(
  userId: string,
  pluginId: string,
  toolId: string,
  actionId: string,
  result: CloudActionResult & { providerRequestId?: string; safeResult?: Record<string, unknown> },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('integration_action_runs').insert({
    user_id: userId,
    plugin_id: pluginId,
    tool_id: toolId,
    action_id: actionId,
    execution_mode: 'cloud',
    status: result.success ? 'success' : 'error',
    provider_request_id: result.providerRequestId ?? null,
    safe_result: result.safeResult ?? {},
    error_code: result.success ? null : result.error ?? 'CLOUD_ACTION_FAILED',
  });

  if (error) {
    console.warn('[web] Failed to record cloud action run', error.message);
  }
}

function validateParams(params: Record<string, unknown>, schema: Record<string, unknown>): string | null {
  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = isRecord(schema.properties) ? schema.properties : undefined;

  for (const field of required) {
    if (typeof field !== 'string') continue;
    const value = params[field];
    if (value === undefined || value === null || value === '') {
      return `Missing required param: ${field}`;
    }
  }

  if (!properties) return null;

  for (const [field, rawPropSchema] of Object.entries(properties)) {
    if (!isRecord(rawPropSchema)) continue;
    const value = params[field];
    if (value === undefined || value === null || value === '') continue;

    const expectedType = typeof rawPropSchema.type === 'string' ? rawPropSchema.type : undefined;
    if (expectedType && !valueMatchesType(value, expectedType)) {
      return `Invalid type for param '${field}': expected ${expectedType}, got ${typeof value}`;
    }

    const allowedValues = Array.isArray(rawPropSchema.enum) ? rawPropSchema.enum : undefined;
    if (allowedValues && !allowedValues.includes(value)) {
      return `Invalid value for param '${field}': must be one of [${allowedValues.join(', ')}]`;
    }
  }

  return null;
}

function valueMatchesType(value: unknown, expectedType: string): boolean {
  if (typeof value === expectedType) return true;
  if (expectedType === 'number' && typeof value === 'string') return Number.isFinite(Number(value));
  if (expectedType === 'boolean' && typeof value === 'string') return value === 'true' || value === 'false';
  return false;
}

function requiredScopesForAction(actionId: string): string[] {
  switch (actionId) {
    case 'twitch.clip.create':
      return ['clips:edit'];
    case 'twitch.marker.create':
    case 'twitch.channel.update':
      return ['channel:manage:broadcast'];
    case 'twitch.chat.send':
      return ['user:write:chat'];
    case 'github.workflow.dispatch':
    case 'github.issue.create':
    case 'github.repo.star':
      return ['repo'];
    default:
      return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
