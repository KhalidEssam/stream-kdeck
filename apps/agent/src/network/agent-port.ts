import net from 'net';
import { AGENT_PORT } from '../constants';

export interface AgentListenPort {
  port: number;
  preferredPort: number;
  usingFallback: boolean;
}

export async function resolveAgentListenPort(preferredPort = AGENT_PORT): Promise<AgentListenPort> {
  const available = await canBindPort(preferredPort);
  return {
    port: available ? preferredPort : 0,
    preferredPort,
    usingFallback: !available,
  };
}

function canBindPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;

    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      server.removeAllListeners();
      if (server.listening) {
        server.close(() => resolve(available));
        return;
      }
      resolve(available);
    };

    server.once('error', () => finish(false));
    server.once('listening', () => finish(true));
    server.listen(port, '0.0.0.0');
  });
}

export function getListeningPort(server: unknown): number | null {
  const address = (server as { address?: () => string | net.AddressInfo | null }).address?.();
  return typeof address === 'object' && address !== null ? address.port : null;
}
