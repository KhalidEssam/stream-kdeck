import { Injectable } from '@nestjs/common';
import OBSWebSocket from 'obs-websocket-js';
import { CommandResult } from '../../command/command.service';
import { ConnectorService } from '../connector.service';
import { IntegrationAdapter, IntegrationState } from '../integration.adapter';
import { PluginCatalogService } from '../plugin-catalog.service';

const OBS_PLUGIN_SLUG = 'obs';

const SUPPORTED_ACTIONS = new Set([
  'obs.stream.toggle',
  'obs.stream.start',
  'obs.stream.stop',
  'obs.record.toggle',
  'obs.record.start',
  'obs.record.stop',
  'obs.scene.switch',
  'obs.source.toggle',
]);

interface ObsConnection {
  host: string;
  port: number;
  password: string;
}

interface ObsSceneItem {
  sourceName: string;
  sceneItemId: number;
  sceneItemEnabled: boolean;
}

@Injectable()
export class ObsService implements IntegrationAdapter {
  readonly pluginSlug = OBS_PLUGIN_SLUG;

  private obs = new OBSWebSocket();
  private connected = false;

  constructor(
    private readonly connector: ConnectorService,
    private readonly pluginCatalog: PluginCatalogService,
  ) {}

  canExecute(actionId: string): boolean {
    return SUPPORTED_ACTIONS.has(actionId);
  }

  async execute(actionId: string, params: Record<string, unknown>): Promise<CommandResult> {
    try {
      const connMeta = await this.connector.getDeviceConnection(this.getPluginId());
      if (!connMeta) return { success: false, error: 'OBS not connected. Configure the connection first.' };

      await this.ensureConnected(this.normalizeConnection(connMeta));

      switch (actionId) {
        case 'obs.stream.toggle': {
          const status = await this.obs.call('GetStreamStatus') as unknown as { outputActive: boolean };
          await this.obs.call(status.outputActive ? 'StopStream' : 'StartStream');
          break;
        }

        case 'obs.stream.start':
          await this.obs.call('StartStream');
          break;

        case 'obs.stream.stop':
          await this.obs.call('StopStream');
          break;

        case 'obs.record.toggle': {
          const status = await this.obs.call('GetRecordStatus') as unknown as { outputActive: boolean };
          await this.obs.call(status.outputActive ? 'StopRecord' : 'StartRecord');
          break;
        }

        case 'obs.record.start':
          await this.obs.call('StartRecord');
          break;

        case 'obs.record.stop':
          await this.obs.call('StopRecord');
          break;

        case 'obs.scene.switch': {
          const sceneName = params.sceneName as string;
          await this.obs.call('SetCurrentProgramScene', { sceneName });
          break;
        }

        case 'obs.source.toggle': {
          const { sceneName, sourceName } = params as { sceneName: string; sourceName: string };
          const result = await this.obs.call('GetSceneItemList', { sceneName }) as unknown as { sceneItems: ObsSceneItem[] };
          const item = result.sceneItems.find((entry) => entry.sourceName === sourceName);
          if (!item) return { success: false, error: `Source "${sourceName}" not found in scene "${sceneName}"` };
          await this.obs.call('SetSceneItemEnabled', {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemEnabled: !item.sceneItemEnabled,
          });
          break;
        }

        default:
          return { success: false, error: `Unknown OBS actionId: ${actionId}` };
      }

      return { success: true };
    } catch (err) {
      this.connected = false;
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async getState(): Promise<IntegrationState[]> {
    const connMeta = await this.connector.getDeviceConnection(this.getPluginId());
    if (!connMeta) return [];

    try {
      await this.ensureConnected(this.normalizeConnection(connMeta));

      const [streamStatus, recordStatus, sceneList] = await Promise.all([
        this.obs.call('GetStreamStatus') as Promise<{ outputActive: boolean }>,
        this.obs.call('GetRecordStatus') as Promise<{ outputActive: boolean }>,
        this.obs.call('GetSceneList') as Promise<{ currentProgramSceneName: string }>,
      ]);

      const now = new Date().toISOString();
      return [
        {
          key: 'streaming',
          value: streamStatus.outputActive,
          label: streamStatus.outputActive ? 'Live' : 'Offline',
          updatedAt: now,
        },
        {
          key: 'recording',
          value: recordStatus.outputActive,
          label: recordStatus.outputActive ? 'Recording' : '',
          updatedAt: now,
        },
        {
          key: 'scene',
          value: sceneList.currentProgramSceneName,
          label: sceneList.currentProgramSceneName,
          updatedAt: now,
        },
      ];
    } catch {
      this.connected = false;
      return [];
    }
  }

  async testConnection(metadata: Record<string, unknown>): Promise<CommandResult> {
    const testClient = new OBSWebSocket();
    try {
      const conn = this.normalizeConnection(metadata);
      await testClient.connect(`ws://${conn.host}:${conn.port}`, conn.password || undefined);
      await testClient.call('GetVersion');
      await testClient.disconnect();
      return { success: true };
    } catch (err) {
      try {
        await testClient.disconnect();
      } catch {
        // Best effort cleanup after a failed connection attempt.
      }
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async ensureConnected(conn: ObsConnection): Promise<void> {
    if (this.connected) return;
    await this.obs.connect(`ws://${conn.host}:${conn.port}`, conn.password || undefined);
    this.connected = true;
  }

  private getPluginId(): string {
    return this.pluginCatalog.getPlugin(OBS_PLUGIN_SLUG)?.id ?? OBS_PLUGIN_SLUG;
  }

  private normalizeConnection(metadata: Record<string, unknown>): ObsConnection {
    const host = typeof metadata.host === 'string' && metadata.host.trim()
      ? metadata.host.trim()
      : 'localhost';
    const rawPort = typeof metadata.port === 'number'
      ? metadata.port
      : Number(metadata.port);
    const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 4455;
    const password = typeof metadata.password === 'string' ? metadata.password : '';
    return { host, port, password };
  }
}
