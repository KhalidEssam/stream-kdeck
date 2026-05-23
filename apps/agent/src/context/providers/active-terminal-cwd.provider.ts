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
export class ActiveTerminalCwdProvider implements ContextProvider {
  readonly id = 'active_terminal';

  constructor(private readonly shellRunner: ShellRunnerService) {}

  async probe(_request: ContextRequest): Promise<ContextProbe> {
    return { available: true };
  }

  async preview(_request: ContextRequest): Promise<ContextPreview> {
    const cwd = this.shellRunner.getActiveCwd();
    return {
      label: `Terminal cwd: ${cwd}`,
      byteSize: Buffer.byteLength(cwd, 'utf8'),
      truncated: false,
      sampleText: cwd,
    };
  }

  async read(_request: ContextRequest): Promise<ContextPayload> {
    const cwd = this.shellRunner.getActiveCwd();
    return {
      providerId: this.id,
      content: cwd,
      byteSize: Buffer.byteLength(cwd, 'utf8'),
      provenance: `terminal cwd resolved at ${new Date().toLocaleTimeString()}`,
    };
  }
}
