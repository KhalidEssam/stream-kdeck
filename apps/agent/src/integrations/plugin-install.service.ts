import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LicenseService } from '../license/license.service';
import ws from 'ws';

@Injectable()
export class PluginInstallService {
  private readonly supabase: SupabaseClient;
  private installedIds = new Set<string>();

  constructor(private readonly licenseService: LicenseService) {
    this.supabase = createClient(
      process.env.SUPABASE_URL ?? '',
      process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { realtime: { transport: ws as any } },
    );
  }

  async fetchInstalled(): Promise<void> {
    const userId = this.licenseService.getUserId();
    if (!userId) return;

    const { data, error } = await this.supabase
      .from('user_plugin_installs')
      .select('plugin_id')
      .eq('user_id', userId)
      .eq('status', 'installed')
      .is('deleted_at', null);

    if (error) {
      console.warn('[PluginInstall] Failed to fetch installs:', error.message);
      return;
    }

    this.installedIds = new Set((data ?? []).map((r: { plugin_id: string }) => r.plugin_id));
  }

  async install(pluginId: string): Promise<void> {
    const userId = this.licenseService.getUserId();
    if (!userId) return;

    const { error } = await this.supabase
      .from('user_plugin_installs')
      .upsert(
        { user_id: userId, plugin_id: pluginId, status: 'installed', deleted_at: null, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,plugin_id' },
      );

    if (error) {
      console.warn('[PluginInstall] Failed to install:', error.message);
      return;
    }

    this.installedIds.add(pluginId);
  }

  async uninstall(pluginId: string): Promise<void> {
    const userId = this.licenseService.getUserId();
    if (!userId) return;

    const { error } = await this.supabase
      .from('user_plugin_installs')
      .upsert(
        { user_id: userId, plugin_id: pluginId, status: 'uninstalled', deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: 'user_id,plugin_id' },
      );

    if (error) {
      console.warn('[PluginInstall] Failed to uninstall:', error.message);
      return;
    }

    this.installedIds.delete(pluginId);
  }

  getInstalledPluginIds(): string[] {
    return Array.from(this.installedIds);
  }

  isInstalled(pluginId: string): boolean {
    return this.installedIds.has(pluginId);
  }
}
