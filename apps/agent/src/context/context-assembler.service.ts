import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';
import { ToolContextRequirement, ContextProviderId } from '@control-surface/shared';
import { ContextRegistryService } from './context-registry.service';
import { ConsentStoreService } from './consent-store.service';
import { ConsentRequestService } from './consent-request.service';
import { ContextEvaluatorService } from './context-evaluator.service';

export class ContextAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextAssemblyError';
  }
}

const PROVIDER_LABELS: Record<ContextProviderId, string> = {
  user_input:      'User Intent',
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
    private readonly evaluator?: ContextEvaluatorService,
  ) {}

  async assemble(
    requirements: ToolContextRequirement[],
    client: WebSocket,
    packId: string,
    toolId: string,
    userIntent?: string,
    packSlug?: string,
  ): Promise<string> {
    const trustedSections: string[] = [];
    const supportingSections: string[] = [];

    for (const req of requirements) {
      if (req.provider === 'user_input') continue;

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

      let payload: Awaited<ReturnType<ContextRegistryService['read']>>;
      try {
        payload = await this.contextRegistry.read(req.provider, { toolId, packId });
      } catch (err) {
        if (req.required) {
          throw new ContextAssemblyError(
            `${label} required but unavailable: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        continue;
      }

      if (!payload.content) {
        if (req.required) {
          throw new ContextAssemblyError(`${label} required but unavailable: ${payload.provenance}`);
        }
        continue;
      }

      let content = payload.content;
      if (req.maxBytes && Buffer.byteLength(content, 'utf8') > req.maxBytes) {
        const buf = Buffer.from(content, 'utf8');
        let end = req.maxBytes;
        // Walk back to a valid UTF-8 character boundary
        while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
        content = buf.slice(0, end).toString('utf8') + '\n[truncated]';
      }

      if (!req.required && packSlug && this.evaluator) {
        const toolDomain = this.evaluator.domainForPackSlug(packSlug);
        if (toolDomain !== 'unknown') {
          const evalResult = this.evaluator.evaluate(content, toolDomain);
          if (evalResult.decision === 'rejected') {
            console.log(`[ContextAssemblerService] Rejected ${label}: ${evalResult.reason}`);
            continue;
          }
        }
      }

      const section = `### ${label}\n${content}`;
      if (req.required) {
        trustedSections.push(section);
      } else {
        supportingSections.push(section);
      }
    }

    const sections = [...trustedSections, ...supportingSections];
    if (!userIntent) return sections.join('\n\n');

    const parts = [`### User Intent\n${userIntent}`];
    if (sections.length) parts.push(sections.join('\n\n'));
    return parts.join('\n\n');
  }
}
