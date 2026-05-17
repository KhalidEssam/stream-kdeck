import { Injectable } from '@nestjs/common';
import { platform } from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { TileConfig, ButtonAction } from '@control-surface/shared';
import { randomUUID } from 'crypto';

interface RegistryEntry {
  label: string;
  iconId: string;
  windows: string;
  mac: string;
}

interface AppConfig {
  tiles: Omit<TileConfig, 'id'>[];
  overrides: Record<string, string>;
}

const BUILT_IN_REGISTRY: Record<string, RegistryEntry> = {
  spotify:    { label: 'Spotify',      iconId: 'spotify',    windows: 'spotify://',                                              mac: 'spotify://' },
  obs:        { label: 'OBS Studio',   iconId: 'obs',        windows: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe',    mac: 'open -a "OBS"' },
  vscode:     { label: 'VS Code',      iconId: 'vscode',     windows: 'code://',                                                  mac: 'vscode://' },
  chrome:     { label: 'Chrome',       iconId: 'chrome',     windows: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', mac: 'open -a "Google Chrome"' },
  discord:    { label: 'Discord',      iconId: 'discord',    windows: 'discord://',                                               mac: 'discord://' },
  slack:      { label: 'Slack',        iconId: 'slack',      windows: 'slack://',                                                 mac: 'slack://' },
  notion:     { label: 'Notion',       iconId: 'notion',     windows: 'notion://',                                                mac: 'notion://' },
  figma:      { label: 'Figma',        iconId: 'figma',      windows: 'https://figma.com',                                        mac: 'https://figma.com' },
  claude:     { label: 'Claude',       iconId: 'claude',     windows: 'https://claude.ai',                                        mac: 'https://claude.ai' },
  github:     { label: 'GitHub',       iconId: 'github',     windows: 'https://github.com',                                       mac: 'https://github.com' },
  youtube:    { label: 'YouTube',      iconId: 'youtube',    windows: 'https://youtube.com',                                      mac: 'https://youtube.com' },
  twitch:     { label: 'Twitch',       iconId: 'twitch',     windows: 'https://twitch.tv',                                        mac: 'https://twitch.tv' },
  powershell: { label: 'PowerShell',   iconId: 'powershell', windows: 'powershell.exe',                                           mac: '' },
  terminal:   { label: 'Terminal',     iconId: 'terminal',   windows: 'wt.exe',                                                   mac: 'open -a Terminal' },
  explorer:   { label: 'File Explorer',iconId: 'explorer',   windows: 'explorer.exe',                                             mac: 'open ~' },
  steam:      { label: 'Steam',        iconId: 'steam',      windows: 'steam://',                                                 mac: 'steam://' },
  postman:    { label: 'Postman',      iconId: 'postman',    windows: 'https://web.postman.co',                                   mac: 'https://web.postman.co' },
  linear:     { label: 'Linear',       iconId: 'linear',     windows: 'https://linear.app',                                       mac: 'https://linear.app' },
  vercel:     { label: 'Vercel',       iconId: 'vercel',     windows: 'https://vercel.com',                                       mac: 'https://vercel.com' },
};

const CONFIG_PATH = path.join(__dirname, '../../apps.config.json');

@Injectable()
export class AppRegistryService {
  private config: AppConfig = { tiles: [], overrides: {} };

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    if (fs.existsSync(CONFIG_PATH)) {
      try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        this.config = JSON.parse(raw) as AppConfig;
      } catch {
        this.config = { tiles: [], overrides: {} };
      }
    }
  }

  getTiles(): TileConfig[] {
    return this.config.tiles.map((t) => ({ ...t, id: randomUUID() }));
  }

  addTile(tile: Omit<TileConfig, 'id'>): void {
    this.config.tiles.push(tile);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  resolveTarget(appId: string): string {
    const override = this.config.overrides[appId];
    if (override) return override;

    const entry = BUILT_IN_REGISTRY[appId];
    if (!entry) throw new Error(`Unknown app: ${appId}`);

    const isWindows = platform() === 'win32';
    const target = isWindows ? entry.windows : entry.mac;

    if (!target) throw new Error(`App "${appId}" is not available on this platform`);

    return target;
  }

  isKnownApp(appId: string): boolean {
    return appId in BUILT_IN_REGISTRY || appId in this.config.overrides;
  }

  getBuiltInApps(): Array<{ appId: string } & RegistryEntry> {
    return Object.entries(BUILT_IN_REGISTRY).map(([appId, entry]) => ({ appId, ...entry }));
  }
}
