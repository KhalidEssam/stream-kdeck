import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IntegrationPlugin, IntegrationTool, PluginStatus } from '@control-surface/shared';
import ws from 'ws';
import { platform } from 'os';
import { AGENT_CAPABILITY } from '../packs/pack-registry.service';

const VISIBLE_STATUSES: PluginStatus[] = ['published'];

interface RawTool {
  id: string; plugin_id: string; slug: string; name: string; description: string | null;
  icon: string | null; color: string | null; action_id: string; execution_mode: string;
  params_schema: Record<string, unknown>; result_schema: Record<string, unknown>;
  supports_workflows: boolean; supports_state: boolean; requires_confirmation: boolean;
  min_agent_capability: number; sort_order: number; status: string;
}

interface RawPlugin {
  id: string; slug: string; name: string; description: string | null;
  category: string; icon: string; color: string | null; publisher: string;
  version: string; status: string; min_agent_capability: number;
  min_mobile_capability: number; supported_platforms: string[];
  requires_connector: boolean; connector_type: string | null; sort_order: number;
  integration_tools: RawTool[];
}

@Injectable()
export class PluginCatalogService {
  private readonly supabase: SupabaseClient;
  private plugins: IntegrationPlugin[] = [];

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL || 'http://localhost:54321',
      process.env.SUPABASE_ANON_KEY || 'anon-key',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { realtime: { transport: ws as any } },
    );
  }

  async load(): Promise<void> {
    try {
      const os = platform();
      const { data, error } = await this.supabase
        .from('integration_plugins')
        .select('*, integration_tools(*)')
        .lte('min_agent_capability', AGENT_CAPABILITY);

      if (error || !data) {
        console.warn('[PluginCatalog] Failed to load:', error?.message);
        return;
      }

      this.plugins = (data as RawPlugin[])
        .filter((p) => VISIBLE_STATUSES.includes(p.status as PluginStatus))
        .filter((p) => p.min_agent_capability <= AGENT_CAPABILITY)
        .filter((p) => p.supported_platforms.includes(os))
        .map((raw) => this.mapPlugin(raw))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      console.log(`[PluginCatalog] Loaded ${this.plugins.length} plugins`);
    } catch (err) {
      console.warn('[PluginCatalog] Unexpected error:', err);
    }
  }

  getPlugins(): IntegrationPlugin[] {
    return this.plugins;
  }

  getPlugin(slug: string): IntegrationPlugin | undefined {
    return this.plugins.find((p) => p.slug === slug);
  }

  private mapPlugin(raw: RawPlugin): IntegrationPlugin {
    const tools: IntegrationTool[] = (raw.integration_tools ?? [])
      .filter((t) => (VISIBLE_STATUSES as string[]).includes(t.status))
      .filter((t) => t.min_agent_capability <= AGENT_CAPABILITY)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => ({
        id: t.id, pluginId: t.plugin_id, slug: t.slug, name: t.name,
        description: t.description ?? undefined, icon: t.icon ?? undefined,
        color: t.color ?? undefined, actionId: t.action_id,
        executionMode: t.execution_mode as IntegrationTool['executionMode'],
        paramsSchema: t.params_schema ?? {}, supportsWorkflows: t.supports_workflows,
        supportsState: t.supports_state, requiresConfirmation: t.requires_confirmation,
        minAgentCapability: t.min_agent_capability, sortOrder: t.sort_order,
        status: t.status as PluginStatus,
      }));

    return {
      id: raw.id, slug: raw.slug, name: raw.name,
      description: raw.description ?? undefined, category: raw.category,
      icon: raw.icon, color: raw.color ?? undefined, publisher: raw.publisher,
      version: raw.version, status: raw.status as PluginStatus,
      minAgentCapability: raw.min_agent_capability,
      minMobileCapability: raw.min_mobile_capability,
      supportedPlatforms: raw.supported_platforms,
      requiresConnector: raw.requires_connector,
      connectorType: raw.connector_type as IntegrationPlugin['connectorType'],
      sortOrder: raw.sort_order, tools,
    };
  }
}
