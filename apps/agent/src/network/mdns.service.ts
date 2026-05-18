import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Bonjour } from 'bonjour-service';
import type { Service } from 'bonjour-service';
import { AGENT_PORT } from '../constants';

@Injectable()
export class MdnsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MdnsService.name);
  private bonjour: Bonjour | null = null;
  private service: Service | null = null;

  onApplicationBootstrap(): void {
    this.bonjour = new Bonjour();
    this.service = this.bonjour.publish({
      name: 'Control Surface Agent',
      type: 'controlsurface',
      port: AGENT_PORT,
    });
    this.logger.log(`advertising _controlsurface._tcp on port ${AGENT_PORT}`);
  }

  onApplicationShutdown(): void {
    this.service?.stop?.();
    this.bonjour?.destroy();
    this.bonjour = null;
  }
}
