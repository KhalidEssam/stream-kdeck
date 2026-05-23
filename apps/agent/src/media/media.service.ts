import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { platform } from 'os';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { MediaSession } from '@control-surface/shared';
import { IconService } from './icon.service';

interface AudioSession {
  pid: number;
  name: string;
  volume: number;
  muted: boolean;
  iconBase64?: string;
}

interface MediaConfig {
  pinnedMediaApps: Array<{ processName: string; label: string; iconBase64?: string }>;
}

@Injectable()
export class MediaService implements OnModuleInit, OnModuleDestroy {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private prevSnapshot: AudioSession[] = [];
  private config: MediaConfig = { pinnedMediaApps: [] };
  private readonly configPath: string;
  private broadcastFn: ((sessions: MediaSession[], plt: 'win32' | 'darwin') => void) | null = null;

  constructor(private readonly iconService: IconService) {
    this.configPath = path.join(
      process.env.USER_DATA_PATH ?? path.join(__dirname, '../../'),
      'media.config.json',
    );
    this.loadConfig();
  }

  setBroadcastFn(fn: (sessions: MediaSession[], plt: 'win32' | 'darwin') => void): void {
    this.broadcastFn = fn;
  }

  onModuleInit(): void {
    this.pollInterval = setInterval(() => void this.tick(), 300);
  }

  onModuleDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private loadConfig(): void {
    if (fs.existsSync(this.configPath)) {
      try {
        this.config = this.normalizeConfig(JSON.parse(fs.readFileSync(this.configPath, 'utf-8')));
      } catch {
        this.config = { pinnedMediaApps: [] };
      }
    }
  }

  private normalizeConfig(value: unknown): MediaConfig {
    const maybe = value as Partial<MediaConfig> | null;
    const pinnedMediaApps = Array.isArray(maybe?.pinnedMediaApps)
      ? maybe.pinnedMediaApps.filter(
        (app): app is { processName: string; label: string; iconBase64?: string } =>
          typeof app?.processName === 'string' && typeof app?.label === 'string',
      ).map((app) => ({
        processName: app.processName,
        label: app.label,
        iconBase64: typeof app.iconBase64 === 'string' ? app.iconBase64 : undefined,
      }))
      : [];

    return { pinnedMediaApps };
  }

  private persistConfig(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[MediaService] persist failed:', e);
    }
  }

  private async tick(): Promise<void> {
    try {
      const sessions = await this.getSessions();
      if (this.hasChanged(sessions)) {
        this.prevSnapshot = sessions;
        const mediaState = this.buildMediaState(sessions);
        this.broadcastFn?.(mediaState, platform() as 'win32' | 'darwin');
      }
    } catch (e) {
      console.error('[MediaService] poll error:', e);
      if (this.prevSnapshot.length > 0) {
        this.broadcastFn?.(this.buildMediaState(this.prevSnapshot), platform() as 'win32' | 'darwin');
      }
    }
  }

  async getSessions(): Promise<AudioSession[]> {
    if (platform() === 'win32') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NodeAudioVolumeMixer: mixer } = require('node-audio-volume-mixer') as {
        NodeAudioVolumeMixer: {
          getAudioSessionProcesses: () => Array<{ pid: number; name: string }>;
          getAudioSessionVolumeLevelScalar: (pid: number) => number;
          isAudioSessionMuted: (pid: number) => boolean;
        };
      };
      const raw = mixer.getAudioSessionProcesses().map(p => ({
        pid: p.pid,
        name: p.name,
        volume: mixer.getAudioSessionVolumeLevelScalar(p.pid),
        muted: mixer.isAudioSessionMuted(p.pid),
      }));
      const settled = await Promise.all(
        raw.map(async s => {
          if (!await this.iconService.shouldInclude(s.pid, s.name)) return null;
          const iconBase64 = await this.iconService.getIconBase64(s.pid, s.name);
          return { ...s, iconBase64 } as AudioSession;
        }),
      );
      return settled.filter((s): s is AudioSession => s !== null);
    }
    const vol = this.getMacSystemVolume();
    return [{ pid: 0, name: 'system', volume: vol, muted: false }];
  }

  private getMacSystemVolume(): number {
    try {
      const out = execSync(`osascript -e 'output volume of (get volume settings)'`, { encoding: 'utf-8' }).trim();
      const num = Number(out);
      return isNaN(num) ? 0 : num / 100;
    } catch {
      return 0;
    }
  }

  hasChanged(next: AudioSession[]): boolean {
    if (next.length !== this.prevSnapshot.length) return true;
    for (let i = 0; i < next.length; i++) {
      const a = next[i], b = this.prevSnapshot[i];
      if (!b || a.pid !== b.pid || Math.abs(a.volume - b.volume) > 0.001 || a.muted !== b.muted || a.iconBase64 !== b.iconBase64) return true;
    }
    return false;
  }

  buildMediaState(sessions: AudioSession[]): MediaSession[] {
    const pinnedMediaApps = this.config.pinnedMediaApps ?? [];
    const pinnedByName = new Map(
      pinnedMediaApps.map((p) => [p.processName.toLowerCase(), p]),
    );
    const liveKeys = new Set(sessions.map(s => s.name.toLowerCase()));
    const result: MediaSession[] = sessions.map(s => ({
      processName: s.name,
      label: s.name.replace(/\.exe$/i, ''),
      iconBase64: s.iconBase64 ?? pinnedByName.get(s.name.toLowerCase())?.iconBase64,
      volume: s.volume,
      muted: s.muted,
      pinned: pinnedByName.has(s.name.toLowerCase()),
      active: true,
    }));
    for (const p of pinnedMediaApps) {
      if (!liveKeys.has(p.processName.toLowerCase())) {
        result.push({
          processName: p.processName,
          label: p.label,
          iconBase64: p.iconBase64,
          volume: 0,
          muted: false,
          pinned: true,
          active: false,
        });
      }
    }
    return result;
  }

  adjustVolume(processName: string, delta: number): void {
    const session = this.prevSnapshot.find(s => s.name.toLowerCase() === processName.toLowerCase());
    const current = session?.volume ?? 0;
    const newVol = Math.max(0, Math.min(1, current + delta));
    if (platform() === 'win32') {
      if (!session) return;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NodeAudioVolumeMixer: mixer } = require('node-audio-volume-mixer') as {
        NodeAudioVolumeMixer: { setAudioSessionVolumeLevelScalar: (pid: number, vol: number) => void };
      };
      mixer.setAudioSessionVolumeLevelScalar(session.pid, newVol);
    } else {
      if (!session && processName !== 'system') return;
      try { execSync(`osascript -e 'set volume output volume ${Math.round(newVol * 100)}'`); } catch {}
    }
  }

  setVolume(processName: string, volume: number): void {
    const session = this.prevSnapshot.find(s => s.name.toLowerCase() === processName.toLowerCase());
    const clamped = Math.max(0, Math.min(1, volume));
    if (platform() === 'win32') {
      if (!session) return;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NodeAudioVolumeMixer: mixer } = require('node-audio-volume-mixer') as {
        NodeAudioVolumeMixer: { setAudioSessionVolumeLevelScalar: (pid: number, vol: number) => void };
      };
      mixer.setAudioSessionVolumeLevelScalar(session.pid, clamped);
    } else {
      if (!session && processName !== 'system') return;
      try { execSync(`osascript -e 'set volume output volume ${Math.round(clamped * 100)}'`); } catch {}
    }
  }

  setMute(processName: string, muted: boolean): void {
    const session = this.prevSnapshot.find(s => s.name.toLowerCase() === processName.toLowerCase());
    if (platform() === 'win32') {
      if (!session) return;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NodeAudioVolumeMixer: mixer } = require('node-audio-volume-mixer') as {
        NodeAudioVolumeMixer: { setAudioSessionMute: (pid: number, muted: boolean) => void };
      };
      mixer.setAudioSessionMute(session.pid, muted);
    } else {
      try { execSync(`osascript -e 'set volume ${muted ? 'with' : 'without'} output muted'`); } catch {}
    }
  }

  bringToFront(processName: string): void {
    const name = processName.replace(/\.exe$/i, '');
    if (platform() === 'win32') {
      try {
        const escaped = name.replace(/'/g, "''");
        execSync(`powershell -command "(New-Object -ComObject WScript.Shell).AppActivate('${escaped}')"`, { timeout: 3000 });
      } catch {}
    } else {
      try {
        execSync(`osascript -e 'tell application "${name}" to activate'`, { timeout: 3000 });
      } catch {}
    }
  }

  pinApp(processName: string, label: string, pinned: boolean, iconBase64?: string): void {
    if (pinned) {
      const existing = this.config.pinnedMediaApps.find(p => p.processName.toLowerCase() === processName.toLowerCase());
      if (existing) {
        existing.label = label;
        existing.iconBase64 = iconBase64 ?? existing.iconBase64;
      } else {
        this.config.pinnedMediaApps.push({ processName, label, iconBase64 });
      }
    } else {
      this.config.pinnedMediaApps = this.config.pinnedMediaApps.filter(
        p => p.processName.toLowerCase() !== processName.toLowerCase(),
      );
    }
    this.persistConfig();
    this.broadcastFn?.(this.buildMediaState(this.prevSnapshot), platform() as 'win32' | 'darwin');
  }
}
