import { Injectable } from '@nestjs/common';
import { ButtonAction } from '@control-surface/shared';

export interface RunRecord {
  id: string;
  timestamp: string;   // ISO 8601
  action: ButtonAction;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
}

const MAX_HISTORY = 500;

@Injectable()
export class RunHistoryService {
  private readonly records: RunRecord[] = [];

  push(record: RunRecord): void {
    this.records.push(record);
    if (this.records.length > MAX_HISTORY) {
      this.records.shift();
    }
  }

  getAll(): RunRecord[] {
    return [...this.records].reverse();  // newest first
  }

  clear(): void {
    this.records.length = 0;
  }
}
