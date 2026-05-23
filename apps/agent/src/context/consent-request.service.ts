import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import { ConsentScope, ContextPermissionRequestMessage } from '@control-surface/shared';

@Injectable()
export class ConsentRequestService {
  private readonly pending = new Map<string, (granted: boolean, scope?: ConsentScope) => void>();

  handleResponse(requestId: string, granted: boolean, scope?: ConsentScope): void {
    const resolve = this.pending.get(requestId);
    if (resolve) {
      this.pending.delete(requestId);
      resolve(granted, scope);
    }
  }

  async request(
    client: WebSocket,
    params: {
      packId: string;
      providerId: string;
      providerLabel: string;
      reason: string;
    },
  ): Promise<{ granted: boolean; scope?: ConsentScope }> {
    const requestId = randomUUID();
    const msg: ContextPermissionRequestMessage = {
      type: 'CONTEXT_PERMISSION_REQUEST',
      requestId,
      packId: params.packId,
      providerId: params.providerId,
      providerLabel: params.providerLabel,
      reason: params.reason,
      scopeOptions: ['once', 'session', 'permanent'],
    };
    client.send(JSON.stringify(msg));

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ granted: false });
      }, 60_000);

      this.pending.set(requestId, (granted, scope) => {
        clearTimeout(timer);
        resolve({ granted, scope });
      });
    });
  }
}
