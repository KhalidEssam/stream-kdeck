import type { IntegrationPlugin, IntegrationTool, TileConfig } from '../types/schema';

export type PluginToolView = IntegrationTool & {
  deckActionId: string;
  displayName: string;
  tileLabel: string;
  selectedActionIds: string[];
};

export type IntegrationTileAction = Extract<TileConfig['action'], { kind: 'INTEGRATION_ACTION' }>;

const HIDDEN_OBS_TOOL_ACTION_IDS = new Set(['obs.stream.stop', 'obs.record.stop']);
const OBS_STREAM_ACTION_IDS = ['obs.stream.toggle', 'obs.stream.start', 'obs.stream.stop'];
const OBS_RECORD_ACTION_IDS = ['obs.record.toggle', 'obs.record.start', 'obs.record.stop'];
const OBS_REPLAY_ACTION_IDS = ['obs.replay.toggle', 'obs.replay.start', 'obs.replay.stop'];
const OBS_VIRTUAL_CAMERA_ACTION_IDS = [
  'obs.virtual_camera.toggle',
  'obs.virtual_camera.start',
  'obs.virtual_camera.stop',
];
const OBS_STUDIO_MODE_ACTION_IDS = [
  'obs.studio_mode.toggle',
  'obs.studio_mode.enable',
  'obs.studio_mode.disable',
];

export function getRequiredParams(tool: IntegrationTool): string[] {
  const required = (tool.paramsSchema as { required?: unknown }).required;
  return Array.isArray(required)
    ? required.filter((key): key is string => typeof key === 'string')
    : [];
}

export function getPluginToolViews(plugin: IntegrationPlugin): PluginToolView[] {
  const hasNativeStreamToggle = plugin.tools.some((tool) => tool.actionId === 'obs.stream.toggle');
  const hasNativeRecordToggle = plugin.tools.some((tool) => tool.actionId === 'obs.record.toggle');
  const hasNativeReplayToggle = plugin.tools.some((tool) => tool.actionId === 'obs.replay.toggle');
  const hasNativeVirtualCameraToggle = plugin.tools.some((tool) => tool.actionId === 'obs.virtual_camera.toggle');
  const hasNativeStudioModeToggle = plugin.tools.some((tool) => tool.actionId === 'obs.studio_mode.toggle');

  return plugin.tools
    .filter((tool) => {
      if (plugin.slug !== 'obs') return true;
      if (hasNativeStreamToggle && ['obs.stream.start', 'obs.stream.stop'].includes(tool.actionId)) return false;
      if (hasNativeRecordToggle && ['obs.record.start', 'obs.record.stop'].includes(tool.actionId)) return false;
      if (hasNativeReplayToggle && ['obs.replay.start', 'obs.replay.stop'].includes(tool.actionId)) return false;
      if (hasNativeVirtualCameraToggle && ['obs.virtual_camera.start', 'obs.virtual_camera.stop'].includes(tool.actionId)) return false;
      if (hasNativeStudioModeToggle && ['obs.studio_mode.enable', 'obs.studio_mode.disable'].includes(tool.actionId)) return false;
      return !HIDDEN_OBS_TOOL_ACTION_IDS.has(tool.actionId);
    })
    .map((tool) => {
      if (plugin.slug === 'obs' && (tool.actionId === 'obs.stream.toggle' || tool.actionId === 'obs.stream.start')) {
        return {
          ...tool,
          deckActionId: 'obs.stream.toggle',
          displayName: 'Stream',
          description: 'Start or stop streaming based on current OBS state.',
          tileLabel: 'Stream',
          selectedActionIds: OBS_STREAM_ACTION_IDS,
        };
      }

      if (plugin.slug === 'obs' && (tool.actionId === 'obs.record.toggle' || tool.actionId === 'obs.record.start')) {
        return {
          ...tool,
          deckActionId: 'obs.record.toggle',
          displayName: 'Recording',
          description: 'Start or stop recording based on current OBS state.',
          tileLabel: 'Recording',
          selectedActionIds: OBS_RECORD_ACTION_IDS,
        };
      }

      if (plugin.slug === 'obs' && tool.actionId === 'obs.replay.toggle') {
        return {
          ...tool,
          deckActionId: 'obs.replay.toggle',
          displayName: 'Replay Buffer',
          tileLabel: 'Replay Buffer',
          selectedActionIds: OBS_REPLAY_ACTION_IDS,
        };
      }

      if (plugin.slug === 'obs' && tool.actionId === 'obs.virtual_camera.toggle') {
        return {
          ...tool,
          deckActionId: 'obs.virtual_camera.toggle',
          displayName: 'Virtual Camera',
          tileLabel: 'Virtual Camera',
          selectedActionIds: OBS_VIRTUAL_CAMERA_ACTION_IDS,
        };
      }

      if (plugin.slug === 'obs' && tool.actionId === 'obs.studio_mode.toggle') {
        return {
          ...tool,
          deckActionId: 'obs.studio_mode.toggle',
          displayName: 'Studio Mode',
          tileLabel: 'Studio Mode',
          selectedActionIds: OBS_STUDIO_MODE_ACTION_IDS,
        };
      }

      return {
        ...tool,
        deckActionId: tool.actionId,
        displayName: tool.name,
        tileLabel: tool.name,
        selectedActionIds: [tool.actionId],
      };
    });
}
