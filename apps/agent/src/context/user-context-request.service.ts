import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import {
  UserContextCancelMessage,
  UserContextRequestMessage,
  UserInputMode,
} from '@control-surface/shared';

export interface UserContextResult {
  text: string;
  modality: 'text' | 'speech';
}

export class UserContextCanceledError extends Error {
  constructor(message = 'User canceled input') {
    super(message);
    this.name = 'UserContextCanceledError';
  }
}

interface PendingEntry {
  resolve: (result: UserContextResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  toolId: string;
  client: WebSocket;
}

interface CaptureParams {
  toolId: string;
  packId: string;
  title: string;
  prompt: string;
  required: boolean;
  captureMode: UserInputMode;
  timeoutMs?: number;
}

@Injectable()
export class UserContextRequestService {
  private readonly pending = new Map<string, PendingEntry>();
  private readonly pendingByClient = new Map<WebSocket, Map<string, string>>();

  handleResponse(requestId: string, canceled: boolean, text?: string): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;

    this.pending.delete(requestId);
    this.clearClientTool(entry.client, entry.toolId);
    clearTimeout(entry.timer);

    if (canceled || !text?.trim()) {
      entry.reject(new UserContextCanceledError());
      return;
    }

    entry.resolve({ text: text.trim(), modality: 'text' });
  }

  async capture(client: WebSocket, params: CaptureParams): Promise<UserContextResult> {
    const existingId = this.pendingByClient.get(client)?.get(params.toolId);
    if (existingId) this.cancelById(existingId);

    if (client.readyState !== WebSocket.OPEN) {
      throw new UserContextCanceledError('Mobile client disconnected');
    }

    const requestId = randomUUID();
    if (!this.pendingByClient.has(client)) this.pendingByClient.set(client, new Map());
    this.pendingByClient.get(client)!.set(params.toolId, requestId);

    const msg: UserContextRequestMessage = {
      type: 'USER_CONTEXT_REQUEST',
      requestId,
      packId: params.packId,
      toolId: params.toolId,
      title: params.title,
      prompt: params.prompt,
      required: params.required,
      captureMode: params.captureMode,
      timeoutMs: params.timeoutMs,
    };
    client.send(JSON.stringify(msg));

    return new Promise<UserContextResult>((resolve, reject) => {
      const timeoutMs = params.timeoutMs ?? 120_000;
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        this.clearClientTool(client, params.toolId);
        this.sendCancel(client, requestId);
        reject(new UserContextCanceledError('User input timed out'));
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve,
        reject,
        timer,
        toolId: params.toolId,
        client,
      });
    });
  }

  cancelForClient(client: WebSocket): void {
    const requestIds = [...(this.pendingByClient.get(client)?.values() ?? [])];
    for (const requestId of requestIds) {
      this.cancelById(requestId);
    }
    this.pendingByClient.delete(client);
  }

  private cancelById(requestId: string): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;

    this.pending.delete(requestId);
    this.clearClientTool(entry.client, entry.toolId);
    clearTimeout(entry.timer);
    this.sendCancel(entry.client, requestId);
    entry.reject(new UserContextCanceledError());
  }

  private clearClientTool(client: WebSocket, toolId: string): void {
    const map = this.pendingByClient.get(client);
    if (!map) return;
    map.delete(toolId);
    if (map.size === 0) this.pendingByClient.delete(client);
  }

  private sendCancel(client: WebSocket, requestId: string): void {
    if (client.readyState !== WebSocket.OPEN) return;
    const cancelMsg: UserContextCancelMessage = { type: 'USER_CONTEXT_CANCEL', requestId };
    client.send(JSON.stringify(cancelMsg));
  }
}
