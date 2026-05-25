import { getSupabaseAdmin } from '../supabase-admin';

export interface CatalogPlugin {
  id: string;
  slug: string;
  connectorType: string | null;
  requiresConnector: boolean;
  status: string;
}

export interface CatalogTool {
  id: string;
  pluginId: string;
  actionId: string;
  executionMode: string;
  paramsSchema: Record<string, unknown>;
  requiresConfirmation: boolean;
  status: string;
}

interface RawPlugin {
  id: string;
  slug: string;
  connector_type: string | null;
  requires_connector: boolean;
  status: string;
}

interface RawTool {
  id: string;
  plugin_id: string;
  action_id: string;
  execution_mode: string;
  params_schema: Record<string, unknown> | null;
  requires_confirmation: boolean;
  status: string;
}

export async function getPluginBySlug(slug: string): Promise<CatalogPlugin | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('integration_plugins')
    .select('id, slug, connector_type, requires_connector, status')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return null;
  return mapPlugin(data as RawPlugin);
}

export async function getPluginById(pluginId: string): Promise<CatalogPlugin | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('integration_plugins')
    .select('id, slug, connector_type, requires_connector, status')
    .eq('id', pluginId)
    .maybeSingle();

  if (error || !data) return null;
  return mapPlugin(data as RawPlugin);
}

export async function getToolByActionId(pluginId: string, actionId: string): Promise<CatalogTool | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('integration_tools')
    .select('id, plugin_id, action_id, execution_mode, params_schema, requires_confirmation, status')
    .eq('plugin_id', pluginId)
    .eq('action_id', actionId)
    .maybeSingle();

  if (error || !data) return null;
  return mapTool(data as RawTool);
}

export async function getToolById(pluginId: string, toolId: string): Promise<CatalogTool | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('integration_tools')
    .select('id, plugin_id, action_id, execution_mode, params_schema, requires_confirmation, status')
    .eq('plugin_id', pluginId)
    .eq('id', toolId)
    .maybeSingle();

  if (error || !data) return null;
  return mapTool(data as RawTool);
}

export async function isPluginInstalled(userId: string, pluginId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_plugin_installs')
    .select('plugin_id')
    .eq('user_id', userId)
    .eq('plugin_id', pluginId)
    .eq('status', 'installed')
    .is('deleted_at', null)
    .maybeSingle();

  return !error && !!data;
}

function mapPlugin(raw: RawPlugin): CatalogPlugin {
  return {
    id: raw.id,
    slug: raw.slug,
    connectorType: raw.connector_type,
    requiresConnector: raw.requires_connector,
    status: raw.status,
  };
}

function mapTool(raw: RawTool): CatalogTool {
  return {
    id: raw.id,
    pluginId: raw.plugin_id,
    actionId: raw.action_id,
    executionMode: raw.execution_mode,
    paramsSchema: raw.params_schema ?? {},
    requiresConfirmation: raw.requires_confirmation,
    status: raw.status,
  };
}
