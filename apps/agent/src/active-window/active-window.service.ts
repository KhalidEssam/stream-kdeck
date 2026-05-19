import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { ChildProcess, spawn } from 'child_process';

const POLL_MS = 500;
const DEBOUNCE_MS = 1500;

// Dynamically load active-win so Electron's ffi-napi absence on Windows is caught at runtime.
// On macOS active-win uses a Swift binary (no native addon). On Windows ffi-napi must be
// rebuilt for the Electron ABI — if it's missing we fall back to a PowerShell subprocess.
let _activeWin: ((opts?: unknown) => Promise<{ owner?: { name?: string } } | undefined>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('active-win');
  _activeWin = mod.default ?? mod;
} catch { /* ffi-napi not built for this Electron version — Win32 path used instead */ }

@Injectable()
export class ActiveWindowService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  current: string | null = null;

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: string | null | undefined = undefined;

  // Win32 PowerShell persistent subprocess (used when ffi-napi is unavailable)
  private ps: ChildProcess | null = null;
  private psReady = false;
  private psBuf = '';
  private psCb: ((name: string | null) => void) | null = null;

  onModuleInit(): void {
    if (!_activeWin && process.platform === 'win32') this.startPs();
    this.pollInterval = setInterval(() => void this.poll(), POLL_MS);
  }

  onModuleDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.ps) { this.ps.stdin?.end(); this.ps.kill(); }
  }

  // Spawn a persistent PowerShell session. Compile the P/Invoke type once, then
  // service queries cheaply via stdin/stdout with no per-call startup overhead.
  private startPs(): void {
    this.ps = spawn('powershell.exe', ['-NoLogo', '-NonInteractive', '-NoProfile', '-Command', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.ps.stdin!.write(
      'Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;' +
      'public class KDeckWin{' +
      '[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();' +
      '[DllImport("user32.dll")]public static extern int GetWindowThreadProcessId(IntPtr h,out int p);}' +
      '\'\nWrite-Output "READY"\n',
    );

    this.ps.stdout!.on('data', (data: Buffer) => {
      this.psBuf += data.toString();
      const parts = this.psBuf.split(/\r?\n/);
      this.psBuf = parts.pop() ?? '';
      for (const line of parts) {
        const t = line.trim();
        if (!t) continue;
        if (t === 'READY') { this.psReady = true; continue; }
        if (this.psCb) { const cb = this.psCb; this.psCb = null; cb(t === 'null' ? null : t); }
      }
    });

    this.ps.on('error', () => { this.psReady = false; });
    this.ps.on('exit', () => { this.psReady = false; });
  }

  private queryWin32(): Promise<string | null> {
    if (!this.psReady || !this.ps || this.psCb) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.psCb = null; resolve(null); }, 450);
      this.psCb = (name) => { clearTimeout(timer); resolve(name); };
      // Get foreground window PID, map to process name, append .exe
      this.ps!.stdin!.write(
        '$p=0;[KDeckWin]::GetWindowThreadProcessId([KDeckWin]::GetForegroundWindow(),[ref]$p)|Out-Null;' +
        'if($p -gt 0){$n=(Get-Process -Id $p -EA 0).Name;if($n){Write-Output ($n+".exe")}else{Write-Output "null"}}else{Write-Output "null"}\n',
      );
    });
  }

  private async poll(): Promise<void> {
    let name: string | null = null;

    if (_activeWin) {
      const win = await _activeWin().catch(() => undefined);
      name = win?.owner?.name ?? null;
    } else if (process.platform === 'win32') {
      name = await this.queryWin32();
    }

    if (name === this.pending) return;
    this.pending = name;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.current = name;
      this.emit('appChanged', name);
    }, DEBOUNCE_MS);
  }
}
