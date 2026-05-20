import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { platform } from 'os';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { MediaSession } from '@control-surface/shared';

interface AudioSession {
  pid: number;
  name: string;
  volume: number;
  muted: boolean;
}

interface MediaConfig {
  pinnedMediaApps: Array<{ processName: string; label: string }>;
}

@Injectable()
export class MediaService implements OnModuleInit, OnModuleDestroy {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  prevSnapshot: AudioSession[] = [];
  config: MediaConfig = { pinnedMediaApps: [] };
  private readonly configPath: string;
  private broadcastFn: ((sessions: MediaSession[], plt: 'win32' | 'darwin') => void) | null = null;

  constructor() {
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
        this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8')) as MediaConfig;
      } catch {
        this.config = { pinnedMediaApps: [] };
      }
    }
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
      this.broadcastFn?.([], platform() as 'win32' | 'darwin');
    }
  }

  async getSessions(): Promise<AudioSession[]> {
    if (platform() === 'win32') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const audioMixer = require('node-audio-volume-mixer') as {
        getAudioSessions: () => AudioSession[];
      };
      return audioMixer.getAudioSessions();
    }
    const vol = this.getMacSystemVolume();
    return [{ pid: 0, name: 'system', volume: vol, muted: false }];
  }

  private getMacSystemVolume(): number {
    try {
      const out = execSync(`osascript -e 'output volume of (get volume settings)'`, { encoding: 'utf-8' }).trim();
      return Number(out) / 100;
    } catch {
      return 0;
    }
  }

  hasChanged(next: AudioSession[]): boolean {
    if (next.length !== this.prevSnapshot.length) return true;
    for (let i = 0; i < next.length; i++) {
      const a = next[i], b = this.prevSnapshot[i];
      if (!b || a.pid !== b.pid || Math.abs(a.volume - b.volume) > 0.001 || a.muted !== b.muted) return true;
    }
    return false;
  }

  buildMediaState(sessions: AudioSession[]): MediaSession[] {
    const liveKeys = new Set(sessions.map(s => s.name.toLowerCase()));
    const result: MediaSession[] = sessions.map(s => ({
      processName: s.name,
      label: s.name.replace(/\.exe$/i, ''),
      volume: s.volume,
      muted: s.muted,
      pinned: this.config.pinnedMediaApps.some(
        p => p.processName.toLowerCase() === s.name.toLowerCase(),
      ),
    }));
    for (const p of this.config.pinnedMediaApps) {
      if (!liveKeys.has(p.processName.toLowerCase())) {
        result.push({ processName: p.processName, label: p.label, volume: 0, muted: false, pinned: true });
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
      const audioMixer = require('node-audio-volume-mixer') as {
        setAudioSessionVolume: (pid: number, vol: number) => void;
      };
      audioMixer.setAudioSessionVolume(session.pid, newVol);
    } else {
      try { execSync(`osascript -e 'set volume output volume ${Math.round(newVol * 100)}'`); } catch {}
    }
  }

  setMute(processName: string, muted: boolean): void {
    const session = this.prevSnapshot.find(s => s.name.toLowerCase() === processName.toLowerCase());
    if (platform() === 'win32') {
      if (!session) return;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const audioMixer = require('node-audio-volume-mixer') as {
        setAudioSessionMuted: (pid: number, muted: boolean) => void;
      };
      audioMixer.setAudioSessionMuted(session.pid, muted);
    } else {
      try { execSync(`osascript -e 'set volume ${muted ? 'with' : 'without'} output muted'`); } catch {}
    }
  }

  bringToFront(processName: string): void {
    const name = processName.replace(/\.exe$/i, '');
    if (platform() === 'win32') {
      try {
        execSync(`powershell -command "(New-Object -ComObject WScript.Shell).AppActivate('${name}')"`, { timeout: 3000 });
      } catch {}
    } else {
      try {
        execSync(`osascript -e 'tell application "${name}" to activate'`, { timeout: 3000 });
      } catch {}
    }
  }

  pinApp(processName: string, label: string, pinned: boolean): void {
    if (pinned) {
      if (!this.config.pinnedMediaApps.some(p => p.processName === processName)) {
        this.config.pinnedMediaApps.push({ processName, label });
      }
    } else {
      this.config.pinnedMediaApps = this.config.pinnedMediaApps.filter(p => p.processName !== processName);
    }
    this.persistConfig();
  }
}
