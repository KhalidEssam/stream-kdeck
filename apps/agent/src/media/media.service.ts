import { Injectable, OnModuleDestroy } from '@nestjs/common';
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

const MEDIA_POLL_MS = 1000;
const MEDIA_FIRST_POLL_DELAY_MS = 1500;
const GENERIC_AUDIO_SESSION_NAMES = new Set([
  'system',
  'system sounds',
  'unknown',
  'name not available',
]);

@Injectable()
export class MediaService implements OnModuleDestroy {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private firstPollTimer: ReturnType<typeof setTimeout> | null = null;
  private prevSnapshot: AudioSession[] = [];
  private config: MediaConfig = { pinnedMediaApps: [] };
  private readonly configPath: string;
  private broadcastFn: ((sessions: MediaSession[], plt: 'win32' | 'darwin') => void) | null = null;
  private readonly diagnosticsTimestamps = new Map<string, number>();

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

  startPolling(): void {
    if (this.pollInterval || this.firstPollTimer) return;
    this.firstPollTimer = setTimeout(() => {
      this.firstPollTimer = null;
      void this.tick();
      this.pollInterval = setInterval(() => void this.tick(), MEDIA_POLL_MS);
    }, MEDIA_FIRST_POLL_DELAY_MS);
  }

  onModuleDestroy(): void {
    if (this.firstPollTimer) clearTimeout(this.firstPollTimer);
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.firstPollTimer = null;
    this.pollInterval = null;
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
      ? maybe.pinnedMediaApps
        .map(normalizePinnedMediaApp)
        .filter((app): app is MediaConfig['pinnedMediaApps'][number] => app !== null)
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
      const raw = mixer.getAudioSessionProcesses()
        .map((p) => this.readWindowsAudioSession(p, mixer))
        .filter((s): s is AudioSession => s !== null);
      const settled = await Promise.all(
        raw.map(async s => {
          if (!await this.iconService.shouldInclude(s.pid, s.name)) return null;
          const iconBase64 = await this.iconService.getIconBase64(s.pid, s.name);
          return { ...s, iconBase64 } as AudioSession;
        }),
      );
      const sessions = this.dedupeSessionsByProcess(
        settled.filter((s): s is AudioSession => s !== null),
      );
      this.logWindowsSessionDiagnostics(raw, sessions);
      return sessions;
    }
    const vol = this.getMacSystemVolume();
    return [{ pid: 0, name: 'system', volume: vol, muted: false }];
  }

  private readWindowsAudioSession(
    process: { pid: number; name: string },
    mixer: {
      getAudioSessionVolumeLevelScalar: (pid: number) => number;
      isAudioSessionMuted: (pid: number) => boolean;
    },
  ): AudioSession | null {
    const normalized = this.normalizeWindowsAudioProcess(process);
    if (!normalized) return null;

    try {
      return {
        pid: normalized.pid,
        name: normalized.name,
        volume: mixer.getAudioSessionVolumeLevelScalar(normalized.pid),
        muted: mixer.isAudioSessionMuted(normalized.pid),
      };
    } catch (error) {
      this.logThrottledDiagnostics(
        `read-failed:${normalized.pid}:${normalized.name}`,
        `[MediaService] Could not read Windows audio session ${normalized.name} (${normalized.pid}): ${formatError(error)}`,
      );
      return null;
    }
  }

  private normalizeWindowsAudioProcess(process: { pid: number; name: string }): { pid: number; name: string } | null {
    const pid = Number(process.pid);
    if (!Number.isFinite(pid) || pid <= 0) return null;

    const name = normalizeProcessName(process.name);
    if (!name) return null;

    const base = processBaseName(name);
    if (!base || GENERIC_AUDIO_SESSION_NAMES.has(base)) return null;

    return { pid, name };
  }

  private dedupeSessionsByProcess(sessions: AudioSession[]): AudioSession[] {
    const byName = new Map<string, AudioSession>();

    for (const session of sessions) {
      const key = session.name.toLowerCase();
      const existing = byName.get(key);
      if (!existing || isBetterAudioSession(session, existing)) {
        byName.set(key, session);
      }
    }

    return Array.from(byName.values());
  }

  private logWindowsSessionDiagnostics(raw: AudioSession[], sessions: AudioSession[]): void {
    if (raw.length === 0) {
      this.logThrottledDiagnostics(
        'empty-raw',
        '[MediaService] Windows audio mixer returned 0 sessions. If audio is playing, check Windows Volume Mixer and app output device.',
      );
      return;
    }

    if (sessions.length === 0) {
      const names = raw.map(s => `${s.name}(${s.pid})`).join(', ');
      this.logThrottledDiagnostics(
        `filtered:${names}`,
        `[MediaService] Windows audio mixer returned ${raw.length} session(s), but all were filtered: ${names}`,
      );
    }
  }

  private logThrottledDiagnostics(key: string, message: string): void {
    const now = Date.now();
    const lastAt = this.diagnosticsTimestamps.get(key) ?? 0;
    if (now - lastAt < 10_000) return;
    this.diagnosticsTimestamps.set(key, now);
    console.warn(message);
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
    const normalizedSessions = sessions
      .map((s) => {
        const name = normalizeProcessName(s.name);
        return name ? { ...s, name } : null;
      })
      .filter((s): s is AudioSession => s !== null);
    const liveKeys = new Set(normalizedSessions.map(s => s.name.toLowerCase()));
    const result: MediaSession[] = normalizedSessions.map(s => ({
      processName: s.name,
      label: labelForProcessName(s.name),
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
    const normalizedProcessName = normalizeProcessName(processName);
    if (!normalizedProcessName) return;

    if (pinned) {
      const normalizedLabel = label.trim() || labelForProcessName(normalizedProcessName);
      const existing = this.config.pinnedMediaApps.find(p => p.processName.toLowerCase() === normalizedProcessName.toLowerCase());
      if (existing) {
        existing.label = normalizedLabel;
        existing.iconBase64 = iconBase64 ?? existing.iconBase64;
      } else {
        this.config.pinnedMediaApps.push({ processName: normalizedProcessName, label: normalizedLabel, iconBase64 });
      }
    } else {
      this.config.pinnedMediaApps = this.config.pinnedMediaApps.filter(
        p => p.processName.toLowerCase() !== normalizedProcessName.toLowerCase(),
      );
    }
    this.persistConfig();
    this.broadcastFn?.(this.buildMediaState(this.prevSnapshot), platform() as 'win32' | 'darwin');
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeProcessName(processName: string): string | null {
  const trimmed = processName.trim();
  if (!trimmed) return null;

  const fileName = path.win32.basename(trimmed).replace(/^"+|"+$/g, '').trim();
  if (!fileName || !/[a-z0-9]/i.test(fileName)) return null;

  return fileName;
}

function processBaseName(processName: string): string {
  return processName.replace(/\.exe$/i, '').trim().toLowerCase();
}

function labelForProcessName(processName: string): string {
  return processName.replace(/\.exe$/i, '').trim() || processName;
}

function normalizePinnedMediaApp(value: unknown): MediaConfig['pinnedMediaApps'][number] | null {
  const maybe = value as Partial<MediaConfig['pinnedMediaApps'][number]> | null;
  const processName = typeof maybe?.processName === 'string'
    ? normalizeProcessName(maybe.processName)
    : null;
  if (!processName) return null;

  const label = typeof maybe?.label === 'string' && maybe.label.trim()
    ? maybe.label.trim()
    : labelForProcessName(processName);

  return {
    processName,
    label,
    iconBase64: typeof maybe?.iconBase64 === 'string' ? maybe.iconBase64 : undefined,
  };
}

function isBetterAudioSession(candidate: AudioSession, existing: AudioSession): boolean {
  if (candidate.muted !== existing.muted) return !candidate.muted;
  if (!!candidate.iconBase64 !== !!existing.iconBase64) return !!candidate.iconBase64;
  return candidate.volume > existing.volume;
}
