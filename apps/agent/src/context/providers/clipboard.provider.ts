import { Injectable } from '@nestjs/common';
import { ClipboardService } from '../../clipboard/clipboard.service';
import {
  ContextProvider,
  ContextRequest,
  ContextProbe,
  ContextPreview,
  ContextPayload,
} from '../context-provider.interface';

const MAX_BYTES = 50_000;

@Injectable()
export class ClipboardProvider implements ContextProvider {
  readonly id = 'clipboard';

  constructor(private readonly clipboard: ClipboardService) {}

  async probe(_request: ContextRequest): Promise<ContextProbe> {
    const text = await this.clipboard.read();
    return {
      available: text.length > 0,
      unavailableReason: text.length === 0 ? 'clipboard is empty' : undefined,
    };
  }

  async preview(_request: ContextRequest): Promise<ContextPreview> {
    const text = await this.clipboard.read();
    const bytes = Buffer.byteLength(text, 'utf8');
    const truncated = bytes > MAX_BYTES;
    return {
      label: `Clipboard (${text.length} chars)`,
      byteSize: Math.min(bytes, MAX_BYTES),
      truncated,
      sampleText: text.slice(0, 100),
    };
  }

  async read(_request: ContextRequest): Promise<ContextPayload> {
    const text = await this.clipboard.read();
    const content = Buffer.byteLength(text, 'utf8') > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
    return {
      providerId: this.id,
      content,
      byteSize: Buffer.byteLength(content, 'utf8'),
      provenance: `clipboard read at ${new Date().toLocaleTimeString()}`,
    };
  }
}
