import { Injectable } from '@nestjs/common';
import { RunRecord } from '@control-surface/shared';

export { RunRecord };

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
