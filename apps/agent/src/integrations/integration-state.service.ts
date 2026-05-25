import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { IntegrationStateMessage } from '@control-surface/shared';
import { PluginCatalogService } from './plugin-catalog.service';
import { PluginInstallService } from './plugin-install.service';
import { IntegrationRouterService } from './integration-router.service';

type BroadcastFn = (msg: IntegrationStateMessage) => void;

@Injectable()
export class IntegrationStateService implements OnModuleDestroy {
  private broadcastFn?: BroadcastFn;
  private intervalHandle?: ReturnType<typeof setInterval>;

  constructor(
    private readonly router: IntegrationRouterService,
    private readonly pluginCatalog: PluginCatalogService,
    private readonly pluginInstall: PluginInstallService,
  ) {}

  setBroadcastFn(fn: BroadcastFn): void {
    this.broadcastFn = fn;
  }

  startPolling(intervalMs = 5000): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => void this.poll(), intervalMs);
  }

  async pollNow(): Promise<void> {
    await this.poll();
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  private async poll(): Promise<void> {
    if (!this.broadcastFn) return;

    for (const adapter of this.router.getAdapters()) {
      if (!adapter.getState) continue;

      const plugin = this.pluginCatalog.getPlugin(adapter.pluginSlug);
      if (!plugin || !this.pluginInstall.isInstalled(plugin.id)) continue;

      try {
        const states = await adapter.getState();
        if (states.length === 0) continue;

        const msg: IntegrationStateMessage = {
          type: 'INTEGRATION_STATE',
          pluginId: plugin.id,
          states,
        };
        this.broadcastFn(msg);
      } catch {
        // Adapter is offline or unavailable; the next polling tick can recover.
      }
    }
  }
}
