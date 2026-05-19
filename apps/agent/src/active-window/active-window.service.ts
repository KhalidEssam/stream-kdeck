import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import activeWin from 'active-win';

const POLL_MS = 500;
const DEBOUNCE_MS = 1500;

@Injectable()
export class ActiveWindowService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  current: string | null = null;

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  // Use a sentinel so we can distinguish "never polled" from "polled, got null"
  private pending: string | null | undefined = undefined;

  onModuleInit(): void {
    this.pollInterval = setInterval(() => void this.poll(), POLL_MS);
  }

  onModuleDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  private async poll(): Promise<void> {
    const win = await activeWin().catch(() => undefined);
    const name = win?.owner?.name ?? null;

    if (name === this.pending) return;
    this.pending = name;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.current = name;
      this.emit('appChanged', name);
    }, DEBOUNCE_MS);
  }
}
