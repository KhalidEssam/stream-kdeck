import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LicenseService } from '../license/license.service';
import ws from 'ws';

const PLUGIN_INSTALL_REQUEST_TIMEOUT_MS = 12000;

export interface PluginInstallResult {
  success: boolean;
  error?: string;
}

type MaybeAbortableRequest<T> = PromiseLike<T> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<T>;
};

@Injectable()
export class PluginInstallService {
  private readonly supabase: SupabaseClient;
  private installedIds = new Set<string>();

  constructor(private readonly licenseService: LicenseService) {
    this.supabase = createClient(
      process.env.SUPABASE_URL || 'http://localhost:54321',
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'anon-key',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { realtime: { transport: ws as any } },
    );
  }

  async fetchInstalled(): Promise<void> {
    const userId = await this.resolveUserId();
    if (!userId) return;
    const supabase = await this.getAuthorizedClient();
    if (!supabase) return;

    let response: { data: Array<{ plugin_id: string }> | null; error: { message: string } | null };
    try {
      response = await this.runSupabaseRequest(
        supabase
          .from('user_plugin_installs')
          .select('plugin_id')
          .eq('user_id', userId)
          .eq('status', 'installed')
          .is('deleted_at', null),
      );
    } catch (err) {
      console.warn('[PluginInstall] Failed to fetch installs:', this.formatRequestError(err, 'fetch'));
      return;
    }

    const { data, error } = response;

    if (error) {
      console.warn('[PluginInstall] Failed to fetch installs:', error.message);
      return;
    }

    this.installedIds = new Set((data ?? []).map((r: { plugin_id: string }) => r.plugin_id));
  }

  async install(pluginId: string): Promise<PluginInstallResult> {
    const userId = await this.resolveUserId();
    if (!userId) return { success: false, error: 'No licensed user session found on the desktop agent.' };
    const supabase = await this.getAuthorizedClient();
    if (!supabase) return { success: false, error: 'Supabase is not configured for plugin installs.' };

    let response: { error: { message: string } | null };
    try {
      response = await this.runSupabaseRequest(
        supabase
          .from('user_plugin_installs')
          .upsert(
            { user_id: userId, plugin_id: pluginId, status: 'installed', deleted_at: null, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,plugin_id' },
          ),
      );
    } catch (err) {
      const error = this.formatRequestError(err, 'install');
      console.warn('[PluginInstall] Failed to install:', error);
      return { success: false, error };
    }

    const { error } = response;

    if (error) {
      console.warn('[PluginInstall] Failed to install:', error.message);
      return { success: false, error: error.message };
    }

    this.installedIds.add(pluginId);
    return { success: true };
  }

  async uninstall(pluginId: string): Promise<PluginInstallResult> {
    const userId = await this.resolveUserId();
    if (!userId) return { success: false, error: 'No licensed user session found on the desktop agent.' };
    const supabase = await this.getAuthorizedClient();
    if (!supabase) return { success: false, error: 'Supabase is not configured for plugin installs.' };

    let response: { error: { message: string } | null };
    try {
      response = await this.runSupabaseRequest(
        supabase
          .from('user_plugin_installs')
          .upsert(
            { user_id: userId, plugin_id: pluginId, status: 'uninstalled', deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() },
            { onConflict: 'user_id,plugin_id' },
          ),
      );
    } catch (err) {
      const error = this.formatRequestError(err, 'uninstall');
      console.warn('[PluginInstall] Failed to uninstall:', error);
      return { success: false, error };
    }

    const { error } = response;

    if (error) {
      console.warn('[PluginInstall] Failed to uninstall:', error.message);
      return { success: false, error: error.message };
    }

    this.installedIds.delete(pluginId);
    return { success: true };
  }

  getInstalledPluginIds(): string[] {
    return Array.from(this.installedIds);
  }

  isInstalled(pluginId: string): boolean {
    return this.installedIds.has(pluginId);
  }

  private async getAuthorizedClient(): Promise<SupabaseClient | null> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;

    if (serviceKey) return this.supabase;
    if (!supabaseUrl || !anonKey) return null;

    const accessToken = await this.licenseService.getAccessToken();
    if (!accessToken) return null;

    return createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      realtime: { transport: ws as any },
    });
  }

  private async resolveUserId(): Promise<string | null> {
    const cachedUserId = this.licenseService.getUserId();
    if (cachedUserId) return cachedUserId;

    const accessToken = await this.licenseService.getAccessToken();
    if (!accessToken) return null;

    try {
      const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()) as { sub?: string };
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }

  private async runSupabaseRequest<T>(request: MaybeAbortableRequest<T>): Promise<T> {
    if (!request.abortSignal) return request;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PLUGIN_INSTALL_REQUEST_TIMEOUT_MS);
    try {
      return await request.abortSignal(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  private formatRequestError(err: unknown, action: string): string {
    if (err instanceof Error && err.name === 'AbortError') {
      return `Plugin ${action} timed out. Check the desktop agent network and Supabase configuration.`;
    }
    return err instanceof Error ? err.message : String(err);
  }
}
