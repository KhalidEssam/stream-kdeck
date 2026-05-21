const mockNativeModules = { RNZeroconf: {} };
const mockHandlers: Record<string, (payload: unknown) => void> = {};
const mockScan = jest.fn();
const mockStop = jest.fn();
const mockRemoveDeviceListeners = jest.fn();
const mockPlatform = { OS: 'android', Version: 35 };

jest.mock('react-native', () => ({
  NativeModules: mockNativeModules,
  Platform: mockPlatform,
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

    expect(mockScan).toHaveBeenCalledWith('controlsurface', 'tcp', 'local.', 'NSD');

    mockHandlers.resolved({
      host: 'KDeck-Agent.local.',
      port: 3001,
      addresses: ['192.168.1.77'],
    });

    expect(onFound).toHaveBeenCalledWith('ws://192.168.1.77:3001');
    expect(onTimeout).not.toHaveBeenCalled();
    expect(mockStop).toHaveBeenCalledWith('NSD');
    expect(mockRemoveDeviceListeners).toHaveBeenCalled();
  });
});
