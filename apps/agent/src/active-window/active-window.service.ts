import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { ChildProcess, spawn } from 'child_process';
import path from 'path';

const POLL_MS = 500;
const DEBOUNCE_MS = 1500;

// Dynamically load active-win so Electron's ffi-napi absence on Windows is caught at runtime.
// On macOS active-win uses a Swift binary (no native addon). On Windows ffi-napi must be
// rebuilt for the Electron ABI — if it's missing we fall back to a PowerShell subprocess.
let _activeWin: ((opts?: unknown) => Promise<{ owner?: { name?: string; path?: string }; title?: string } | undefined>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('active-win');
  _activeWin = mod.default ?? mod;
} catch { /* ffi-napi not built for this Electron version — Win32 path used instead */ }

@Injectable()
export class ActiveWindowService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  current: string | null = null;
  currentTitle: string | null = null;

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSignature: string | undefined = undefined;

  // Win32 PowerShell persistent subprocess (used when ffi-napi is unavailable)
  private ps: ChildProcess | null = null;
  private psReady = false;
  private psBuf = '';
  private psCb: ((name: string | null, title: string | null) => void) | null = null;

  onModuleInit(): void {
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
      'Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;using System.Text;' +
      'public class KDeckWin{' +
      '[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();' +
      '[DllImport("user32.dll")]public static extern int GetWindowThreadProcessId(IntPtr h,out int p);' +
      '[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);}' +
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
        if (this.psCb) {
          const cb = this.psCb; this.psCb = null;
          // Format: "processName.exe|window title" — title may contain | so split on first only
          const sep = t.indexOf('|');
          const rawName = sep === -1 ? t : t.slice(0, sep);
          const rawTitle = sep === -1 ? '' : t.slice(sep + 1);
          cb(rawName === 'null' || rawName === '' ? null : rawName, rawTitle || null);
        }
      }
    });

    this.ps.on('error', () => { this.psReady = false; });
    this.ps.on('exit', () => { this.psReady = false; });
  }

  private queryWin32(): Promise<{ name: string | null; title: string | null }> {
    if (!this.psReady || !this.ps || this.psCb) return Promise.resolve({ name: null, title: null });
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.psCb = null; resolve({ name: null, title: null }); }, 450);
      this.psCb = (name, title) => { clearTimeout(timer); resolve({ name, title }); };
      // Get foreground window PID + title, output as "processName.exe|window title"
      this.ps!.stdin!.write(
        '$p=0;$h=[KDeckWin]::GetForegroundWindow();' +
        '[KDeckWin]::GetWindowThreadProcessId($h,[ref]$p)|Out-Null;' +
        '$sb=New-Object System.Text.StringBuilder(512);' +
        '[KDeckWin]::GetWindowText($h,$sb,512)|Out-Null;' +
        'if($p -gt 0){$n=(Get-Process -Id $p -EA 0).Name;' +
        'if($n){Write-Output("$($n).exe|$($sb.ToString())")}' +
        'else{Write-Output("null|$($sb.ToString())")}}' +
        'else{Write-Output "null|"}\n',
      );
    });
  }

  private async poll(): Promise<void> {
    let name: string | null = null;
    let title: string | null = null;

    if (_activeWin) {
      // active-win/index.js lazily requires windows.js on first call, not at module load.
      // If ffi-napi is absent, calling _activeWin() throws synchronously. Catch that here
      // so the async function gets a Promise to await instead of an unhandled sync throw.
      let callResult: Promise<{ owner?: { name?: string; path?: string }; title?: string } | undefined>;
      try {
        callResult = _activeWin();
      } catch {
        _activeWin = null;
        if (process.platform === 'win32' && !this.ps) this.startPs();
        callResult = Promise.resolve(undefined);
      }
      const win = await callResult.catch(() => undefined);
      if (win) {
        title = win.title ?? null;
        // active-win on Windows returns owner.name as the FileDescription (e.g. "Visual Studio Code")
        // rather than the exe filename. Use owner.path basename ("Code.exe") to match CURATED_APPS keys.
        if (process.platform === 'win32' && win.owner?.path) {
          name = path.basename(win.owner.path);
        } else {
          name = win.owner?.name ?? null;
          if (name && process.platform === 'win32' && !name.endsWith('.exe')) {
            name = `${name}.exe`;
          }
        }
      }
    } else if (process.platform === 'win32') {
      const result = await this.queryWin32();
      name = result.name;
      title = result.title;
    }

    const signature = `${name ?? ''}|${title ?? ''}`;
    if (signature === this.pendingSignature) return;
    this.pendingSignature = signature;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.current = name;
      this.currentTitle = title;
      this.emit('appChanged', name);
    }, DEBOUNCE_MS);
  }
}
