import { Injectable, OnModuleInit } from '@nestjs/common';
import { ActiveWindowService } from '../active-window/active-window.service';
import { ShellRunnerService } from './shell-runner.service';
import { findProjectRoot } from '../context/project-root-resolver';
import { isVsCodeProcessName, resolveVsCodeWorkspace } from '../active-window/vscode-workspace-resolver';

// Windows absolute path pattern: C:\foo\bar or C:/foo/bar
const WIN_PATH_RE = /([A-Za-z]:[\\\/][^\t\n"<>?*\x00-\x1F]*)/g;

@Injectable()
export class TerminalCwdTrackerService implements OnModuleInit {
  constructor(
    private readonly activeWindow: ActiveWindowService,
    private readonly shellRunner: ShellRunnerService,
  ) {}

  onModuleInit(): void {
    this.activeWindow.on('appChanged', () => void this.updateCwd());
    void this.updateCwd();
  }

  private async updateCwd(): Promise<void> {
    const app = this.activeWindow.current;
    const title = this.activeWindow.currentTitle;

    if (isVsCodeProcessName(app)) {
      const root = resolveVsCodeWorkspace(title);
      if (root) {
        console.log('[TerminalCwdTracker] VS Code workspace resolved:', root);
        this.shellRunner.setActiveCwd(root);
        return;
      }
    }

    const storedVsCodeRoot = resolveVsCodeWorkspace(title);
    if (storedVsCodeRoot && !app && this.shellRunner.getActiveCwd()) {
      console.log('[TerminalCwdTracker] VS Code storage workspace resolved:', storedVsCodeRoot);
      this.shellRunner.setActiveCwd(storedVsCodeRoot);
      return;
    }

    if (!title) return;
    const dir = extractPathFromTitle(title);
    if (!dir) return;
    const root = await findProjectRoot(dir).catch(() => null);
    if (root) this.shellRunner.setActiveCwd(root);
  }
}

function extractPathFromTitle(title: string): string | null {
  const matches = [...title.matchAll(WIN_PATH_RE)].map((m) => m[1].replace(/[\\\/\s.]+$/, '').trim());
  if (matches.length === 0) return null;
  // Prefer the longest match (most specific path)
  return matches.sort((a, b) => b.length - a.length)[0];
}
