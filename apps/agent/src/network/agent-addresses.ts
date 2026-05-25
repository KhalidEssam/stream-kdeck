import { networkInterfaces } from 'os';
import { AGENT_PORT } from '../constants';

export function getLanIps(): string[] {
  const ips = new Set<string>();
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        ips.add(address.address);
      }
    }
  }
  return [...ips].sort(compareIpsForDisplay);
}

export function getLanWebSocketUrls(port = AGENT_PORT): string[] {
  return getLanIps().map((ip) => `ws://${ip}:${port}`);
}

function compareIpsForDisplay(a: string, b: string): number {
  return ipPriority(a) - ipPriority(b) || a.localeCompare(b, undefined, { numeric: true });
}

function ipPriority(ip: string): number {
  if (ip.startsWith('192.168.')) return 0;
  if (ip.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return 2;
  return 3;
}
