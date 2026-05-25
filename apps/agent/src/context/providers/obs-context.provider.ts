import { Injectable } from '@nestjs/common';
import { ObsService } from '../../integrations/obs/obs.service';
import {
  ContextProvider,
  ContextRequest,
  ContextProbe,
  ContextPreview,
  ContextPayload,
} from '../context-provider.interface';

@Injectable()
export class ObsContextProvider implements ContextProvider {
  readonly id = 'obs';

  constructor(private readonly obsService: ObsService) {}

  async probe(_request: ContextRequest): Promise<ContextProbe> {
    const state = await this.obsService.getState();
    return {
      available: state.length > 0,
      unavailableReason: state.length === 0 ? 'OBS is not connected or no OBS state is available' : undefined,
    };
  }

  async preview(_request: ContextRequest): Promise<ContextPreview> {
    const content = this.formatState(await this.obsService.getState());
    return {
      label: 'OBS state',
      byteSize: Buffer.byteLength(content, 'utf8'),
      truncated: false,
      sampleText: content,
    };
  }

  async read(_request: ContextRequest): Promise<ContextPayload> {
    const content = this.formatState(await this.obsService.getState());
    return {
      providerId: this.id,
      content,
      byteSize: Buffer.byteLength(content, 'utf8'),
      provenance: `OBS state read at ${new Date().toLocaleTimeString()}`,
    };
  }

  private formatState(state: Awaited<ReturnType<ObsService['getState']>>): string {
    return state
      .map((entry) => {
        const label = entry.label ? ` (${entry.label})` : '';
        return `${entry.key}: ${String(entry.value)}${label}`;
      })
      .join('\n');
  }
}
