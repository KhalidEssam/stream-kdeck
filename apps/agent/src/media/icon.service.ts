import { Injectable } from '@nestjs/common';
import { platform } from 'os';
import { execSync } from 'child_process';

const BLOCKED_PROCESS_NAMES = [
  'audiodg',
  'rtkuwp',
  'svchost',
  'rundll32',
  'conhost',
  'qemu-system',
  'vmware-vmx',
  'vboxheadless',
  'wlanext',
];

@Injectable()
export class IconService {
  private readonly exePathCache = new Map<string, string | undefined>();
  private readonly iconCache = new Map<string, string | undefined>();

  async shouldInclude(pid: number, processName: string): Promise<boolean> {
    if (platform() !== 'win32') return true;
    const base = processName.replace(/\.exe$/i, '').toLowerCase();
    if (BLOCKED_PROCESS_NAMES.some(b => base.startsWith(b))) return false;
    const exePath = await this.resolveExePath(pid, processName);
    if (!exePath) return false;
    if (exePath.toLowerCase().includes('\\windows\\')) return false;
    return true;
  }

  async getIconBase64(pid: number, processName: string): Promise<string | undefined> {
    if (platform() !== 'win32') return undefined;
    if (this.iconCache.has(processName)) return this.iconCache.get(processName);
    const exePath = await this.resolveExePath(pid, processName);
    if (!exePath) {
      this.iconCache.set(processName, undefined);
      return undefined;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { app } = require('electron') as typeof import('electron');
      const icon = await app.getFileIcon(exePath, { size: 'normal' });
      const b64 = icon.toPNG().toString('base64');
      this.iconCache.set(processName, b64);
      return b64;
    } catch {
      this.iconCache.set(processName, undefined);
      return undefined;
    }
  }

  private async resolveExePath(pid: number, processName: string): Promise<string | undefined> {
    if (this.exePathCache.has(processName)) return this.exePathCache.get(processName);
    try {
      const result = execSync(
        `powershell -command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path"`,
        { encoding: 'utf-8', timeout: 2000 },
      ).trim();
      const exePath = result.length > 0 ? result : undefined;
      this.exePathCache.set(processName, exePath);
      return exePath;
    } catch {
      this.exePathCache.set(processName, undefined);
      return undefined;
    }
  }
}
