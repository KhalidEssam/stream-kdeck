import { NativeModules } from 'react-native';
import Zeroconf from 'react-native-zeroconf';

const SERVICE_TYPE   = 'controlsurface';
const SERVICE_PROTO  = 'tcp';
const SERVICE_DOMAIN = 'local.';
const DEFAULT_PORT   = 3001;
const MANUAL_AGENT_WS_URL = process.env.EXPO_PUBLIC_AGENT_WS_URL;

const ZEROCONF_UNAVAILABLE_MESSAGE =
  'mDNS discovery is not available in this app build. Rebuild the Expo dev client with react-native-zeroconf, or set EXPO_PUBLIC_AGENT_WS_URL=ws://<desktop-ip>:3001 while testing.';

function cleanupZeroconf(zc: Zeroconf): void {
  try {
    zc.stop();
  } catch {
    // Native module may be missing or already torn down.
  }
  zc.removeDeviceListeners();
}

export function discoverAgent(
  onFound:   (url: string) => void,
  onTimeout: (msg: string) => void,
  timeoutMs  = 10_000,
): () => void {
  if (MANUAL_AGENT_WS_URL) {
    const timer = setTimeout(() => onFound(MANUAL_AGENT_WS_URL), 0);
    return () => clearTimeout(timer);
  }

  if (!NativeModules.RNZeroconf) {
    const timer = setTimeout(() => onTimeout(ZEROCONF_UNAVAILABLE_MESSAGE), 0);
    return () => clearTimeout(timer);
  }

  const zc       = new Zeroconf();
  let   resolved = false;

  zc.on('resolved', (service: {
    host:      string;
    port:      number;
    addresses: string[];
  }) => {
    if (resolved) return;
    resolved = true;
    const ipv4 = service.addresses?.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
    const host = ipv4 ?? service.host;
    const port = service.port ?? DEFAULT_PORT;
    cleanupZeroconf(zc);
    onFound(`ws://${host}:${port}`);
  });

  zc.on('error', (err: unknown) => {
    if (!resolved) {
      resolved = true;
      cleanupZeroconf(zc);
      onTimeout(String(err));
    }
  });

  try {
    zc.scan(SERVICE_TYPE, SERVICE_PROTO, SERVICE_DOMAIN);
  } catch (err) {
    resolved = true;
    cleanupZeroconf(zc);
    onTimeout(err instanceof Error ? err.message : String(err));
  }

  const timer = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      cleanupZeroconf(zc);
      onTimeout('No Control Surface agent found on this network.');
    }
  }, timeoutMs);

  return () => {
    clearTimeout(timer);
    if (!resolved) {
      resolved = true;
      cleanupZeroconf(zc);
    }
  };
}
