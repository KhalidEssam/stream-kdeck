const mockSelect = jest.fn();
const mockLte    = jest.fn();
const mockFrom   = jest.fn(() => ({ select: mockSelect }));
mockSelect.mockReturnValue({ lte: mockLte });
mockLte.mockResolvedValue({ data: null, error: null });

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));

import { PluginCatalogService } from './plugin-catalog.service';

describe('PluginCatalogService', () => {
  let service: PluginCatalogService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PluginCatalogService();
  });

  it('returns empty array before load', () => {
    expect(service.getPlugins()).toEqual([]);
  });

  it('loads and maps plugins from Supabase', async () => {
    const rawPlugin = {
      id: 'uuid-1', slug: 'obs', name: 'OBS Studio', description: 'Control OBS',
      category: 'streaming', icon: 'camera', color: '#000', publisher: 'KDeck',
      version: '1.0.0', status: 'published', min_agent_capability: 1,
      min_mobile_capability: 1, supported_platforms: ['win32','darwin'],
      requires_connector: true, connector_type: 'local-websocket', sort_order: 10,
      integration_tools: [{
        id: 'tool-1', plugin_id: 'uuid-1', slug: 'start-stream', name: 'Start Stream',
        description: null, icon: null, color: null, action_id: 'obs.stream.start',
        execution_mode: 'agent', params_schema: {}, result_schema: {},
        supports_workflows: true, supports_state: true, requires_confirmation: false,
        min_agent_capability: 1, sort_order: 10, status: 'published',
      }],
    };
    mockLte.mockResolvedValue({ data: [rawPlugin], error: null });

    await service.load();

    const plugins = service.getPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].slug).toBe('obs');
    expect(plugins[0].tools).toHaveLength(1);
    expect(plugins[0].tools[0].actionId).toBe('obs.stream.start');
  });

  it('filters out plugins whose minAgentCapability exceeds AGENT_CAPABILITY', async () => {
    const rawPlugin = {
      id: 'uuid-2', slug: 'future', name: 'Future Plugin', description: null,
      category: 'ai', icon: 'star', color: null, publisher: 'KDeck',
      version: '2.0.0', status: 'published', min_agent_capability: 99,
      min_mobile_capability: 1, supported_platforms: ['win32','darwin'],
      requires_connector: false, connector_type: null, sort_order: 0,
      integration_tools: [],
    };
    mockLte.mockResolvedValue({ data: [rawPlugin], error: null });

    await service.load();

    expect(service.getPlugins()).toHaveLength(0);
  });

  it('filters out non-published plugins', async () => {
    const rawPlugin = {
      id: 'uuid-3', slug: 'draft-plugin', name: 'Draft', description: null,
      category: 'streaming', icon: 'star', color: null, publisher: 'KDeck',
      version: '1.0.0', status: 'draft', min_agent_capability: 1,
      min_mobile_capability: 1, supported_platforms: ['win32','darwin'],
      requires_connector: false, connector_type: null, sort_order: 0,
      integration_tools: [],
    };
    mockLte.mockResolvedValue({ data: [rawPlugin], error: null });

    await service.load();

    expect(service.getPlugins()).toHaveLength(0);
  });

  it('survives Supabase error without throwing', async () => {
    mockLte.mockResolvedValue({ data: null, error: { message: 'network error' } });
    await expect(service.load()).resolves.toBeUndefined();
    expect(service.getPlugins()).toHaveLength(0);
  });
});
