import { Injectable } from '@nestjs/common';
import { ActiveWindowService } from '../../active-window/active-window.service';
import {
  ContextProvider,
  ContextRequest,
  ContextProbe,
  ContextPreview,
  ContextPayload,
} from '../context-provider.interface';

@Injectable()
export class ActiveWindowProvider implements ContextProvider {
  readonly id = 'active_window';

  constructor(private readonly activeWindow: ActiveWindowService) {}

  async probe(_request: ContextRequest): Promise<ContextProbe> {
    return {
      available: this.activeWindow.current !== null,
      unavailableReason: this.activeWindow.current === null ? 'no foreground window detected' : undefined,
    };
  }

  async preview(_request: ContextRequest): Promise<ContextPreview> {
    const name = this.activeWindow.current ?? '';
    return {
      label: `Active window: ${name}`,
      byteSize: Buffer.byteLength(name, 'utf8'),
      truncated: false,
      sampleText: name,
    };
  }

  async read(_request: ContextRequest): Promise<ContextPayload> {
    const name = this.activeWindow.current ?? '';
    return {
      providerId: this.id,
      content: name,
      byteSize: Buffer.byteLength(name, 'utf8'),
      provenance: `active window polled at ${new Date().toLocaleTimeString()}`,
    };
  }
}
