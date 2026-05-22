const mockHandlers: Record<string, (payload: unknown) => void> = {};
const mockScan = jest.fn();
const mockStop = jest.fn();
const mockRemoveDeviceListeners = jest.fn();

// jest.mock factories are hoisted before variable initializers run, so outer
// const variables are undefined inside the factory. We work around this by
// having the factory create the shared NativeModules object itself and export
// it via a module-level symbol so beforeEach can mutate it by reference.
let mockNativeModules: { RNZeroconf: Record<string, unknown> | undefined };

jest.mock('react-native', () => {
  // Create the shared object inside the factory so it is initialized here.
  // Then assign it back to the outer let so tests can mutate it via beforeEach.
  // This assignment runs before any test body executes.
  const obj: { RNZeroconf: Record<string, unknown> | undefined } = { RNZeroconf: {} };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__mockNativeModules = obj;
  return { NativeModules: obj };
});

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

// Retrieve the shared object created inside the factory.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
mockNativeModules = (globalThis as any).__mockNativeModules;

describe('discovery.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(mockHandlers)) delete mockHandlers[key];
    mockNativeModules.RNZeroconf = {};
    // Restore mockImplementation cleared by clearAllMocks.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ZeroconfMock = require('react-native-zeroconf');
    ZeroconfMock.mockImplementation(() => ({
      on: (event: string, handler: (payload: unknown) => void) => {
        mockHandlers[event] = handler;
      },
      scan: mockScan,
      stop: mockStop,
      removeDeviceListeners: mockRemoveDeviceListeners,
    }));
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

  it('scans the KDeck mDNS service and resolves to the discovered WebSocket URL', () => {
    const onFound = jest.fn();
    const onTimeout = jest.fn();

    discoverAgent(onFound, onTimeout);

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

  it('skips a resolved service whose URL is in skipUrls', () => {
    const onFound = jest.fn();
    const onTimeout = jest.fn();
    const skipUrls = new Set(['ws://192.168.1.77:3001']);

    discoverAgent(onFound, onTimeout, skipUrls);

    mockHandlers.resolved({
      host: 'KDeck-Agent.local.',
      port: 3001,
      addresses: ['192.168.1.77'],
    });

    expect(onFound).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
  });

  it('resolves a service not in skipUrls even when skipUrls is provided', () => {
    const onFound = jest.fn();
    const onTimeout = jest.fn();
    const skipUrls = new Set(['ws://192.168.1.99:3001']);

    discoverAgent(onFound, onTimeout, skipUrls);

    mockHandlers.resolved({
      host: 'KDeck-Agent.local.',
      port: 3001,
      addresses: ['192.168.1.77'],
    });

    expect(onFound).toHaveBeenCalledWith('ws://192.168.1.77:3001');
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
