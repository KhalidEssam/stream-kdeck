import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';
import { DeviceFingerprintService } from '../license/device-fingerprint.service';
import { LicenseService } from '../license/license.service';

export type ConnectionMetadata = Record<string, unknown>;

@Injectable()
export class ConnectorService {
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly licenseService: LicenseService,
    private readonly deviceFingerprint: DeviceFingerprintService,
  ) {
    this.supabase = createClient(
      process.env.SUPABASE_URL || 'http://localhost:54321',
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'anon-key',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { realtime: { transport: ws as any } },
    );
  }

  async getDeviceConnection(pluginId: string): Promise<ConnectionMetadata | null> {
    const userId = await this.resolveUserId();
    const deviceId = this.deviceFingerprint.getFingerprint();
    if (!userId || !deviceId) return null;
    const supabase = await this.getAuthorizedClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('user_device_connections')
      .select('metadata, status')
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .eq('plugin_id', pluginId)
      .single();

    if (error || data?.status !== 'connected') return null;
    return data.metadata as ConnectionMetadata;
  }

  async setDeviceConnection(pluginId: string, metadata: ConnectionMetadata): Promise<void> {
    const userId = await this.resolveUserId();
    const deviceId = this.deviceFingerprint.getFingerprint();
    if (!userId || !deviceId) return;
    const supabase = await this.getAuthorizedClient();
    if (!supabase) return;

    const { error } = await supabase
      .from('user_device_connections')
      .upsert(
        {
          user_id: userId,
          device_id: deviceId,
          plugin_id: pluginId,
          status: 'connected',
          metadata,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_id,plugin_id' },
      );

    if (error) {
      console.warn('[Connector] Failed to set device connection:', error.message);
    }
  }

  async clearDeviceConnection(pluginId: string): Promise<void> {
    const userId = await this.resolveUserId();
    const deviceId = this.deviceFingerprint.getFingerprint();
    if (!userId || !deviceId) return;
    const supabase = await this.getAuthorizedClient();
    if (!supabase) return;

    const { error } = await supabase
      .from('user_device_connections')
      .upsert(
        {
          user_id: userId,
          device_id: deviceId,
          plugin_id: pluginId,
          status: 'not_configured',
          metadata: {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_id,plugin_id' },
      );

    if (error) {
      console.warn('[Connector] Failed to clear device connection:', error.message);
    }
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
}
