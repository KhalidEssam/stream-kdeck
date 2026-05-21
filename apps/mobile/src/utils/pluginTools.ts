import type { IntegrationPlugin, IntegrationTool, TileConfig } from '../types/schema';

export type PluginToolView = IntegrationTool & {
  deckActionId: string;
  displayName: string;
  tileLabel: string;
  selectedActionIds: string[];
};

export type IntegrationTileAction = Extract<TileConfig['action'], { kind: 'INTEGRATION_ACTION' }>;

const HIDDEN_OBS_TOOL_ACTION_IDS = new Set(['obs.stream.stop', 'obs.record.stop']);

export function getRequiredParams(tool: IntegrationTool): string[] {
  const required = (tool.paramsSchema as { required?: unknown }).required;
  return Array.isArray(required)
    ? required.filter((key): key is string => typeof key === 'string')
    : [];
}

export function getPluginToolViews(plugin: IntegrationPlugin): PluginToolView[] {
  return plugin.tools
    .filter((tool) => plugin.slug !== 'obs' || !HIDDEN_OBS_TOOL_ACTION_IDS.has(tool.actionId))
    .map((tool) => {
      if (plugin.slug === 'obs' && tool.actionId === 'obs.stream.start') {
        return {
          ...tool,
          deckActionId: 'obs.stream.toggle',
          displayName: 'Stream',
          description: 'Start or stop streaming based on current OBS state.',
          tileLabel: 'Start Stream',
          selectedActionIds: ['obs.stream.toggle', 'obs.stream.start', 'obs.stream.stop'],
        };
      }

      if (plugin.slug === 'obs' && tool.actionId === 'obs.record.start') {
        return {
          ...tool,
          deckActionId: 'obs.record.toggle',
          displayName: 'Recording',
          description: 'Start or stop recording based on current OBS state.',
          tileLabel: 'Start Recording',
          selectedActionIds: ['obs.record.toggle', 'obs.record.start', 'obs.record.stop'],
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
