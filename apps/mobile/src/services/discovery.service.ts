import { NativeModules } from 'react-native';
import Zeroconf from 'react-native-zeroconf';

const SERVICE_TYPE   = 'controlsurface';
const SERVICE_PROTO  = 'tcp';
const SERVICE_DOMAIN = 'local.';
const DEFAULT_PORT   = 3001;
// DNSSD (embedded mDNSResponder) is far more reliable than Android's built-in NSD on real devices.
const IMPL_TYPE      = 'DNSSD';
const MAX_ATTEMPTS   = 3;
const ATTEMPT_MS     = 8_000;

const MANUAL_AGENT_WS_URL = normalizeAgentWsUrl(process.env.EXPO_PUBLIC_AGENT_WS_URL);

const ZEROCONF_UNAVAILABLE_MESSAGE =
  'mDNS discovery is not available in this app build. Rebuild the Expo dev client with react-native-zeroconf, or set EXPO_PUBLIC_AGENT_WS_URL=ws://<desktop-ip>:3001 while testing.';

interface ResolvedService {
  host?: string;
  port?: number;
  addresses?: string[];
}

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function normalizeAgentWsUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `ws://${raw}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol === 'http:') url.protocol = 'ws:';
    if (url.protocol === 'https:') url.protocol = 'wss:';
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null;
    if (!url.port) url.port = String(DEFAULT_PORT);
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function getAgentUrlFromService(service: ResolvedService): string | null {
  const ipv4 = service.addresses?.find((address) => IPV4_PATTERN.test(address));
  const rawHost = ipv4 ?? service.host;
  if (!rawHost) return null;

  const host = rawHost.trim().replace(/\.$/, '');
  const formattedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `ws://${formattedHost}:${service.port ?? DEFAULT_PORT}`;
}

function cleanupZeroconf(zc: Zeroconf): void {
  try {
    zc.stop(IMPL_TYPE);
  } catch {
    // Native module may be missing or already torn down.
  }
  zc.removeDeviceListeners();
}

export function discoverAgent(
  onFound:   (url: string) => void,
  onTimeout: (msg: string) => void,
): () => void {
  if (!NativeModules.RNZeroconf) {
    const timer = setTimeout(() => {
      if (MANUAL_AGENT_WS_URL) {
        onFound(MANUAL_AGENT_WS_URL);
        return;
      }
      onTimeout(ZEROCONF_UNAVAILABLE_MESSAGE);
    }, 0);
    return () => clearTimeout(timer);
  }

  let cancelled  = false;
  let attempt    = 0;
  let zc: Zeroconf | null = null;
  let attemptTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (attemptTimer !== null) { clearTimeout(attemptTimer); attemptTimer = null; }
    if (zc) { cleanupZeroconf(zc); zc = null; }
  };

  const tryNextOrFail = () => {
    if (cancelled) return;
    if (attempt < MAX_ATTEMPTS) {
      attemptTimer = setTimeout(startAttempt, 500);
    } else if (MANUAL_AGENT_WS_URL) {
      cancelled = true;
      onFound(MANUAL_AGENT_WS_URL);
    } else {
      cancelled = true;
      onTimeout('No KDeck agent found on this network.');
    }
  };

  const startAttempt = () => {
    if (cancelled) return;
    attempt++;

    zc = new Zeroconf();

    zc.on('resolved', (service: ResolvedService) => {
      const url = getAgentUrlFromService(service);
      if (!url) return;
      cleanup();
      if (!cancelled) { cancelled = true; onFound(url); }
    });

    zc.on('error', () => {
      cleanup();
      if (!cancelled) tryNextOrFail();
    });

    try {
      zc.scan(SERVICE_TYPE, SERVICE_PROTO, SERVICE_DOMAIN, IMPL_TYPE);
    } catch {
      cleanup();
      if (!cancelled) tryNextOrFail();
      return;
    }

    attemptTimer = setTimeout(() => {
      cleanup();
      if (!cancelled) tryNextOrFail();
    }, ATTEMPT_MS);
  };

  startAttempt();

  return () => {
    cancelled = true;
    cleanup();
  };
}
