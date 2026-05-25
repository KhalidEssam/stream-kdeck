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
    expect(service.canExecute('obs.stream.toggle')).toBe(true);
    expect(service.canExecute('obs.stream.start')).toBe(true);
    expect(service.canExecute('obs.stream.stop')).toBe(true);
    expect(service.canExecute('obs.record.toggle')).toBe(true);
    expect(service.canExecute('obs.record.start')).toBe(true);
    expect(service.canExecute('obs.record.stop')).toBe(true);
    expect(service.canExecute('obs.replay.toggle')).toBe(true);
    expect(service.canExecute('obs.replay.start')).toBe(true);
    expect(service.canExecute('obs.replay.stop')).toBe(true);
    expect(service.canExecute('obs.replay.save')).toBe(true);
    expect(service.canExecute('obs.virtual_camera.toggle')).toBe(true);
    expect(service.canExecute('obs.virtual_camera.start')).toBe(true);
    expect(service.canExecute('obs.virtual_camera.stop')).toBe(true);
    expect(service.canExecute('obs.studio_mode.toggle')).toBe(true);
    expect(service.canExecute('obs.studio_mode.enable')).toBe(true);
    expect(service.canExecute('obs.studio_mode.disable')).toBe(true);
    expect(service.canExecute('obs.input.mute.toggle')).toBe(true);
    expect(service.canExecute('obs.input.mute.set')).toBe(true);
    expect(service.canExecute('obs.input.volume.set')).toBe(true);
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

  it('execute StreamToggle starts stream when inactive', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockImplementation((method: string) => {
      if (method === 'GetStreamStatus') {
        return Promise.resolve({ outputActive: false });
      }
      return Promise.resolve({});
    });

    const result = await service.execute('obs.stream.toggle', {});

    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('GetStreamStatus');
    expect(mockCall).toHaveBeenCalledWith('StartStream');
  });

  it('execute StreamToggle stops stream when active', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockImplementation((method: string) => {
      if (method === 'GetStreamStatus') {
        return Promise.resolve({ outputActive: true });
      }
      return Promise.resolve({});
    });

    const result = await service.execute('obs.stream.toggle', {});

    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('GetStreamStatus');
    expect(mockCall).toHaveBeenCalledWith('StopStream');
  });

  it('execute RecordToggle starts recording when inactive', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockImplementation((method: string) => {
      if (method === 'GetRecordStatus') {
        return Promise.resolve({ outputActive: false });
      }
      return Promise.resolve({});
    });

    const result = await service.execute('obs.record.toggle', {});

    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('GetRecordStatus');
    expect(mockCall).toHaveBeenCalledWith('StartRecord');
  });

  it('execute RecordToggle stops recording when active', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockImplementation((method: string) => {
      if (method === 'GetRecordStatus') {
        return Promise.resolve({ outputActive: true });
      }
      return Promise.resolve({});
    });

    const result = await service.execute('obs.record.toggle', {});

    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('GetRecordStatus');
    expect(mockCall).toHaveBeenCalledWith('StopRecord');
  });

  it('execute ReplayToggle calls ToggleReplayBuffer', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockResolvedValue({ outputActive: true });

    const result = await service.execute('obs.replay.toggle', {});

    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('ToggleReplayBuffer');
  });

  it('execute SaveReplayBuffer calls SaveReplayBuffer', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockResolvedValue({});

    const result = await service.execute('obs.replay.save', {});

    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('SaveReplayBuffer');
  });

  it('execute VirtualCameraToggle calls ToggleVirtualCam', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockResolvedValue({ outputActive: true });

    const result = await service.execute('obs.virtual_camera.toggle', {});

    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('ToggleVirtualCam');
  });

  it('execute StudioModeToggle flips the current studio mode state', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockImplementation((method: string) => {
      if (method === 'GetStudioModeEnabled') {
        return Promise.resolve({ studioModeEnabled: false });
      }
      return Promise.resolve({});
    });

    const result = await service.execute('obs.studio_mode.toggle', {});

    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('SetStudioModeEnabled', { studioModeEnabled: true });
  });

  it('execute InputMuteToggle calls ToggleInputMute with inputName', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockResolvedValue({ inputMuted: true });

    const result = await service.execute('obs.input.mute.toggle', { inputName: 'Mic/Aux' });

    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('ToggleInputMute', { inputName: 'Mic/Aux' });
  });

  it('execute InputMuteSet accepts string booleans from mobile params', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockResolvedValue({});

    const result = await service.execute('obs.input.mute.set', { inputName: 'Mic/Aux', muted: 'true' });

    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('SetInputMute', { inputName: 'Mic/Aux', inputMuted: true });
  });

  it('execute InputVolumeSet clamps volume to OBS inputVolumeMul range used by KDeck', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockResolvedValue({});

    const result = await service.execute('obs.input.volume.set', { inputName: 'Mic/Aux', volume: '1.4' });

    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('SetInputVolume', { inputName: 'Mic/Aux', inputVolumeMul: 1 });
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

  it('getState includes expanded OBS live states', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockImplementation((method: string) => {
      switch (method) {
        case 'GetStreamStatus':
          return Promise.resolve({ outputActive: true });
        case 'GetRecordStatus':
          return Promise.resolve({ outputActive: false });
        case 'GetSceneList':
          return Promise.resolve({ currentProgramSceneName: 'Main' });
        case 'GetReplayBufferStatus':
          return Promise.resolve({ outputActive: true });
        case 'GetVirtualCamStatus':
          return Promise.resolve({ outputActive: false });
        case 'GetStudioModeEnabled':
          return Promise.resolve({ studioModeEnabled: true });
        default:
          return Promise.resolve({});
      }
    });

    const state = await service.getState();

    expect(state).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'streaming', value: true, label: 'Live' }),
      expect.objectContaining({ key: 'recording', value: false, label: '' }),
      expect.objectContaining({ key: 'scene', value: 'Main', label: 'Main' }),
      expect.objectContaining({ key: 'replayBufferActive', value: true, label: 'Replay On' }),
      expect.objectContaining({ key: 'virtualCameraActive', value: false, label: '' }),
      expect.objectContaining({ key: 'studioModeEnabled', value: true, label: 'Studio' }),
    ]));
  });

  it('getState keeps core states when optional OBS state calls fail', async () => {
    mockConnector.getDeviceConnection.mockResolvedValue({ host: 'localhost', port: 4455, password: '' });
    mockConnect.mockResolvedValue(undefined);
    mockCall.mockImplementation((method: string) => {
      switch (method) {
        case 'GetStreamStatus':
          return Promise.resolve({ outputActive: false });
        case 'GetRecordStatus':
          return Promise.resolve({ outputActive: true });
        case 'GetSceneList':
          return Promise.resolve({ currentProgramSceneName: 'Main' });
        case 'GetReplayBufferStatus':
        case 'GetVirtualCamStatus':
        case 'GetStudioModeEnabled':
          return Promise.reject(new Error('optional state unavailable'));
        default:
          return Promise.resolve({});
      }
    });

    const state = await service.getState();

    expect(state.map((entry) => entry.key)).toEqual(['streaming', 'recording', 'scene']);
  });
});
