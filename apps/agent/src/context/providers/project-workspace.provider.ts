import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
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

const MANIFEST_FILES = ['package.json', 'pnpm-workspace.yaml', 'Cargo.toml', 'requirements.txt', 'pyproject.toml', 'go.mod'];
const README_NAMES = ['README.md', 'readme.md', 'README.txt', 'README'];
const MAX_README_BYTES = 8_000;
const MAX_MANIFEST_BYTES = 4_000;

@Injectable()
export class ProjectWorkspaceProvider implements ContextProvider {
  readonly id = 'project_files';

  constructor(
    private readonly shellRunner: ShellRunnerService,
    private readonly activeWindow: ActiveWindowService,
  ) {}

  async probe(_request: ContextRequest): Promise<ContextProbe> {
    const root = await this.resolveRoot();
    return {
      available: root !== null,
      unavailableReason: root === null ? 'no project root detected in current working directory' : undefined,
    };
  }

  async preview(_request: ContextRequest): Promise<ContextPreview> {
    const root = await this.resolveRoot();
    if (!root) {
      return { label: 'No project detected', byteSize: 0, truncated: false };
    }
    const count = [...MANIFEST_FILES, ...README_NAMES].filter((f) => fs.existsSync(path.join(root, f))).length;
    return {
      label: `Project: ${path.basename(root)} (${count} files)`,
      byteSize: 0,
      truncated: false,
      sampleText: root,
    };
  }

  async read(_request: ContextRequest): Promise<ContextPayload> {
    const root = await this.resolveRoot();
    if (!root) {
      return { providerId: this.id, content: '', byteSize: 0, provenance: 'no project root found' };
    }

    const sections: string[] = [`Project root: ${root}`];

    const readme = this.readFirstMatch(root, README_NAMES, MAX_README_BYTES);
    if (readme) sections.push(`--- README ---\n${readme}`);

    for (const manifest of MANIFEST_FILES) {
      const content = this.readFile(path.join(root, manifest), MAX_MANIFEST_BYTES);
      if (content) sections.push(`--- ${manifest} ---\n${content}`);
    }

    const content = sections.join('\n\n');
    return {
      providerId: this.id,
      content,
      byteSize: Buffer.byteLength(content, 'utf8'),
      provenance: `project files read from ${root} at ${new Date().toLocaleTimeString()}`,
    };
  }

  private readFirstMatch(dir: string, names: string[], maxBytes: number): string | null {
    for (const name of names) {
      const result = this.readFile(path.join(dir, name), maxBytes);
      if (result !== null) return result;
    }
    return null;
  }

  private readFile(filePath: string, maxBytes: number): string | null {
    try {
      return fs.readFileSync(filePath, 'utf8').slice(0, maxBytes);
    } catch {
      return null;
    }
  }

  private resolveRoot(): Promise<string | null> {
    return resolveActiveProjectRoot({
      activeCwd: this.shellRunner.getActiveCwd(),
      activeApp: this.activeWindow.current,
      activeWindowTitle: this.activeWindow.currentTitle,
    });
  }
}
