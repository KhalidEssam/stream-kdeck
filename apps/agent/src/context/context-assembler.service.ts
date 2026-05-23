import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';
import { ToolContextRequirement, ContextProviderId } from '@control-surface/shared';
import { ContextRegistryService } from './context-registry.service';
import { ConsentStoreService } from './consent-store.service';
import { ConsentRequestService } from './consent-request.service';

export class ContextAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextAssemblyError';
  }
}

const PROVIDER_LABELS: Record<ContextProviderId, string> = {
  clipboard:       'Clipboard',
  active_window:   'Active Window',
  active_terminal: 'Terminal',
  project_files:   'Project Files',
  git:             'Git',
  media:           'Media',
  obs:             'OBS',
};

@Injectable()
export class ContextAssemblerService {
  constructor(
    private readonly contextRegistry: ContextRegistryService,
    private readonly consentStore: ConsentStoreService,
    private readonly consentRequest: ConsentRequestService,
  ) {}

  async assemble(
    requirements: ToolContextRequirement[],
    client: WebSocket,
    packId: string,
    toolId: string,
  ): Promise<string> {
    const sections: string[] = [];

    for (const req of requirements) {
      const label = PROVIDER_LABELS[req.provider] ?? req.provider;

      if (!this.consentStore.isGranted(packId, req.provider)) {
        const result = await this.consentRequest.request(client, {
          packId,
          providerId: req.provider,
          providerLabel: label,
          reason: req.reason,
        });

        if (!result.granted) {
          if (req.required) throw new ContextAssemblyError(`${label} access denied by user`);
          continue;
        }

        if (result.scope) this.consentStore.grant(packId, req.provider, result.scope);
      }

      const payload = await this.contextRegistry.read(req.provider, { toolId, packId });

      if (!payload.content) {
        if (req.required) {
          throw new ContextAssemblyError(`${label} required but unavailable: ${payload.provenance}`);
        }
        continue;
      }

      let content = payload.content;
      if (req.maxBytes && Buffer.byteLength(content, 'utf8') > req.maxBytes) {
        content = content.slice(0, req.maxBytes) + '\n[truncated]';
      }

      sections.push(`### ${label}\n${content}`);
    }

    return sections.join('\n\n');
  }
}
