import { Injectable } from '@nestjs/common';
import { platform, homedir } from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { TileConfig } from '@control-surface/shared';
import { randomUUID } from 'crypto';

interface RegistryEntry {
  label: string;
  iconId: string;
  // Windows: try exePaths first (shell.openPath), then protocol, then url
  windowsExePaths?: string[]; // %HOME% is replaced with homedir() at runtime
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

// Built-in AI clipboard tiles are not stored in config; pinned user tiles can appear before them.
// Users cannot remove them (they are not in apps.config.json).
const DEFAULT_AI_TILES: TileConfig[] = [
  {
    id: 'builtin-ai-explain',
    kind: 'ai',
    label: 'Explain Error',
    iconId: 'ai',
    color: '#2D1B69',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Explain this error clearly and concisely. What is the root cause and how do I fix it?',
      outputMode: 'viewer',
    },
  },
  {
    id: 'builtin-ai-grammar',
    kind: 'ai',
    label: 'Fix Grammar',
    iconId: 'ai',
    color: '#0D3B2E',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Fix all grammar and spelling errors. Return only the corrected text, no commentary.',
      outputMode: 'autopaste',
    },
  },
  {
    id: 'builtin-ai-tweet',
    kind: 'ai',
    label: 'Write Tweet',
    iconId: 'ai',
    color: '#1A237E',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Write a compelling tweet based on this content. Max 280 characters. No hashtags unless relevant.',
      outputMode: 'clipboard',
    },
  },
  {
    id: 'builtin-ai-shorten',
    kind: 'ai',
    label: 'Make Shorter',
    iconId: 'ai',
    color: '#2C1654',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Rewrite this to be shorter and more concise. Cut filler. Keep the core message intact.',
      outputMode: 'autopaste',
    },
  },
  {
    id: 'builtin-ai-tests',
    kind: 'ai',
    label: 'Write Tests',
    iconId: 'ai',
    color: '#1B2631',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Write comprehensive unit tests for this code. Use the same language and testing framework visible in the code.',
      outputMode: 'viewer',
    },
  },
  {
    id: 'builtin-ai-translate',
    kind: 'ai',
    label: 'Translate ES',
    iconId: 'ai',
    color: '#1A3C34',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Translate this text to Spanish. Return only the translation.',
      outputMode: 'clipboard',
    },
  },
];

const BUILT_IN_REGISTRY: Record<string, RegistryEntry> = {
  spotify: {
    label: 'Spotify', iconId: 'spotify',
    windowsProtocol: 'spotify://',
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
    macProtocol: 'discord://',
  },
  slack: {
    label: 'Slack', iconId: 'slack',
    windowsProtocol: 'slack://',
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
    // Try protocol first — opens app if installed, else browser handles it
    windowsProtocol: 'twitch://',
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
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  getTiles(): TileConfig[] {
    // Pinned user tiles appear before the default AI tools; everything else keeps config order.
    const pinnedTiles = this.config.tiles.filter((tile) => tile.pinned);
    const unpinnedTiles = this.config.tiles.filter((tile) => !tile.pinned);
    return [...pinnedTiles, ...DEFAULT_AI_TILES, ...unpinnedTiles];
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
    // Built-in AI tile IDs start with 'builtin-' — they are not in config.tiles and cannot be removed
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
