import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { ShellRunnerService } from '../../command/shell-runner.service';
import { ActiveWindowService } from '../../active-window/active-window.service';
import { resolveActiveProjectRoot } from '../project-root-resolver';
import {
  ContextProvider,
  ContextRequest,
  ContextProbe,
  ContextPreview,
  ContextPayload,
} from '../context-provider.interface';

const README_CANDIDATES = ['README.md', 'readme.md', 'README.txt', 'README.rst'];
const README_MAX_BYTES = 4_000;

@Injectable()
export class GitContextProvider implements ContextProvider {
  readonly id = 'git';

  constructor(
    private readonly shellRunner: ShellRunnerService,
    private readonly activeWindow: ActiveWindowService,
  ) {}

  private async resolveCwd(): Promise<string> {
    const activeCwd = this.shellRunner.getActiveCwd();
    return await resolveActiveProjectRoot({
      activeCwd,
      activeApp: this.activeWindow.current,
      activeWindowTitle: this.activeWindow.currentTitle,
    }) ?? activeCwd;
  }

  async probe(_request: ContextRequest): Promise<ContextProbe> {
    const cwd = await this.resolveCwd();
    console.log('[GitContextProvider] probe() cwd:', cwd);
    const check = await this.shellRunner.run({ command: 'git status', cwd, timeoutMs: 3_000 });
    return {
      available: check.success,
      unavailableReason: check.success ? undefined : 'not a git repository or git not installed',
    };
  }

  async preview(_request: ContextRequest): Promise<ContextPreview> {
    const cwd = await this.resolveCwd();
    return {
      label: `Git context from ${cwd}`,
      byteSize: 0,
      truncated: false,
      sampleText: cwd,
    };
  }

  async read(_request: ContextRequest): Promise<ContextPayload> {
    const cwd = await this.resolveCwd();
    console.log('[GitContextProvider] read() cwd:', cwd);

    const [statusResult, logResult] = await Promise.all([
      this.shellRunner.run({ command: 'git status', cwd, timeoutMs: 5_000 }),
      this.shellRunner.run({ command: 'git log --oneline -20', cwd, timeoutMs: 5_000 }),
    ]);

    console.log('[GitContextProvider] git status success:', statusResult.success, '| stderr:', statusResult.stderr);
    console.log('[GitContextProvider] git status stdout:\n', statusResult.stdout);
    console.log('[GitContextProvider] git log success:', logResult.success, '| stderr:', logResult.stderr);
    console.log('[GitContextProvider] git log stdout:\n', logResult.stdout);

    const sections: string[] = [];
    if (statusResult.success) sections.push(`--- git status ---\n${statusResult.stdout}`);
    if (logResult.success)    sections.push(`--- git log (last 20) ---\n${logResult.stdout}`);

    const readme = this.tryReadFile(cwd, README_CANDIDATES, README_MAX_BYTES);
    if (readme) sections.push(`--- README ---\n${readme}`);

    const content = sections.join('\n\n') || 'git context unavailable';
    return {
      providerId: this.id,
      content,
      byteSize: Buffer.byteLength(content, 'utf8'),
      provenance: `git context read from ${cwd} at ${new Date().toLocaleTimeString()}`,
    };
  }

  private tryReadFile(dir: string, candidates: string[], maxBytes: number): string | null {
    for (const name of candidates) {
      try {
        const filePath = path.join(dir, name);
        if (!fs.existsSync(filePath)) continue;
        const buf = fs.readFileSync(filePath);
        if (buf.byteLength <= maxBytes) return buf.toString('utf8');
        return buf.slice(0, maxBytes).toString('utf8') + '\n[truncated]';
      } catch { /* skip */ }
    }
    return null;
  }
}
