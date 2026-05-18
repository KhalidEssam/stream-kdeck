import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Bonjour } from 'bonjour-service';
import type { Service } from 'bonjour-service';

@Injectable()
export class MdnsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private bonjour = new Bonjour();
  private service: Service | null = null;

  onApplicationBootstrap(): void {
    this.service = this.bonjour.publish({
      name: 'Control Surface Agent',
      type: 'controlsurface',
      port: 3001,
    });
    console.log('[Agent] mDNS: advertising _controlsurface._tcp on port 3001');
  }

  onApplicationShutdown(): void {
    this.service?.stop?.();
    this.bonjour.destroy();
  }
}
