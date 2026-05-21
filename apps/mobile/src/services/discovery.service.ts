import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import Zeroconf from 'react-native-zeroconf';

const SERVICE_TYPE   = 'controlsurface';
const SERVICE_PROTO  = 'tcp';
const SERVICE_DOMAIN = 'local.';
const DEFAULT_PORT   = 3001;
// DNSSD (embedded mDNSResponder) is far more reliable than Android's built-in NSD on real devices.
const IMPL_TYPE      = 'DNSSD';
const MAX_ATTEMPTS   = 2;
const ATTEMPT_MS     = 5_000;

const MANUAL_AGENT_WS_URL = normalizeAgentWsUrl(process.env.EXPO_PUBLIC_AGENT_WS_URL);

interface ResolvedService {
  host?: string;
  port?: number;
  addresses?: string[];
}

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const NEARBY_WIFI_DEVICES_PERMISSION =
  'android.permission.NEARBY_WIFI_DEVICES' as Parameters<typeof PermissionsAndroid.check>[0];

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

async function ensureNearbyWifiPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const androidVersion =
    typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  if (!Number.isFinite(androidVersion) || androidVersion < 33) return true;

  const alreadyGranted = await PermissionsAndroid.check(NEARBY_WIFI_DEVICES_PERMISSION);
  if (alreadyGranted) return true;

  const result = await PermissionsAndroid.request(NEARBY_WIFI_DEVICES_PERMISSION, {
    title: 'Nearby devices',
    message: 'KDeck uses nearby Wi-Fi discovery to find your desktop agent on this network.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function discoverAgent(
  onFound:   (url: string) => void,
  onTimeout: (msg: string) => void,
): () => void {
  // Dev shortcut: if EXPO_PUBLIC_AGENT_WS_URL is explicitly set, use it immediately
  // and skip all discovery. Do NOT set this in production/preview builds.
  if (MANUAL_AGENT_WS_URL) {
    const timer = setTimeout(() => onFound(MANUAL_AGENT_WS_URL), 0);
    return () => clearTimeout(timer);
  }

  // Native module not linked (Expo Go / dev client without rebuild).
  // Surface a clear error so the user can type the IP manually.
  if (!NativeModules.RNZeroconf) {
    const timer = setTimeout(() => onTimeout(
      'mDNS discovery is not available in this build. Type your desktop IP in the field below.',
    ), 0);
    return () => clearTimeout(timer);
  }

  // Native module is present — do real mDNS discovery.
  // On failure we always call onTimeout so the UI can show the manual IP field.
  // EXPO_PUBLIC_AGENT_WS_URL is intentionally NOT used as a silent fallback here;
  // it only applies to the no-native-module path above (Expo Go dev mode).
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

  void ensureNearbyWifiPermission()
    .then((granted) => {
      if (cancelled) return;
      if (!granted) {
        cancelled = true;
        onTimeout(
          'Nearby devices permission is needed for automatic discovery. Type your desktop IP below or enable the permission in Android settings.',
        );
        return;
      }

      startAttempt();
    })
    .catch(() => {
      if (cancelled) return;
      cancelled = true;
      onTimeout(
        'Nearby devices permission is needed for automatic discovery. Type your desktop IP below or enable the permission in Android settings.',
      );
    });

  return () => {
    cancelled = true;
    cleanup();
  };
}
