import Zeroconf from 'react-native-zeroconf';

const SERVICE_TYPE   = 'controlsurface';
const SERVICE_PROTO  = 'tcp';
const SERVICE_DOMAIN = 'local.';
const DEFAULT_PORT   = 3001;

export function discoverAgent(
  onFound:   (url: string) => void,
  onTimeout: (msg: string) => void,
  timeoutMs  = 10_000,
): () => void {
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
    zc.stop();
    zc.removeDeviceListeners();
    onFound(`ws://${host}:${port}`);
  });

  zc.on('error', (err: unknown) => {
    if (!resolved) {
      resolved = true;
      zc.stop();
      zc.removeDeviceListeners();
      onTimeout(String(err));
    }
  });

  zc.scan(SERVICE_TYPE, SERVICE_PROTO, SERVICE_DOMAIN);

  const timer = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      zc.stop();
      zc.removeDeviceListeners();
      onTimeout('No Control Surface agent found on this network.');
    }
  }, timeoutMs);

  return () => {
    clearTimeout(timer);
    if (!resolved) { resolved = true; zc.stop(); zc.removeDeviceListeners(); }
  };
}
