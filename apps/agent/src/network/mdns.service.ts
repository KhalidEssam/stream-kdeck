import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Bonjour } from 'bonjour-service';
import type { Service } from 'bonjour-service';
import { getLanIps } from './agent-addresses';

@Injectable()
export class MdnsService implements OnApplicationShutdown {
  private readonly logger = new Logger(MdnsService.name);
  private instances: Array<{ bonjour: Bonjour; service: Service }> = [];

  startAdvertising(port: number): void {
    this.stopAdvertising();

    const ips = getLanIps();
    // Bind to each LAN interface explicitly so multicast goes out on the right one.
    // On Windows with multiple adapters the OS default (0.0.0.0) often picks the
    // wrong interface and the phone never hears the mDNS announcement.
    const bindIps = ips.length > 0 ? ips : [undefined as unknown as string];

    for (const ip of bindIps) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bonjour = new Bonjour(ip ? ({ interface: ip } as any) : {});
      const service = bonjour.publish({
        name: 'KDeck Agent',
        type: 'controlsurface',
        port,
      });
      this.instances.push({ bonjour, service });
    }

    this.logger.log(
      `advertising _controlsurface._tcp on port ${port} (interfaces: ${ips.join(', ') || 'default'})`,
    );
  }

  onApplicationShutdown(): void {
    this.stopAdvertising();
  }

  private stopAdvertising(): void {
    for (const { service, bonjour } of this.instances) {
      service?.stop?.();
      bonjour.destroy();
    }
    this.instances = [];
  }
}
