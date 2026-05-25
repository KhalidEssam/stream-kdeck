import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'events';
import { platform, homedir } from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { TileConfig, TileIconOverride } from '@control-surface/shared';
import { randomUUID } from 'crypto';
import { AppSearchService } from '../app-search/app-search.service';

interface RegistryEntry {
  label: string;
  iconId: string;
  // Windows: try exePaths first (shell.openPath), then protocol, then url
  windowsExePaths?: string[];     // %HOME% is replaced with homedir() at runtime
  windowsIconPaths?: string[];    // checked only for icon extraction, not for launch
  windowsProtocol?: string;
  windowsUrl?: string;
  // macOS: try protocol first, then url
  macProtocol?: string;
  macUrl?: string;
}

interface AppConfig {
  tiles: TileConfig[];
  overrides: Record<string, string>;
}

function normalizeTileIconOverride(icon: TileIconOverride | undefined): TileIconOverride | undefined {
  if (!icon) return undefined;

  if (icon.kind === 'glyph' || icon.kind === 'emoji') {
    const value = icon.value.trim().slice(0, 8);
    return value ? { kind: icon.kind, value } : undefined;
  }

  if (icon.kind === 'image') {
    const uri = icon.uri.trim();
    const validRemote = /^https?:\/\/\S{3,4096}$/i.test(uri);
    const validDataImage = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]{16,200000}$/i.test(uri);
    return validRemote || validDataImage ? { kind: 'image', uri } : undefined;
  }

  return undefined;
}

const BUILT_IN_REGISTRY: Record<string, RegistryEntry> = {
  spotify: {
    label: 'Spotify', iconId: 'spotify',
    windowsProtocol: 'spotify://',
    windowsIconPaths: ['%HOME%\\AppData\\Roaming\\Spotify\\Spotify.exe'],
    macProtocol: 'spotify://',
  },
  obs: {
    label: 'OBS Studio', iconId: 'obs',
    windowsExePaths: [
      'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe',
      '%HOME%\\AppData\\Local\\obs-studio\\bin\\64bit\\obs64.exe',
    ],
    windowsUrl: 'https://obsproject.com',
    macUrl: 'https://obsproject.com',
  },
  vscode: {
    label: 'VS Code', iconId: 'vscode',
    // code:// is not a protocol handler on Windows — check the exe directly
    windowsExePaths: [
      '%HOME%\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      'C:\\Program Files\\Microsoft VS Code\\Code.exe',
    ],
    windowsUrl: 'https://code.visualstudio.com',
    macProtocol: 'vscode://',
  },
  chrome: {
    label: 'Chrome', iconId: 'chrome',
    windowsExePaths: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      '%HOME%\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    ],
    windowsUrl: 'https://google.com',
    macUrl: 'https://google.com',
  },
  discord: {
    label: 'Discord', iconId: 'discord',
    windowsProtocol: 'discord://',
    // Update.exe lives at a fixed path (Squirrel installer) and carries the Discord icon
    windowsIconPaths: ['%HOME%\\AppData\\Local\\Discord\\Update.exe'],
    macProtocol: 'discord://',
  },
  slack: {
    label: 'Slack', iconId: 'slack',
    windowsProtocol: 'slack://',
    windowsIconPaths: ['%HOME%\\AppData\\Local\\slack\\slack.exe'],
    macProtocol: 'slack://',
  },
  notion: {
    label: 'Notion', iconId: 'notion',
    windowsProtocol: 'notion://',
    macProtocol: 'notion://',
  },
  figma: {
    label: 'Figma', iconId: 'figma',
    windowsUrl: 'https://figma.com',
    macUrl: 'https://figma.com',
  },
  claude: {
    label: 'Claude', iconId: 'claude',
    // Claude desktop app (Electron) installs per-user on Windows
    windowsExePaths: [
      '%HOME%\\AppData\\Local\\Programs\\claude\\Claude.exe',
      '%HOME%\\AppData\\Local\\AnthropicClaude\\claude.exe',
    ],
    windowsUrl: 'https://claude.ai',
    macUrl: 'https://claude.ai',
  },
  whatsapp: {
    label: 'WhatsApp', iconId: 'whatsapp',
    windowsExePaths: [
      '%HOME%\\AppData\\Local\\WhatsApp\\WhatsApp.exe',
    ],
    windowsProtocol: 'whatsapp://',
    windowsUrl: 'https://web.whatsapp.com',
    macProtocol: 'whatsapp://',
    macUrl: 'https://web.whatsapp.com',
  },
  github: {
    label: 'GitHub', iconId: 'github',
    windowsUrl: 'https://github.com',
    macUrl: 'https://github.com',
  },
  youtube: {
    label: 'YouTube', iconId: 'youtube',
    windowsUrl: 'https://youtube.com',
    macUrl: 'https://youtube.com',
  },
  twitch: {
    label: 'Twitch', iconId: 'twitch',
    windowsProtocol: 'twitch://',
    windowsIconPaths: ['%HOME%\\AppData\\Local\\Twitch\\Twitch.exe'],
    windowsUrl: 'https://twitch.tv',
    macProtocol: 'twitch://',
    macUrl: 'https://twitch.tv',
  },
  powershell: {
    label: 'PowerShell', iconId: 'powershell',
    windowsExePaths: [
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ],
  },
  terminal: {
    label: 'Terminal', iconId: 'terminal',
    windowsExePaths: [
      'C:\\Windows\\explorer.exe', // fallback: open a window (wt.exe path is versioned in WindowsApps)
    ],
    macUrl: 'file:///System/Applications/Utilities/Terminal.app',
  },
  explorer: {
    label: 'File Explorer', iconId: 'explorer',
    windowsExePaths: ['C:\\Windows\\explorer.exe'],
  },
  steam: {
    label: 'Steam', iconId: 'steam',
    windowsProtocol: 'steam://',
    windowsIconPaths: [
      'C:\\Program Files (x86)\\Steam\\steam.exe',
      'C:\\Program Files\\Steam\\steam.exe',
    ],
    macProtocol: 'steam://',
  },
  postman: {
    label: 'Postman', iconId: 'postman',
    windowsExePaths: [
      '%HOME%\\AppData\\Local\\Postman\\Postman.exe',
    ],
    windowsUrl: 'https://web.postman.co',
    macUrl: 'https://web.postman.co',
  },
  linear: {
    label: 'Linear', iconId: 'linear',
    windowsUrl: 'https://linear.app',
    macUrl: 'https://linear.app',
  },
  vercel: {
    label: 'Vercel', iconId: 'vercel',
    windowsUrl: 'https://vercel.com',
    macUrl: 'https://vercel.com',
  },
};

@Injectable()
export class AppRegistryService extends EventEmitter implements OnModuleInit {
  private config: AppConfig = { tiles: [], overrides: {} };
  private readonly configPath: string;
  private readonly appIconCache = new Map<string, string>(); // appId → base64

  constructor(private readonly appSearch: AppSearchService) {
    super();
    this.configPath = path.join(
      process.env.USER_DATA_PATH ?? path.join(__dirname, '../../'),
      'apps.config.json',
    );
    this.loadConfig();
  }

  onModuleInit(): void {
    // Defer icon enrichment so it doesn't delay startup
    setTimeout(() => void this.enrichIcons(), 10_000);
  }

  private async enrichIcons(): Promise<void> {
    if (platform() !== 'win32') return;
    const home = homedir();
    let anyExtracted = false;

    // Enrich built-in app tiles: check exePaths then iconPaths
    for (const [appId, entry] of Object.entries(BUILT_IN_REGISTRY)) {
      const candidates = [...(entry.windowsExePaths ?? []), ...(entry.windowsIconPaths ?? [])];
      for (const pattern of candidates) {
        const resolved = pattern.replace(/%HOME%/g, home).replace(/%USERPROFILE%/g, home);
        if (!fs.existsSync(resolved)) continue;
        try {
          const icon = this.appSearch.extractIcon(resolved);
          if (icon) { this.appIconCache.set(appId, icon); anyExtracted = true; }
        } catch { /* icon is optional */ }
        break; // use first found path
      }
    }

    // Enrich custom config tiles that have an exe path but no icon yet
    let customUpdated = false;
    for (const tile of this.config.tiles) {
      if (tile.iconBase64 || tile.action.kind !== 'EXEC') continue;
      const exePath = tile.action.exePath;
      if (!exePath || !fs.existsSync(exePath)) continue;
      try {
        const icon = this.appSearch.extractIcon(exePath);
        if (icon) {
          (tile as TileConfig & { iconBase64: string }).iconBase64 = icon;
          customUpdated = true;
          anyExtracted = true;
        }
      } catch { /* icon is optional */ }
    }
    if (customUpdated) this.persist();

    if (anyExtracted) this.emit('tilesUpdated');
  }

  private loadConfig(): void {
    if (fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw) as { tiles: Partial<TileConfig>[]; overrides: Record<string, string> };
        let needsPersist = false;
        const tiles = parsed.tiles.map((t) => {
          if (!t.id) {
            needsPersist = true;
            return { ...t, id: randomUUID() } as TileConfig;
          }
          return t as TileConfig;
        });
        this.config = { tiles, overrides: parsed.overrides ?? {} };
        if (needsPersist) this.persist();
      } catch {
        this.config = { tiles: [], overrides: {} };
      }
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[AppRegistry] persist failed:', e);
    }
  }

  getTiles(): TileConfig[] {
    const pinnedTiles = this.config.tiles.filter((tile) => tile.pinned);
    const unpinnedTiles = this.config.tiles.filter((tile) => !tile.pinned);
    const all = [...pinnedTiles, ...unpinnedTiles];
    return all.map((tile) => {
      if (tile.kind === 'app' && !tile.iconBase64 && tile.action.kind === 'APP_LAUNCH') {
        const icon = this.appIconCache.get(tile.action.appId);
        if (icon) return { ...tile, iconBase64: icon };
      }
      return tile;
    });
  }

  addTile(tile: Omit<TileConfig, 'id'>): void {
    const isDuplicate = this.config.tiles.some(
      (t) => JSON.stringify(t.action) === JSON.stringify(tile.action),
    );
    if (isDuplicate) return;

    const withId: TileConfig = { ...tile, id: randomUUID() };
    this.config.tiles.push(withId);
    this.persist();
  }

  removeTile(tileId: string): void {
    this.config.tiles = this.config.tiles.filter((t) => t.id !== tileId);
    this.persist();
  }

  setTilePinned(tileId: string, pinned: boolean): void {
    const index = this.config.tiles.findIndex((tile) => tile.id === tileId);
    if (index === -1) return;

    const [tile] = this.config.tiles.splice(index, 1);
    const updated = { ...tile, pinned: pinned || undefined };
    if (pinned) this.config.tiles.unshift(updated);
    else this.config.tiles.push(updated);
    this.persist();
  }

  setTileIcon(tileId: string, customIcon: TileIconOverride | undefined): void {
    const index = this.config.tiles.findIndex((tile) => tile.id === tileId);
    if (index === -1) return;

    const normalized = normalizeTileIconOverride(customIcon);
    this.config.tiles[index] = {
      ...this.config.tiles[index],
      customIcon: normalized,
    };
    if (!normalized) delete this.config.tiles[index].customIcon;
    this.persist();
  }

  reorderTiles(tileIds: string[]): void {
    const lookup = new Map(this.config.tiles.map((t) => [t.id, t]));
    const reordered: TileConfig[] = [];
    for (const id of tileIds) {
      const tile = lookup.get(id);
      if (tile) reordered.push(tile);
    }
    for (const tile of this.config.tiles) {
      if (!tileIds.includes(tile.id)) reordered.push(tile);
    }
    this.config.tiles = reordered;
    this.persist();
  }

  // Resolves the launch target for an appId.
  // Returns an absolute file path (use shell.openPath) or a URL/protocol (use shell.openExternal).
  resolveTarget(appId: string): string {
    const override = this.config.overrides[appId];
    if (override) return override;

    const entry = BUILT_IN_REGISTRY[appId];
    if (!entry) throw new Error(`Unknown app: ${appId}`);

    const isWindows = platform() === 'win32';
    const home = homedir();

    if (isWindows) {
      // 1. Try exe paths (first existing one wins)
      if (entry.windowsExePaths) {
        for (const pattern of entry.windowsExePaths) {
          const resolved = pattern.replace(/%HOME%/g, home).replace(/%USERPROFILE%/g, home);
          if (fs.existsSync(resolved)) return resolved;
        }
      }
      // 2. Protocol handler (opens app if installed, browser handles URL protocols)
      if (entry.windowsProtocol) return entry.windowsProtocol;
      // 3. Web URL fallback
      if (entry.windowsUrl) return entry.windowsUrl;
    } else {
      if (entry.macProtocol) return entry.macProtocol;
      if (entry.macUrl) return entry.macUrl;
    }

    throw new Error(`App "${appId}" is not available on this platform`);
  }

  isKnownApp(appId: string): boolean {
    return appId in BUILT_IN_REGISTRY || appId in this.config.overrides;
  }

  getBuiltInApps(): Array<{ appId: string } & RegistryEntry> {
    return Object.entries(BUILT_IN_REGISTRY).map(([appId, entry]) => ({ appId, ...entry }));
  }
}
