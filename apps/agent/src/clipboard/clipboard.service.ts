import { Injectable } from '@nestjs/common';
import clipboard from 'clipboardy';

@Injectable()
export class ClipboardService {
  async read(): Promise<string> {
    return clipboard.read();
  }

  async write(text: string): Promise<void> {
    return clipboard.write(text);
  }
}
