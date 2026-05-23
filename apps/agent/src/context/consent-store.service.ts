import { Injectable, Inject, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export type ConsentScope = 'once' | 'session' | 'permanent';

export interface ConsentGrant {
  providerId: string;
  packId: string;
  scope: ConsentScope;
  grantedAt: number;
}

export const USER_DATA_DIR_TOKEN = 'USER_DATA_DIR';

@Injectable()
export class ConsentStoreService {
  private grants = new Map<string, ConsentGrant>();
  private readonly storePath: string;

  constructor(@Optional() @Inject(USER_DATA_DIR_TOKEN) userDataDir?: string) {
    if (userDataDir !== undefined) {
      this.storePath = path.join(userDataDir, 'context-consent.json');
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron') as { app: { getPath: (n: string) => string } };
      this.storePath = path.join(app.getPath('userData'), 'context-consent.json');
    }
    this.load();
  }

  grant(packId: string, providerId: string, scope: ConsentScope): void {
    const key = `${packId}:${providerId}`;
    this.grants.set(key, { providerId, packId, scope, grantedAt: Date.now() });
    if (scope === 'permanent') this.persist();
  }

  revoke(packId: string, providerId: string): void {
    this.grants.delete(`${packId}:${providerId}`);
    this.persist();
  }

  isGranted(packId: string, providerId: string): boolean {
    return this.grants.has(`${packId}:${providerId}`);
  }

  clearSession(): void {
    for (const [key, grant] of this.grants.entries()) {
      if (grant.scope !== 'permanent') this.grants.delete(key);
    }
  }

  getAll(): ConsentGrant[] {
    return Array.from(this.grants.values());
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const saved = JSON.parse(raw) as ConsentGrant[];
      for (const grant of saved) {
        if (grant.scope === 'permanent') {
          this.grants.set(`${grant.packId}:${grant.providerId}`, grant);
        }
      }
    } catch { /* no saved grants or malformed file */ }
  }

  private persist(): void {
    const permanent = Array.from(this.grants.values()).filter((g) => g.scope === 'permanent');
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(permanent, null, 2), 'utf8');
    } catch { /* ignore write failures */ }
  }
}
