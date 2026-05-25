import { IntegrationStateService } from './integration-state.service';

const makeAdapter = (slug: string, states = [{ key: 'streaming', value: true, updatedAt: '' }]) => ({
  pluginSlug: slug,
  canExecute: () => false,
  execute: jest.fn(),
  getState: jest.fn().mockResolvedValue(states),
});

const makeAdapterNoState = (slug: string) => ({
  pluginSlug: slug,
  canExecute: () => false,
  execute: jest.fn(),
});

describe('IntegrationStateService', () => {
  let router: { getAdapters: jest.Mock };
  let pluginCatalog: { getPlugin: jest.Mock };
  let pluginInstall: { isInstalled: jest.Mock };
  let broadcastFn: jest.Mock;
  let service: IntegrationStateService;

  beforeEach(() => {
    router = { getAdapters: jest.fn().mockReturnValue([]) };
    pluginCatalog = { getPlugin: jest.fn() };
    pluginInstall = { isInstalled: jest.fn().mockReturnValue(false) };
    broadcastFn = jest.fn();
    service = new IntegrationStateService(
      router as any,
      pluginCatalog as any,
      pluginInstall as any,
    );
    service.setBroadcastFn(broadcastFn);
  });

  it('does not call getState on adapters that have no getState method', async () => {
    const adapter = makeAdapterNoState('obs');
    router.getAdapters.mockReturnValue([adapter]);
    pluginCatalog.getPlugin.mockReturnValue({ id: 'obs-id', slug: 'obs' });
    pluginInstall.isInstalled.mockReturnValue(true);

    await service.pollNow();

    expect(broadcastFn).not.toHaveBeenCalled();
  });

  it('does not poll adapters whose plugin is not found in catalog', async () => {
    const adapter = makeAdapter('unknown');
    router.getAdapters.mockReturnValue([adapter]);
    pluginCatalog.getPlugin.mockReturnValue(undefined);

    await service.pollNow();

    expect(adapter.getState).not.toHaveBeenCalled();
    expect(broadcastFn).not.toHaveBeenCalled();
  });

  it('does not poll adapters for uninstalled plugins', async () => {
    const adapter = makeAdapter('obs');
    router.getAdapters.mockReturnValue([adapter]);
    pluginCatalog.getPlugin.mockReturnValue({ id: 'obs-id', slug: 'obs' });
    pluginInstall.isInstalled.mockReturnValue(false);

    await service.pollNow();

    expect(adapter.getState).not.toHaveBeenCalled();
    expect(broadcastFn).not.toHaveBeenCalled();
  });

  it('broadcasts state for installed plugins', async () => {
    const adapter = makeAdapter('obs');
    router.getAdapters.mockReturnValue([adapter]);
    pluginCatalog.getPlugin.mockReturnValue({ id: 'obs-id', slug: 'obs' });
    pluginInstall.isInstalled.mockReturnValue(true);

    await service.pollNow();

    expect(adapter.getState).toHaveBeenCalledTimes(1);
    expect(broadcastFn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'INTEGRATION_STATE', pluginId: 'obs-id' }),
    );
  });

  it('does not broadcast when getState returns empty array', async () => {
    const adapter = makeAdapter('obs', []);
    router.getAdapters.mockReturnValue([adapter]);
    pluginCatalog.getPlugin.mockReturnValue({ id: 'obs-id', slug: 'obs' });
    pluginInstall.isInstalled.mockReturnValue(true);

    await service.pollNow();

    expect(broadcastFn).not.toHaveBeenCalled();
  });

  it('swallows errors from offline adapters without stopping other adapters', async () => {
    const failing = { ...makeAdapter('obs'), getState: jest.fn().mockRejectedValue(new Error('OBS offline')) };
    const working = makeAdapter('media');
    router.getAdapters.mockReturnValue([failing, working]);
    pluginCatalog.getPlugin.mockImplementation((slug: string) =>
      slug === 'obs' ? { id: 'obs-id', slug: 'obs' } : { id: 'media-id', slug: 'media' },
    );
    pluginInstall.isInstalled.mockReturnValue(true);

    await service.pollNow();

    expect(broadcastFn).toHaveBeenCalledTimes(1);
    expect(broadcastFn).toHaveBeenCalledWith(expect.objectContaining({ pluginId: 'media-id' }));
  });
});
