import { Injectable } from '@nestjs/common';
import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SecureStorageService {
  private readonly filePath: string;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'agent-secrets.bin');
  }

  set(key: string, value: string): void {
    const all = this.readAll();
    all[key] = safeStorage.encryptString(value).toString('base64');
    fs.writeFileSync(this.filePath, JSON.stringify(all), 'utf-8');
  }

  get(key: string): string | null {
    const all = this.readAll();
    if (!all[key]) return null;
    try {
      return safeStorage.decryptString(Buffer.from(all[key], 'base64'));
    } catch {
      return null;
    }
  }

  delete(key: string): void {
    const all = this.readAll();
    delete all[key];
    fs.writeFileSync(this.filePath, JSON.stringify(all), 'utf-8');
  }

  private readAll(): Record<string, string> {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch {
      return {};
    }
  }
}
