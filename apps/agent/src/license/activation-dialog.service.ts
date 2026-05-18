import { Injectable } from '@nestjs/common';
import { BrowserWindow, ipcMain } from 'electron';
import { LicenseService } from './license.service';
import { DeviceFingerprintService } from './device-fingerprint.service';

const SUPABASE_EDGE_URL = process.env.SUPABASE_URL
  ? `${process.env.SUPABASE_URL}/functions/v1/licenses-activate`
  : '';

@Injectable()
export class ActivationDialogService {
  private window: BrowserWindow | null = null;
  private activatedCallbacks: Array<() => void> = [];

  onActivated(cb: () => void): void {
    this.activatedCallbacks.push(cb);
  }

  constructor(
    private readonly licenseService: LicenseService,
    private readonly fingerprint: DeviceFingerprintService,
  ) {
    ipcMain.handle('cs:activate', async (_event, key: string) => {
      return this.handleActivation(key);
    });
  }

  open(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.focus();
      return;
    }

    this.window = new BrowserWindow({
      width:     440,
      height:    300,
      resizable: false,
      center:    true,
      title:     'Activate Control Surface',
      webPreferences: {
        nodeIntegration:  true,
        contextIsolation: false,
      },
    });

    this.window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(this.buildHtml())}`,
    );
    this.window.on('closed', () => { this.window = null; });
  }

  private async handleActivation(key: string): Promise<{ success: boolean; error?: string }> {
    if (!SUPABASE_EDGE_URL) {
      return { success: false, error: 'Agent not configured. Set SUPABASE_URL in .env file.' };
    }

    try {
      const fp   = this.fingerprint.getFingerprint();
      const name = this.fingerprint.getDeviceName();

      const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
      const res = await fetch(SUPABASE_EDGE_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ key: key.trim(), deviceFingerprint: fp, deviceName: name }),
      });

      const json = await res.json() as { hashed_token?: string; error?: string; message?: string };

      if (!res.ok || !json.hashed_token) {
        const code = json.error ?? json.message ?? '';
        console.error(`[License] Activation failed — HTTP ${res.status}, code: ${code}`);
        const msg: Record<string, string> = {
          INVALID_KEY:              'Invalid license key. Check your purchase email.',
          REVOKED:                  'This license has been revoked. Contact support.',
          DEVICE_MISMATCH:          'Key is already activated on another machine. Contact support.',
          USER_NOT_FOUND:           'Account not found for this license. Contact support.',
          SESSION_GENERATION_FAILED:'Server error creating session. Contact support.',
        };
        return { success: false, error: msg[code] ?? `Activation failed (${code || res.status}). Contact support.` };
      }

      await this.licenseService.activateWithHashedToken(json.hashed_token);
      this.activatedCallbacks.forEach((cb) => cb());
      this.window?.close();
      return { success: true };
    } catch {
      return { success: false, error: 'Check your internet connection and try again.' };
    }
  }

  private buildHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0F0F14; color: #fff; padding: 28px; }
    h2 { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
    p  { font-size: 12px; color: #888; margin-bottom: 20px; line-height: 1.5; }
    input { width: 100%; padding: 10px 12px; border-radius: 8px;
            border: 1px solid #333; background: #1A1A2E; color: #fff;
            font-size: 13px; font-family: monospace; outline: none; }
    input:focus { border-color: #5B4FE8; }
    button { margin-top: 12px; width: 100%; padding: 11px; border-radius: 8px;
             border: none; background: #5B4FE8; color: #fff;
             font-size: 14px; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: default; }
    #err { color: #FF6B6B; font-size: 12px; margin-top: 8px; min-height: 16px; }
    #ok  { color: #44FF88; font-size: 12px; margin-top: 8px; min-height: 16px; }
  </style>
</head>
<body>
  <h2>Activate Control Surface</h2>
  <p>Enter the license key from your purchase confirmation email.</p>
  <input id="k" type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off">
  <div id="err"></div>
  <div id="ok"></div>
  <button id="btn" onclick="go()">Activate</button>
  <script>
    const { ipcRenderer } = require('electron');
    async function go() {
      const key = document.getElementById('k').value.trim();
      const btn = document.getElementById('btn');
      const err = document.getElementById('err');
      const ok  = document.getElementById('ok');
      if (!key) { err.textContent = 'Please enter your license key.'; return; }
      btn.disabled = true; btn.textContent = 'Activating…';
      err.textContent = ''; ok.textContent = '';
      const result = await ipcRenderer.invoke('cs:activate', key);
      if (result.success) {
        ok.textContent = 'Activated! You can close this window.';
        btn.textContent = 'Done';
      } else {
        err.textContent = result.error;
        btn.disabled = false; btn.textContent = 'Activate';
      }
    }
  </script>
</body>
</html>`;
  }
}
