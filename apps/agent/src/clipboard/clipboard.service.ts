import { Injectable } from '@nestjs/common';
import { clipboard } from 'electron';

@Injectable()
export class ClipboardService {
  async read(): Promise<string> {
    return clipboard.readText();
  }

  async write(text: string): Promise<void> {
    clipboard.writeText(text);
  }
}
