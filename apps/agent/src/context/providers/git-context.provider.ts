import { Injectable } from '@nestjs/common';
import { ShellRunnerService } from '../../command/shell-runner.service';
import {
  ContextProvider,
  ContextRequest,
  ContextProbe,
  ContextPreview,
  ContextPayload,
} from '../context-provider.interface';

@Injectable()
export class GitContextProvider implements ContextProvider {
  readonly id = 'git';

  constructor(private readonly shellRunner: ShellRunnerService) {}

  async probe(_request: ContextRequest): Promise<ContextProbe> {
    const cwd = this.shellRunner.getActiveCwd();
    const check = await this.shellRunner.run({ command: 'git status', cwd, timeoutMs: 3_000 });
    return {
      available: check.success,
      unavailableReason: check.success ? undefined : 'not a git repository or git not installed',
    };
  }

  async preview(_request: ContextRequest): Promise<ContextPreview> {
    const cwd = this.shellRunner.getActiveCwd();
    return {
      label: `Git context from ${cwd}`,
      byteSize: 0,
      truncated: false,
      sampleText: cwd,
    };
  }

  async read(_request: ContextRequest): Promise<ContextPayload> {
    const cwd = this.shellRunner.getActiveCwd();

    const [statusResult, logResult] = await Promise.all([
      this.shellRunner.run({ command: 'git status', cwd, timeoutMs: 5_000 }),
      this.shellRunner.run({ command: 'git log --oneline -20', cwd, timeoutMs: 5_000 }),
    ]);

    const sections: string[] = [];
    if (statusResult.success) sections.push(`--- git status ---\n${statusResult.stdout}`);
    if (logResult.success) sections.push(`--- git log (last 20) ---\n${logResult.stdout}`);

    const content = sections.join('\n\n') || 'git context unavailable';
    return {
      providerId: this.id,
      content,
      byteSize: Buffer.byteLength(content, 'utf8'),
      provenance: `git context read from ${cwd} at ${new Date().toLocaleTimeString()}`,
    };
  }
}
