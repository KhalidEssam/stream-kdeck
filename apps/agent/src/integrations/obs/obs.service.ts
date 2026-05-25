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
  'obs.replay.toggle',
  'obs.replay.start',
  'obs.replay.stop',
  'obs.replay.save',
  'obs.virtual_camera.toggle',
  'obs.virtual_camera.start',
  'obs.virtual_camera.stop',
  'obs.studio_mode.toggle',
  'obs.studio_mode.enable',
  'obs.studio_mode.disable',
  'obs.input.mute.toggle',
  'obs.input.mute.set',
  'obs.input.volume.set',
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

        case 'obs.replay.toggle':
          await this.obs.call('ToggleReplayBuffer');
          break;

        case 'obs.replay.start':
          await this.obs.call('StartReplayBuffer');
          break;

        case 'obs.replay.stop':
          await this.obs.call('StopReplayBuffer');
          break;

        case 'obs.replay.save':
          await this.obs.call('SaveReplayBuffer');
          break;

        case 'obs.virtual_camera.toggle':
          await this.obs.call('ToggleVirtualCam');
          break;

        case 'obs.virtual_camera.start':
          await this.obs.call('StartVirtualCam');
          break;

        case 'obs.virtual_camera.stop':
          await this.obs.call('StopVirtualCam');
          break;

        case 'obs.studio_mode.toggle': {
          const status = await this.obs.call('GetStudioModeEnabled') as unknown as { studioModeEnabled: boolean };
          await this.obs.call('SetStudioModeEnabled', { studioModeEnabled: !status.studioModeEnabled });
          break;
        }

        case 'obs.studio_mode.enable':
          await this.obs.call('SetStudioModeEnabled', { studioModeEnabled: true });
          break;

        case 'obs.studio_mode.disable':
          await this.obs.call('SetStudioModeEnabled', { studioModeEnabled: false });
          break;

        case 'obs.input.mute.toggle': {
          const inputName = this.requireStringParam(params, 'inputName');
          await this.obs.call('ToggleInputMute', { inputName });
          break;
        }

        case 'obs.input.mute.set': {
          const inputName = this.requireStringParam(params, 'inputName');
          const inputMuted = this.requireBooleanParam(params, 'muted');
          await this.obs.call('SetInputMute', { inputName, inputMuted });
          break;
        }

        case 'obs.input.volume.set': {
          const inputName = this.requireStringParam(params, 'inputName');
          const inputVolumeMul = this.requireVolumeParam(params);
          await this.obs.call('SetInputVolume', { inputName, inputVolumeMul });
          break;
        }

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
      const [replayBufferActive, virtualCameraActive, studioModeEnabled] = await Promise.all([
        this.getOptionalOutputActive('GetReplayBufferStatus'),
        this.getOptionalOutputActive('GetVirtualCamStatus'),
        this.getOptionalStudioModeEnabled(),
      ]);

      const now = new Date().toISOString();
      const states: IntegrationState[] = [
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

      if (replayBufferActive !== null) {
        states.push({
          key: 'replayBufferActive',
          value: replayBufferActive,
          label: replayBufferActive ? 'Replay On' : '',
          updatedAt: now,
        });
      }

      if (virtualCameraActive !== null) {
        states.push({
          key: 'virtualCameraActive',
          value: virtualCameraActive,
          label: virtualCameraActive ? 'Virtual Cam' : '',
          updatedAt: now,
        });
      }

      if (studioModeEnabled !== null) {
        states.push({
          key: 'studioModeEnabled',
          value: studioModeEnabled,
          label: studioModeEnabled ? 'Studio' : '',
          updatedAt: now,
        });
      }

      return states;
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

  private requireStringParam(params: Record<string, unknown>, key: string): string {
    const value = params[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Missing required OBS param: ${key}`);
    }
    return value.trim();
  }

  private requireBooleanParam(params: Record<string, unknown>, key: string): boolean {
    const value = params[key];
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`Missing required OBS boolean param: ${key}`);
  }

  private requireVolumeParam(params: Record<string, unknown>): number {
    const rawValue = params.volume;
    const volume = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(volume)) {
      throw new Error('Missing required OBS numeric param: volume');
    }
    return Math.max(0, Math.min(1, volume));
  }

  private async getOptionalOutputActive(
    requestType: 'GetReplayBufferStatus' | 'GetVirtualCamStatus',
  ): Promise<boolean | null> {
    try {
      const status = await this.obs.call(requestType) as unknown as { outputActive: boolean };
      return Boolean(status.outputActive);
    } catch {
      return null;
    }
  }

  private async getOptionalStudioModeEnabled(): Promise<boolean | null> {
    try {
      const status = await this.obs.call('GetStudioModeEnabled') as unknown as { studioModeEnabled: boolean };
      return Boolean(status.studioModeEnabled);
    } catch {
      return null;
    }
  }
}
