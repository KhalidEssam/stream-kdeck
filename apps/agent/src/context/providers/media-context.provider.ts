import { Injectable } from '@nestjs/common';
import { MediaService } from '../../media/media.service';
import {
  ContextProvider,
  ContextRequest,
  ContextProbe,
  ContextPreview,
  ContextPayload,
} from '../context-provider.interface';

@Injectable()
export class MediaContextProvider implements ContextProvider {
  readonly id = 'media';

  constructor(private readonly mediaService: MediaService) {}

  async probe(_request: ContextRequest): Promise<ContextProbe> {
    try {
      const sessions = await this.readSessions();
      return {
        available: sessions.length > 0,
        unavailableReason: sessions.length === 0 ? 'no active media sessions detected' : undefined,
      };
    } catch (err) {
      return {
        available: false,
        unavailableReason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async preview(_request: ContextRequest): Promise<ContextPreview> {
    const content = this.formatSessions(await this.readSessions());
    return {
      label: 'Active media sessions',
      byteSize: Buffer.byteLength(content, 'utf8'),
      truncated: false,
      sampleText: content,
    };
  }

  async read(_request: ContextRequest): Promise<ContextPayload> {
    const content = this.formatSessions(await this.readSessions());
    return {
      providerId: this.id,
      content,
      byteSize: Buffer.byteLength(content, 'utf8'),
      provenance: `media sessions read at ${new Date().toLocaleTimeString()}`,
    };
  }

  private async readSessions() {
    const sessions = await this.mediaService.getSessions();
    return this.mediaService.buildMediaState(sessions);
  }

  private formatSessions(sessions: Awaited<ReturnType<MediaContextProvider['readSessions']>>): string {
    return sessions
      .map((session) => [
        `app: ${session.label}`,
        `process: ${session.processName}`,
        `volume: ${Math.round(session.volume * 100)}%`,
        `muted: ${session.muted ? 'yes' : 'no'}`,
        `active: ${session.active ? 'yes' : 'no'}`,
      ].join(', '))
      .join('\n');
  }
}
