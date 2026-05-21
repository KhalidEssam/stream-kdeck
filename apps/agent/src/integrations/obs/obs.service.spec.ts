const mockCall = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockOn = jest.fn();
const mockOff = jest.fn();

jest.mock('obs-websocket-js', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    call: mockCall,
    connect: mockConnect,
    disconnect: mockDisconnect,
    on: mockOn,
    off: mockOff,
  })),
}));

const mockConnector = {
  getDeviceConnection: jest.fn(),
  setDeviceConnection: jest.fn(),
  clearDeviceConnection: jest.fn(),
};

const mockPluginCatalog = {
  getPlugin: jest.fn(() => ({ id: 'uuid-obs', slug: 'obs' })),
};

import { ObsService } from './obs.service';

describe('ObsService', () => {
  let service: ObsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPluginCatalog.getPlugin.mockReturnValue({ id: 'uuid-obs', slug: 'obs' });
    service = new ObsService(mockConnector as any, mockPluginCatalog as any);
  });

  it('pluginSlug is obs', () => {
    expect(service.pluginSlug).toBe('obs');
  });

  it('canExecute returns true for known obs actionIds', () => {
    expect(service.canExecute('obs.stream.start')).toBe(true);
    expect(service.canExecute('obs.stream.stop')).toBe(true);
    expect(service.canExecute('obs.record.start')).toBe(true);
    expect(service.canExecute('obs.record.stop')).toBe(true);
    expect(service.canExecute('obs.scene.switch')).toBe(true);
    expect(service.canExecute('obs.source.toggle')).toBe(true);
  });

  it('canExecute returns false for unknown actionIds', () => {
    expect(service.canExecute('twitch.clip.create')).toBe(false);
    expect(service.canExecute('')).toBe(false);
  });

  it('execute returns error when not connected', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue(null);

    const result = await service.execute('obs.stream.start', {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not connected/i);
  });

  it('execute StartStream calls obs.call correctly', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: 'secret' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockResolvedValue({});

    const result = await service.execute('obs.stream.start', {});
    expect(result.success).toBe(true);
    expect(mockConnector.getDeviceConnection).toHaveBeenCalledWith('uuid-obs');
    expect(mockCall).toHaveBeenCalledWith('StartStream');
  });

  it('execute SwitchScene calls SetCurrentProgramScene with sceneName', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockResolvedValue({});

    await service.execute('obs.scene.switch', { sceneName: 'Gaming' });
    expect(mockCall).toHaveBeenCalledWith('SetCurrentProgramScene', { sceneName: 'Gaming' });
  });

  it('execute SourceToggle flips the scene item enabled state', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockImplementation((method: string) => {
      if (method === 'GetSceneItemList') {
        return Promise.resolve({
          sceneItems: [{ sourceName: 'Camera', sceneItemId: 7, sceneItemEnabled: true }],
        });
      }
      return Promise.resolve({});
    });

    const result = await service.execute('obs.source.toggle', { sceneName: 'Main', sourceName: 'Camera' });

    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('SetSceneItemEnabled', {
      sceneName: 'Main',
      sceneItemId: 7,
      sceneItemEnabled: false,
    });
  });

  it('execute returns error when obs.call throws', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockRejectedValue(new Error('OBS not running'));

    const result = await service.execute('obs.stream.start', {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/OBS not running/);
  });
});
