const mockNativeModules = { RNZeroconf: {} };
const mockHandlers: Record<string, (payload: unknown) => void> = {};
const mockScan = jest.fn();
const mockStop = jest.fn();
const mockRemoveDeviceListeners = jest.fn();
const mockPlatform = { OS: 'android', Version: 35 };
const mockPermissionCheck = jest.fn();
const mockPermissionRequest = jest.fn();
const mockPermissionResults = { GRANTED: 'granted', DENIED: 'denied' };

jest.mock('react-native', () => ({
  NativeModules: mockNativeModules,
  Platform: mockPlatform,
  PermissionsAndroid: {
    check: mockPermissionCheck,
    request: mockPermissionRequest,
    RESULTS: mockPermissionResults,
  },
}));

jest.mock('react-native-zeroconf', () => (
  jest.fn().mockImplementation(() => ({
    on: (event: string, handler: (payload: unknown) => void) => {
      mockHandlers[event] = handler;
    },
    scan: mockScan,
    stop: mockStop,
    removeDeviceListeners: mockRemoveDeviceListeners,
  }))
));

import { discoverAgent, getAgentUrlFromService, normalizeAgentWsUrl } from './discovery.service';

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('discovery.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(mockHandlers)) delete mockHandlers[key];
    mockNativeModules.RNZeroconf = {};
    mockPlatform.OS = 'android';
    mockPlatform.Version = 35;
    mockPermissionCheck.mockResolvedValue(true);
    mockPermissionRequest.mockResolvedValue(mockPermissionResults.GRANTED);
  });

  it('normalizes raw manual host values into WebSocket URLs', () => {
    expect(normalizeAgentWsUrl('192.168.1.42')).toBe('ws://192.168.1.42:3001');
    expect(normalizeAgentWsUrl('http://192.168.1.42:3001')).toBe('ws://192.168.1.42:3001');
    expect(normalizeAgentWsUrl('https://agent.local')).toBe('wss://agent.local:3001');
  });

  it('rejects unsupported manual URL protocols', () => {
    expect(normalizeAgentWsUrl('ftp://192.168.1.42:3001')).toBeNull();
  });

  it('prefers IPv4 service addresses over mDNS host names', () => {
    expect(getAgentUrlFromService({
      host: 'KDeck-Agent.local.',
      port: 3010,
      addresses: ['fe80::1234', '192.168.1.51'],
    })).toBe('ws://192.168.1.51:3010');
  });

  it('uses the default agent port when the service omits one', () => {
    expect(getAgentUrlFromService({
      host: 'KDeck-Agent.local.',
      addresses: [],
    })).toBe('ws://KDeck-Agent.local:3001');
  });

  it('scans the KDeck mDNS service and resolves to the discovered WebSocket URL', async () => {
    const onFound = jest.fn();
    const onTimeout = jest.fn();

    discoverAgent(onFound, onTimeout);
    await flushPromises();

    expect(mockScan).toHaveBeenCalledWith('controlsurface', 'tcp', 'local.', 'DNSSD');

    mockHandlers.resolved({
      host: 'KDeck-Agent.local.',
      port: 3001,
      addresses: ['192.168.1.77'],
    });

    expect(onFound).toHaveBeenCalledWith('ws://192.168.1.77:3001');
    expect(onTimeout).not.toHaveBeenCalled();
    expect(mockStop).toHaveBeenCalledWith('DNSSD');
    expect(mockRemoveDeviceListeners).toHaveBeenCalled();
  });

  it('asks for nearby Wi-Fi permission before scanning on Android 13+', async () => {
    const onFound = jest.fn();
    const onTimeout = jest.fn();
    mockPermissionCheck.mockResolvedValueOnce(false);
    mockPermissionRequest.mockResolvedValueOnce(mockPermissionResults.GRANTED);

    discoverAgent(onFound, onTimeout);
    await flushPromises();

    expect(mockPermissionRequest).toHaveBeenCalledWith(
      'android.permission.NEARBY_WIFI_DEVICES',
      expect.objectContaining({ title: 'Nearby devices' }),
    );
    expect(mockScan).toHaveBeenCalledWith('controlsurface', 'tcp', 'local.', 'DNSSD');
  });

  it('falls back to manual entry when nearby Wi-Fi permission is denied', async () => {
    const onFound = jest.fn();
    const onTimeout = jest.fn();
    mockPermissionCheck.mockResolvedValueOnce(false);
    mockPermissionRequest.mockResolvedValueOnce(mockPermissionResults.DENIED);

    discoverAgent(onFound, onTimeout);
    await flushPromises();

    expect(mockScan).not.toHaveBeenCalled();
    expect(onFound).not.toHaveBeenCalled();
    expect(onTimeout).toHaveBeenCalledWith(expect.stringContaining('Nearby devices permission'));
  });
});
