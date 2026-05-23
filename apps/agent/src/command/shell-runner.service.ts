import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';

const execAsync = promisify(exec);
const MAX_OUTPUT_BYTES = 50_000;

export interface ShellRunOptions {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface ShellRunResult {
  success: boolean;
  stdout: string;
  stderr?: string;
  cwd: string;
  durationMs: number;
}

@Injectable()
export class ShellRunnerService {
  private activeCwd: string = homedir();

  setActiveCwd(cwd: string): void {
    this.activeCwd = cwd;
  }

  getActiveCwd(): string {
    return this.activeCwd;
  }

  async run(options: ShellRunOptions): Promise<ShellRunResult> {
    const cwd = options.cwd ?? this.activeCwd;
    const timeoutMs = options.timeoutMs ?? 10_000;
    const start = Date.now();

    try {
      const { stdout, stderr } = await execAsync(options.command, { cwd, timeout: timeoutMs });
      const trimmed = stdout.slice(0, MAX_OUTPUT_BYTES).trimEnd();
      return { success: true, stdout: trimmed, stderr: stderr?.trimEnd() || undefined, cwd, durationMs: Date.now() - start };
    } catch (err: unknown) {
      const e = err as { message?: string; stderr?: string };
      const detail = (e.stderr?.trimEnd()) || e.message || String(err);
      return { success: false, stdout: '', stderr: detail, cwd, durationMs: Date.now() - start };
    }
  }
}
