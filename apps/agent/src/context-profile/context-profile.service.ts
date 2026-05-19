import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ContextShortcut, ContextProfileSummary } from '@control-surface/shared';
import { AiRouterService, AiQuotaError } from '../ai/ai-router.service';

export interface ContextProfile {
  source: 'llm' | 'user' | 'llm-failed' | 'llm-quota';
  generatedAt?: string;
  appLabel: string;
  iconId: string;
  shortcuts: ContextShortcut[];
}

interface ProfilesFile {
  profiles: Record<string, ContextProfile>;
}

const CURATED_APPS: Record<string, { appLabel: string; iconId: string }> = {
  // Windows
  'Discord.exe':         { appLabel: 'Discord',      iconId: 'discord'    },
  'obs64.exe':           { appLabel: 'OBS Studio',   iconId: 'obs'        },
  'Code.exe':            { appLabel: 'VS Code',      iconId: 'vscode'     },
  'Spotify.exe':         { appLabel: 'Spotify',      iconId: 'spotify'    },
  'Slack.exe':           { appLabel: 'Slack',        iconId: 'slack'      },
  'figma_agent.exe':     { appLabel: 'Figma',        iconId: 'figma'      },
  'Claude.exe':          { appLabel: 'Claude',       iconId: 'claude'     },
  'chrome.exe':          { appLabel: 'Chrome',       iconId: 'chrome'     },
  'Notion.exe':          { appLabel: 'Notion',       iconId: 'notion'     },
  'steam.exe':           { appLabel: 'Steam',        iconId: 'steam'      },
  'Postman.exe':         { appLabel: 'Postman',      iconId: 'postman'    },
  'WhatsApp.exe':        { appLabel: 'WhatsApp',     iconId: 'whatsapp'   },
  'powershell.exe':      { appLabel: 'PowerShell',   iconId: 'powershell' },
  'WindowsTerminal.exe': { appLabel: 'Terminal',     iconId: 'terminal'   },
  // macOS
  'Discord':             { appLabel: 'Discord',      iconId: 'discord'    },
  'obs':                 { appLabel: 'OBS Studio',   iconId: 'obs'        },
  'Code':                { appLabel: 'VS Code',      iconId: 'vscode'     },
  'Spotify':             { appLabel: 'Spotify',      iconId: 'spotify'    },
  'Slack':               { appLabel: 'Slack',        iconId: 'slack'      },
  'Figma':               { appLabel: 'Figma',        iconId: 'figma'      },
  'Claude':              { appLabel: 'Claude',       iconId: 'claude'     },
  'Google Chrome':       { appLabel: 'Chrome',       iconId: 'chrome'     },
  'Notion':              { appLabel: 'Notion',       iconId: 'notion'     },
  'Steam':               { appLabel: 'Steam',        iconId: 'steam'      },
  'Postman':             { appLabel: 'Postman',      iconId: 'postman'    },
  'WhatsApp':            { appLabel: 'WhatsApp',     iconId: 'whatsapp'   },
  'Terminal':            { appLabel: 'Terminal',     iconId: 'terminal'   },
};

@Injectable()
export class ContextProfileService {
  private data: ProfilesFile = { profiles: {} };
  private readonly filePath: string;

  constructor(private readonly aiRouter: AiRouterService) {
    this.filePath = path.join(
      process.env.USER_DATA_PATH ?? path.join(__dirname, '../../'),
      'context-profiles.json',
    );
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;
    try {
      this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as ProfilesFile;
    } catch {
      this.data = { profiles: {} };
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[ContextProfile] persist failed:', e);
    }
  }

  isCurated(processName: string): boolean {
    return processName in CURATED_APPS;
  }

  getCuratedMeta(processName: string): { appLabel: string; iconId: string } | null {
    return CURATED_APPS[processName] ?? null;
  }

  getProfile(processName: string | null): ContextProfile | null {
    if (!processName) return null;
    return this.data.profiles[processName] ?? null;
  }

  getAllProfiles(): ContextProfileSummary[] {
    return Object.entries(this.data.profiles).map(([processName, p]) => ({
      processName,
      appLabel: p.appLabel,
      iconId: p.iconId,
      source: p.source,
      shortcutCount: p.shortcuts.length,
      shortcuts: p.shortcuts,
    }));
  }

  addShortcut(
    processName: string,
    appLabel: string,
    iconId: string,
    shortcut: Omit<ContextShortcut, 'id'>,
  ): void {
    if (!this.data.profiles[processName]) {
      this.data.profiles[processName] = { source: 'user', appLabel, iconId, shortcuts: [] };
    }
    this.data.profiles[processName].shortcuts.push({ ...shortcut, id: randomUUID() });
    this.persist();
  }

  removeShortcut(processName: string, shortcutId: string): void {
    const profile = this.data.profiles[processName];
    if (!profile) return;
    profile.shortcuts = profile.shortcuts.filter((s) => s.id !== shortcutId);
    this.persist();
  }

  async generateAndCache(
    processName: string,
    appLabel: string,
    iconId: string,
    platform: string,
  ): Promise<{ quotaExceeded: boolean }> {
    const osName = platform === 'win32' ? 'Windows' : 'macOS';
    const prompt = `You are a keyboard shortcut assistant. List the most useful default keyboard shortcuts for ${appLabel} on ${osName}.

Return ONLY a JSON array, no markdown, no explanation:
[
  { "label": "Short action name (2-3 words max)", "keys": ["Ctrl","Shift","M"], "description": "One sentence." }
]

Rules:
- Return 12-15 shortcuts maximum
- Order by how frequently a power user would reach for them (most useful first)
- Use the app's actual documented default key bindings only — no guesses
- Keys array: use exact modifier names: "Ctrl", "Shift", "Alt", "Meta"
- If you are not confident about a shortcut, omit it entirely`;

    try {
      const raw = await this.aiRouter.call(prompt, '');
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned) as unknown[];

      const shortcuts: ContextShortcut[] = parsed
        .filter((item): item is { label: string; keys: string[]; description?: string } =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).label === 'string' &&
          Array.isArray((item as Record<string, unknown>).keys),
        )
        .map((item) => ({
          id:          randomUUID(),
          label:       item.label,
          keys:        item.keys,
          description: typeof item.description === 'string' ? item.description : '',
        }));

      if (shortcuts.length === 0) throw new Error('Empty shortcut list');

      this.data.profiles[processName] = {
        source:      'llm',
        generatedAt: new Date().toISOString(),
        appLabel,
        iconId,
        shortcuts,
      };
      this.persist();
      return { quotaExceeded: false };
    } catch (e) {
      if (e instanceof AiQuotaError) {
        console.warn(`[ContextProfile] quota exceeded generating shortcuts for ${appLabel}`);
        this.data.profiles[processName] = { source: 'llm-quota', appLabel, iconId, shortcuts: [] };
        this.persist();
        return { quotaExceeded: true };
      }
      console.warn(`[ContextProfile] generation failed for ${appLabel}:`, e);
      this.data.profiles[processName] = { source: 'llm-failed', appLabel, iconId, shortcuts: [] };
      this.persist();
      return { quotaExceeded: false };
    }
  }
}
