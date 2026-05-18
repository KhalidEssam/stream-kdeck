# SaaS Licensing — Desktop Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add license enforcement to the desktop agent — hardware fingerprinting, secure token storage, activation dialog triggered from the tray or mobile, WebSocket LICENSE_STATUS messages on connect, and AI credit quota checking/decrementing.

**Architecture:** A new `LicenseModule` with three services: `DeviceFingerprintService` (stable SHA-256 of MAC + hostname), `SecureStorageService` (wraps Electron `safeStorage` into an encrypted local file), and `LicenseService` (manages Supabase Auth session, exposes claims). `ActivationDialogService` opens an Electron `BrowserWindow` for key entry. `WsGateway` sends `LICENSE_STATUS` on every connect and handles `OPEN_ACTIVATION_DIALOG`. `CommandService` blocks AI calls at 0 credits. `AiRouterService` decrements credits after each successful call.

**Tech Stack:** Electron `safeStorage`, `@supabase/supabase-js`, NestJS, TypeScript, Jest

**Run tests with:** `cd apps/agent && npm test`

**Context:** Spec at `docs/superpowers/specs/2026-05-18-saas-licensing-design.md`. Backend plan (must be deployed first): `docs/superpowers/plans/2026-05-18-saas-backend.md`. Schema types from Plan B1 must already be committed.

---

### Task A1: Add @supabase/supabase-js dependency + env vars + electron mock update

**Files:**
- Modify: `apps/agent/package.json`
- Modify: `apps/agent/.env` (or create if absent)
- Modify: `apps/agent/__mocks__/electron.js`

- [ ] **Step 1: Install the Supabase client**

```bash
cd apps/agent && npm install @supabase/supabase-js
```

Expected: `@supabase/supabase-js` appears in `dependencies` in `apps/agent/package.json`.

- [ ] **Step 2: Add env vars to `.env`**

Open `apps/agent/.env` (create it if it does not exist — `.env.local` overrides it in development):

```
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
```

These values are available in the Supabase dashboard under Project Settings → API.

- [ ] **Step 3: Extend the electron mock for safeStorage and app**

Add `safeStorage` and `app` to `apps/agent/__mocks__/electron.js`. These are needed by `SecureStorageService` in tests:

```javascript
// In-memory clipboard and shell mock for Jest — replaces Electron APIs in tests.
let _clipboard = '';

// In-memory store that simulates safeStorage encrypted file
const _store = {};

module.exports = {
  clipboard: {
    readText: () => _clipboard,
    writeText: (text) => { _clipboard = text; },
  },
  shell: {
    openExternal: jest.fn().mockResolvedValue(undefined),
    openPath: jest.fn().mockResolvedValue(''),
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn().mockReturnValue(true),
    encryptString: jest.fn((str) => Buffer.from(str, 'utf-8')),
    decryptString: jest.fn((buf) => buf.toString('utf-8')),
  },
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/test-cs-agent'),
    quit: jest.fn(),
    dock: { hide: jest.fn() },
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(),
    focus: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false),
    on: jest.fn(),
    webContents: { send: jest.fn() },
  })),
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
  Menu: { buildFromTemplate: jest.fn().mockReturnValue({}) },
  Tray: jest.fn().mockImplementation(() => ({
    setToolTip: jest.fn(),
    setContextMenu: jest.fn(),
  })),
};
```

- [ ] **Step 4: Verify existing tests still pass**

```bash
cd apps/agent && npm test
```

Expected: all existing tests pass (the new mock entries are additive).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/package.json apps/agent/package-lock.json apps/agent/__mocks__/electron.js
git commit -m "feat: add @supabase/supabase-js dep and extend electron mock for safeStorage"
```

---

### Task A2: DeviceFingerprintService

**Files:**
- Create: `apps/agent/src/license/device-fingerprint.service.ts`
- Create: `apps/agent/tests/device-fingerprint.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/agent/tests/device-fingerprint.service.test.ts`:

```typescript
import { DeviceFingerprintService } from '../src/license/device-fingerprint.service';
import * as os from 'os';

describe('DeviceFingerprintService', () => {
  let service: DeviceFingerprintService;

  beforeEach(() => {
    service = new DeviceFingerprintService();
  });

  it('returns a 64-character hex string (SHA-256)', () => {
    const fp = service.getFingerprint();
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same fingerprint on repeated calls', () => {
    expect(service.getFingerprint()).toBe(service.getFingerprint());
  });

  it('returns the OS hostname as device name', () => {
    expect(service.getDeviceName()).toBe(os.hostname());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/agent && npm test -- --testPathPattern=device-fingerprint
```

Expected: FAIL — `Cannot find module '../src/license/device-fingerprint.service'`.

- [ ] **Step 3: Implement the service**

Create `apps/agent/src/license/device-fingerprint.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { networkInterfaces, hostname } from 'os';

@Injectable()
export class DeviceFingerprintService {
  getFingerprint(): string {
    const mac = this.firstMacAddress();
    return createHash('sha256').update(`${mac}::${hostname()}`).digest('hex');
  }

  getDeviceName(): string {
    return hostname();
  }

  private firstMacAddress(): string {
    const ifaces = networkInterfaces();
    for (const entries of Object.values(ifaces)) {
      if (!entries) continue;
      for (const entry of entries) {
        if (!entry.internal && entry.mac !== '00:00:00:00:00:00') {
          return entry.mac;
        }
      }
    }
    return 'no-mac';
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd apps/agent && npm test -- --testPathPattern=device-fingerprint
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/license/device-fingerprint.service.ts apps/agent/tests/device-fingerprint.service.test.ts
git commit -m "feat: add DeviceFingerprintService — SHA-256 of MAC + hostname"
```

---

### Task A3: SecureStorageService + LicenseService

**Files:**
- Create: `apps/agent/src/license/secure-storage.service.ts`
- Create: `apps/agent/src/license/license.service.ts`
- Create: `apps/agent/tests/license.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/agent/tests/license.service.test.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { LicenseService } from '../src/license/license.service';
import { SecureStorageService } from '../src/license/secure-storage.service';

// Mock @supabase/supabase-js
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    auth: {
      setSession: jest.fn(),
      verifyOtp: jest.fn(),
      getSession: jest.fn(),
    },
  }),
}));

describe('LicenseService', () => {
  let licenseService: LicenseService;
  let mockStorage: { get: jest.Mock; set: jest.Mock; delete: jest.Mock };
  let mockSupabase: { auth: { setSession: jest.Mock; verifyOtp: jest.Mock; getSession: jest.Mock } };

  beforeEach(async () => {
    mockStorage = {
      get: jest.fn().mockReturnValue(null),
      set: jest.fn(),
      delete: jest.fn(),
    };

    const { createClient } = require('@supabase/supabase-js');
    mockSupabase = createClient();

    const moduleRef = await Test.createTestingModule({
      providers: [
        LicenseService,
        { provide: SecureStorageService, useValue: mockStorage },
      ],
    }).compile();

    licenseService = moduleRef.get(LicenseService);
  });

  it('starts unlicensed with no stored token', async () => {
    await licenseService.onApplicationBootstrap();
    expect(licenseService.isLicensed()).toBe(false);
    expect(licenseService.creditsRemaining()).toBe(0);
  });

  it('loads cached claims from storage when present', async () => {
    mockStorage.get.mockImplementation((key: string) => {
      if (key === 'cached_claims') {
        return JSON.stringify({ licensed: true, ai_pro: false, credits_remaining: 42 });
      }
      return null;
    });

    await licenseService.onApplicationBootstrap();
    expect(licenseService.isLicensed()).toBe(true);
    expect(licenseService.creditsRemaining()).toBe(42);
  });

  it('refreshSession updates claims from JWT when refresh token exists', async () => {
    // Build a fake JWT with custom claims
    const payload = { licensed: true, ai_pro: true, credits_remaining: 480 };
    const fakeJwt = [
      'header',
      Buffer.from(JSON.stringify(payload)).toString('base64url'),
      'sig',
    ].join('.');

    mockStorage.get.mockImplementation((key: string) =>
      key === 'refresh_token' ? 'fake-refresh-token' : null,
    );
    mockSupabase.auth.setSession.mockResolvedValue({
      data: {
        session: {
          access_token:  fakeJwt,
          refresh_token: 'new-refresh-token',
        },
      },
      error: null,
    });

    await licenseService.onApplicationBootstrap();

    expect(licenseService.isLicensed()).toBe(true);
    expect(licenseService.isAiPro()).toBe(true);
    expect(licenseService.creditsRemaining()).toBe(480);
    expect(mockStorage.set).toHaveBeenCalledWith('refresh_token', 'new-refresh-token');
  });

  it('clears tokens and resets claims when session refresh fails', async () => {
    mockStorage.get.mockImplementation((key: string) =>
      key === 'refresh_token' ? 'expired-token' : null,
    );
    mockSupabase.auth.setSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Token expired' },
    });

    await licenseService.onApplicationBootstrap();

    expect(licenseService.isLicensed()).toBe(false);
    expect(mockStorage.delete).toHaveBeenCalledWith('refresh_token');
    expect(mockStorage.delete).toHaveBeenCalledWith('cached_claims');
  });

  it('activateWithHashedToken stores refresh token and updates claims', async () => {
    const payload = { licensed: true, ai_pro: false, credits_remaining: 50 };
    const fakeJwt = [
      'header',
      Buffer.from(JSON.stringify(payload)).toString('base64url'),
      'sig',
    ].join('.');

    mockSupabase.auth.verifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token:  fakeJwt,
          refresh_token: 'stored-refresh-token',
        },
      },
      error: null,
    });

    await licenseService.activateWithHashedToken('some-hashed-token');

    expect(mockStorage.set).toHaveBeenCalledWith('refresh_token', 'stored-refresh-token');
    expect(licenseService.isLicensed()).toBe(true);
    expect(licenseService.creditsRemaining()).toBe(50);
  });

  it('clearTokens resets everything', async () => {
    await licenseService.clearTokens();
    expect(mockStorage.delete).toHaveBeenCalledWith('refresh_token');
    expect(mockStorage.delete).toHaveBeenCalledWith('cached_claims');
    expect(licenseService.isLicensed()).toBe(false);
  });

  it('hasRefreshToken returns true when token is stored', () => {
    mockStorage.get.mockImplementation((key: string) =>
      key === 'refresh_token' ? 'some-token' : null,
    );
    expect(licenseService.hasRefreshToken()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/agent && npm test -- --testPathPattern=license.service
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement SecureStorageService**

Create `apps/agent/src/license/secure-storage.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SecureStorageService {
  private readonly filePath: string;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'agent-secrets.bin');
  }

  set(key: string, value: string): void {
    const all = this.readAll();
    all[key] = safeStorage.encryptString(value).toString('base64');
    fs.writeFileSync(this.filePath, JSON.stringify(all), 'utf-8');
  }

  get(key: string): string | null {
    const all = this.readAll();
    if (!all[key]) return null;
    try {
      return safeStorage.decryptString(Buffer.from(all[key], 'base64'));
    } catch {
      return null;
    }
  }

  delete(key: string): void {
    const all = this.readAll();
    delete all[key];
    fs.writeFileSync(this.filePath, JSON.stringify(all), 'utf-8');
  }

  private readAll(): Record<string, string> {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch {
      return {};
    }
  }
}
```

- [ ] **Step 4: Implement LicenseService**

Create `apps/agent/src/license/license.service.ts`:

```typescript
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SecureStorageService } from './secure-storage.service';

const REFRESH_TOKEN_KEY = 'refresh_token';
const CACHED_CLAIMS_KEY = 'cached_claims';

export interface LicenseClaims {
  licensed: boolean;
  ai_pro: boolean;
  credits_remaining: number;
}

const DEFAULT_CLAIMS: LicenseClaims = { licensed: false, ai_pro: false, credits_remaining: 0 };

@Injectable()
export class LicenseService implements OnApplicationBootstrap {
  private claims: LicenseClaims = { ...DEFAULT_CLAIMS };
  private readonly supabase: SupabaseClient;

  constructor(private readonly storage: SecureStorageService) {
    this.supabase = createClient(
      process.env.SUPABASE_URL ?? '',
      process.env.SUPABASE_ANON_KEY ?? '',
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    this.loadCachedClaims();
    await this.refreshSession();
  }

  async refreshSession(): Promise<void> {
    const refreshToken = this.storage.get(REFRESH_TOKEN_KEY);
    if (!refreshToken) return;

    try {
      const { data, error } = await this.supabase.auth.setSession({
        access_token:  '',
        refresh_token: refreshToken,
      });

      if (error || !data.session) {
        this.storage.delete(REFRESH_TOKEN_KEY);
        this.storage.delete(CACHED_CLAIMS_KEY);
        this.claims = { ...DEFAULT_CLAIMS };
        return;
      }

      this.storage.set(REFRESH_TOKEN_KEY, data.session.refresh_token);
      this.updateClaimsFromJwt(data.session.access_token);
      this.storage.set(CACHED_CLAIMS_KEY, JSON.stringify(this.claims));
    } catch {
      // Network error — keep cached claims loaded in loadCachedClaims()
    }
  }

  async activateWithHashedToken(hashedToken: string): Promise<void> {
    const { data, error } = await this.supabase.auth.verifyOtp({
      token_hash: hashedToken,
      type: 'magiclink',
    });
    if (error || !data.session) {
      throw new Error(error?.message ?? 'Session creation failed');
    }
    this.storage.set(REFRESH_TOKEN_KEY, data.session.refresh_token);
    this.updateClaimsFromJwt(data.session.access_token);
    this.storage.set(CACHED_CLAIMS_KEY, JSON.stringify(this.claims));
  }

  async decrementCredit(): Promise<void> {
    if (!this.claims.licensed || this.claims.credits_remaining <= 0) return;

    // Optimistic local update so the next tap reflects the decrement immediately
    this.claims.credits_remaining = Math.max(0, this.claims.credits_remaining - 1);

    try {
      if (this.claims.ai_pro) {
        await this.supabase.rpc('decrement_subscription_credits');
      } else {
        await this.supabase.rpc('increment_license_credits_used');
      }
    } catch {
      // Non-fatal — local count already decremented; Supabase syncs on next JWT refresh
    }
  }

  async clearTokens(): Promise<void> {
    this.storage.delete(REFRESH_TOKEN_KEY);
    this.storage.delete(CACHED_CLAIMS_KEY);
    this.claims = { ...DEFAULT_CLAIMS };
  }

  hasRefreshToken(): boolean {
    return !!this.storage.get(REFRESH_TOKEN_KEY);
  }

  isLicensed(): boolean          { return this.claims.licensed; }
  isAiPro(): boolean             { return this.claims.ai_pro; }
  creditsRemaining(): number     { return this.claims.credits_remaining; }
  getClaims(): LicenseClaims     { return { ...this.claims }; }

  private loadCachedClaims(): void {
    const cached = this.storage.get(CACHED_CLAIMS_KEY);
    if (!cached) return;
    try { this.claims = JSON.parse(cached); } catch {}
  }

  private updateClaimsFromJwt(accessToken: string): void {
    try {
      const payload = JSON.parse(
        Buffer.from(accessToken.split('.')[1], 'base64url').toString(),
      );
      this.claims = {
        licensed:          payload.licensed          ?? false,
        ai_pro:            payload.ai_pro            ?? false,
        credits_remaining: payload.credits_remaining ?? 0,
      };
    } catch {
      this.claims = { ...DEFAULT_CLAIMS };
    }
  }
}
```

- [ ] **Step 5: Run to verify tests pass**

```bash
cd apps/agent && npm test -- --testPathPattern=license.service
```

Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/license/secure-storage.service.ts apps/agent/src/license/license.service.ts apps/agent/tests/license.service.test.ts
git commit -m "feat: add SecureStorageService (safeStorage) and LicenseService with Supabase session management"
```

---

### Task A4: ActivationDialogService

**Files:**
- Create: `apps/agent/src/license/activation-dialog.service.ts`

No TDD here — this is Electron UI. Tested end-to-end when running the full app.

- [ ] **Step 1: Implement the service**

Create `apps/agent/src/license/activation-dialog.service.ts`:

```typescript
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
    try {
      const fp   = this.fingerprint.getFingerprint();
      const name = this.fingerprint.getDeviceName();

      const res = await fetch(SUPABASE_EDGE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key: key.trim(), deviceFingerprint: fp, deviceName: name }),
      });

      const json = await res.json() as { hashed_token?: string; error?: string };

      if (!res.ok || !json.hashed_token) {
        const msg: Record<string, string> = {
          INVALID_KEY:   'Invalid license key. Check your purchase email.',
          REVOKED:       'This license has been revoked. Contact support.',
          DEVICE_MISMATCH: 'Key is already activated on another machine. Contact support.',
        };
        return { success: false, error: msg[json.error ?? ''] ?? 'Activation failed. Try again.' };
      }

      await this.licenseService.activateWithHashedToken(json.hashed_token);
      this.window?.close();
      return { success: true };
    } catch (err: unknown) {
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/agent && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/src/license/activation-dialog.service.ts
git commit -m "feat: add ActivationDialogService — Electron BrowserWindow for license key entry"
```

---

### Task A5: LicenseModule + AppModule + main.ts tray integration

**Files:**
- Create: `apps/agent/src/license/license.module.ts`
- Modify: `apps/agent/src/app.module.ts`
- Modify: `apps/agent/src/main.ts`

- [ ] **Step 1: Create LicenseModule**

Create `apps/agent/src/license/license.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { SecureStorageService } from './secure-storage.service';
import { LicenseService } from './license.service';
import { ActivationDialogService } from './activation-dialog.service';

@Module({
  providers: [
    DeviceFingerprintService,
    SecureStorageService,
    LicenseService,
    ActivationDialogService,
  ],
  exports: [LicenseService, ActivationDialogService, DeviceFingerprintService],
})
export class LicenseModule {}
```

- [ ] **Step 2: Register LicenseModule in AppModule**

Replace the contents of `apps/agent/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { WsGateway } from './websocket/ws.gateway';
import { ClipboardService } from './clipboard/clipboard.service';
import { AiRouterService } from './ai/ai-router.service';
import { CommandService } from './command/command.service';
import { AppLaunchService } from './app-launch/app-launch.service';
import { AppRegistryService } from './app-launch/app-registry.service';
import { KeystrokeService } from './keystroke/keystroke.service';
import { AppSearchService } from './app-search/app-search.service';
import { LicenseModule } from './license/license.module';

@Module({
  imports: [LicenseModule],
  providers: [
    WsGateway,
    ClipboardService,
    AiRouterService,
    CommandService,
    AppLaunchService,
    AppRegistryService,
    KeystrokeService,
    AppSearchService,
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Update main.ts to auto-open dialog and add tray menu item**

Replace the contents of `apps/agent/src/main.ts`:

```typescript
import { app, Tray, Menu } from 'electron';
import path from 'path';
import { bootstrapNestJS } from './nestjs';
import { LicenseService } from './license/license.service';
import { ActivationDialogService } from './license/activation-dialog.service';

let tray: Tray | null = null;

app.whenReady().then(async () => {
  app.dock?.hide();

  const { nestApp } = await bootstrapNestJS();

  const licenseService      = nestApp.get(LicenseService);
  const activationDialog    = nestApp.get(ActivationDialogService);

  const buildTrayMenu = () =>
    Menu.buildFromTemplate([
      { label: 'Control Surface Agent v0.1.0', enabled: false },
      { type: 'separator' },
      {
        label:   licenseService.isLicensed() ? 'Licensed ✓' : 'Activate License…',
        enabled: !licenseService.isLicensed(),
        click:   () => activationDialog.open(),
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);

  const iconPath = path.join(__dirname, '../assets/icon.png');
  try {
    tray = new Tray(iconPath);
    tray.setToolTip('Control Surface Agent');
    tray.setContextMenu(buildTrayMenu());
  } catch {
    console.warn('[Agent] Could not load tray icon — continuing without tray');
  }

  // Auto-open activation dialog if not yet licensed
  if (!licenseService.hasRefreshToken()) {
    activationDialog.open();
  }
});

app.on('window-all-closed', () => { /* tray-only — stay alive */ });
```

- [ ] **Step 4: Update nestjs.ts to return the app reference**

The updated `main.ts` calls `nestApp.get(...)` which requires the NestJS app instance. Update `apps/agent/src/nestjs.ts`:

```typescript
import 'reflect-metadata';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local'), override: true });

import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { INestApplication } from '@nestjs/common';

export async function bootstrapNestJS(): Promise<{ nestApp: INestApplication }> {
  const nestApp = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  nestApp.useWebSocketAdapter(new WsAdapter(nestApp));
  await nestApp.listen(3001);
  console.log('[Agent] WebSocket server ready on ws://localhost:3001');
  console.log('[Agent] GEMINI_API_KEY loaded:', !!process.env.GEMINI_API_KEY);
  return { nestApp };
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/agent && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run all existing tests to confirm no regressions**

```bash
cd apps/agent && npm test
```

The integration tests that import `AppModule` will now include `LicenseModule`. Add mock overrides in `apps/agent/tests/ws.gateway.test.ts` (see Task A6).

Expected: tests pass or the only failures are the gateway integration tests that need the license mock (fixed in Task A6).

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/license/license.module.ts apps/agent/src/app.module.ts apps/agent/src/main.ts apps/agent/src/nestjs.ts
git commit -m "feat: register LicenseModule, add tray menu item and auto-open activation dialog"
```

---

### Task A6: WsGateway updates — LICENSE_STATUS + OPEN_ACTIVATION_DIALOG

**Files:**
- Modify: `apps/agent/src/websocket/ws.gateway.ts`
- Modify: `apps/agent/tests/ws.gateway.test.ts`

- [ ] **Step 1: Update WsGateway**

Replace `apps/agent/src/websocket/ws.gateway.ts`:

```typescript
import { WebSocketGateway, OnGatewayConnection, WebSocketServer } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { platform } from 'os';
import {
  ConnectedMessage,
  MobileMessage,
  ActionResultMessage,
  DeckConfigMessage,
  LicenseStatusMessage,
  AiQuotaExceededMessage,
  SearchAppsResultMessage,
  ValidatePathResultMessage,
} from '@control-surface/shared';
import { CommandService } from '../command/command.service';
import { AppRegistryService } from '../app-launch/app-registry.service';
import { AppSearchService } from '../app-search/app-search.service';
import { LicenseService } from '../license/license.service';
import { ActivationDialogService } from '../license/activation-dialog.service';

@WebSocketGateway()
export class WsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly commandService: CommandService,
    private readonly appRegistry: AppRegistryService,
    private readonly appSearch: AppSearchService,
    private readonly licenseService: LicenseService,
    private readonly activationDialog: ActivationDialogService,
  ) {}

  private sendDeckConfig(client: WebSocket): void {
    const msg: DeckConfigMessage = {
      type: 'DECK_CONFIG',
      tiles: this.appRegistry.getTiles(),
    };
    client.send(JSON.stringify(msg));
  }

  private sendLicenseStatus(client: WebSocket): void {
    const claims = this.licenseService.getClaims();
    const msg: LicenseStatusMessage = {
      type:             'LICENSE_STATUS',
      licensed:         claims.licensed,
      aiPro:            claims.ai_pro,
      creditsRemaining: claims.credits_remaining,
    };
    client.send(JSON.stringify(msg));
  }

  handleConnection(client: WebSocket): void {
    const connected: ConnectedMessage = {
      type:          'CONNECTED',
      agentVersion:  '0.1.0',
      platform:      platform() as 'darwin' | 'win32' | 'linux',
    };
    client.send(JSON.stringify(connected));
    this.sendDeckConfig(client);
    this.sendLicenseStatus(client);

    console.log('[Agent] Mobile client connected');

    client.on('message', async (raw) => {
      let data: MobileMessage;
      try {
        data = JSON.parse(raw.toString()) as MobileMessage;
      } catch {
        return;
      }

      if (data.type === 'OPEN_ACTIVATION_DIALOG') {
        this.activationDialog.open();
        return;
      }

      if (data.type === 'GET_LICENSE_STATUS') {
        this.sendLicenseStatus(client);
        return;
      }

      if (data.type === 'ADD_TILE') {
        this.appRegistry.addTile(data.tile);
        this.sendDeckConfig(client);
        return;
      }

      if (data.type === 'REMOVE_TILE') {
        this.appRegistry.removeTile(data.tileId);
        this.sendDeckConfig(client);
        return;
      }

      if (data.type === 'SET_TILE_PINNED') {
        this.appRegistry.setTilePinned(data.tileId, data.pinned);
        this.sendDeckConfig(client);
        return;
      }

      if (data.type === 'SEARCH_APPS') {
        const startedAt = Date.now();
        console.log(`[Agent] SEARCH_APPS "${data.query}"`);
        const results = await this.appSearch.searchApps(data.query);
        const names = results.slice(0, 5).map((r) => r.name).join(', ');
        console.log(
          `[Agent] SEARCH_APPS_RESULT "${data.query}": ${results.length} result(s)` +
            (names ? ` [${names}]` : '') +
            ` in ${Date.now() - startedAt}ms`,
        );
        const response: SearchAppsResultMessage = { type: 'SEARCH_APPS_RESULT', results };
        client.send(JSON.stringify(response));
        return;
      }

      if (data.type === 'VALIDATE_PATH') {
        console.log(`[Agent] VALIDATE_PATH "${data.exePath}"`);
        const outcome = await this.appSearch.validatePath(data.exePath);
        console.log(`[Agent] VALIDATE_PATH_RESULT "${data.exePath}": ${outcome.valid ? 'valid' : outcome.error}`);
        const response: ValidatePathResultMessage = { type: 'VALIDATE_PATH_RESULT', ...outcome };
        client.send(JSON.stringify(response));
        return;
      }

      if (data.type !== 'BUTTON_TAP') return;

      console.log(`[Agent] BUTTON_TAP ${data.buttonId} (${data.action.kind})`);
      const result = await this.commandService.execute(data.action);

      if (result.quotaExceeded) {
        const quotaMsg: AiQuotaExceededMessage = { type: 'AI_QUOTA_EXCEEDED', reason: 'credits_exhausted' };
        client.send(JSON.stringify(quotaMsg));
        return;
      }

      if (!result.success) {
        console.error(`[Agent] Action failed: ${result.error}`);
      }

      const response: ActionResultMessage = {
        type:    'ACTION_RESULT',
        buttonId: data.buttonId,
        success: result.success,
        output:  result.output,
        error:   result.error,
      };
      client.send(JSON.stringify(response));
    });
  }
}
```

- [ ] **Step 2: Update the WsGateway integration test to mock LicenseModule services and expect 3 initial messages**

The gateway now sends 3 messages on connect: CONNECTED, DECK_CONFIG, LICENSE_STATUS.

Replace `apps/agent/tests/ws.gateway.test.ts`:

```typescript
import WebSocket from 'ws';
import * as fs from 'fs';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../src/app.module';
import { LicenseService } from '../src/license/license.service';
import { ActivationDialogService } from '../src/license/activation-dialog.service';
import { ConnectedMessage, ActionResultMessage, DeckConfigMessage, LicenseStatusMessage } from '@control-surface/shared';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

const mockLicenseService = {
  isLicensed:             () => true,
  isAiPro:                () => false,
  creditsRemaining:       () => 50,
  getClaims:              () => ({ licensed: true, ai_pro: false, credits_remaining: 50 }),
  hasRefreshToken:        () => true,
  onApplicationBootstrap: async () => {},
  refreshSession:         async () => {},
  decrementCredit:        async () => {},
};

const mockActivationDialog = { open: jest.fn() };

describe('WsGateway', () => {
  let app: INestApplication;

  beforeAll(async () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ tiles: [], overrides: {} }));
    mockedFs.writeFileSync.mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LicenseService).useValue(mockLicenseService)
      .overrideProvider(ActivationDialogService).useValue(mockActivationDialog)
      .compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(3099);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends CONNECTED, DECK_CONFIG, then LICENSE_STATUS on connect', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());
      if (messages.length === 3) {
        const connected: ConnectedMessage = JSON.parse(messages[0]);
        expect(connected.type).toBe('CONNECTED');

        const deckConfig: DeckConfigMessage = JSON.parse(messages[1]);
        expect(deckConfig.type).toBe('DECK_CONFIG');

        const licStatus: LicenseStatusMessage = JSON.parse(messages[2]);
        expect(licStatus.type).toBe('LICENSE_STATUS');
        expect(licStatus.licensed).toBe(true);
        expect(licStatus.creditsRemaining).toBe(50);

        ws.close();
        done();
      }
    });
  });

  it('responds with ACTION_RESULT when BUTTON_TAP is received', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());

      if (messages.length === 3) {
        ws.send(JSON.stringify({
          type: 'BUTTON_TAP',
          buttonId: 'btn-test',
          action: { kind: 'CLIPBOARD_WRITE', text: 'gateway test' },
        }));
      }

      if (messages.length === 4) {
        const result: ActionResultMessage = JSON.parse(messages[3]);
        expect(result.type).toBe('ACTION_RESULT');
        expect(result.buttonId).toBe('btn-test');
        expect(result.success).toBe(true);
        ws.close();
        done();
      }
    });
  });

  it('opens activation dialog when OPEN_ACTIVATION_DIALOG is received', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());
      if (messages.length === 3) {
        mockActivationDialog.open.mockClear();
        ws.send(JSON.stringify({ type: 'OPEN_ACTIVATION_DIALOG' }));
        setTimeout(() => {
          expect(mockActivationDialog.open).toHaveBeenCalledTimes(1);
          ws.close();
          done();
        }, 50);
      }
    });
  });

  it('handles ADD_TILE and responds with updated DECK_CONFIG', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());

      if (messages.length === 3) {
        ws.send(JSON.stringify({
          type: 'ADD_TILE',
          tile: { kind: 'url', label: 'Test Site', iconId: 'globe', action: { kind: 'URL_OPEN', url: 'https://example.com' } },
        }));
      }

      if (messages.length === 4) {
        const updated: DeckConfigMessage = JSON.parse(messages[3]);
        expect(updated.type).toBe('DECK_CONFIG');
        expect(updated.tiles.some((t) => t.label === 'Test Site')).toBe(true);
        ws.close();
        done();
      }
    });
  });

  it('handles REMOVE_TILE and responds with updated DECK_CONFIG', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());

      if (messages.length === 3) {
        ws.send(JSON.stringify({
          type: 'ADD_TILE',
          tile: { kind: 'url', label: 'Remove Me', iconId: 'globe', action: { kind: 'URL_OPEN', url: 'https://remove-me.example.com' } },
        }));
      }

      if (messages.length === 4) {
        const withTile: DeckConfigMessage = JSON.parse(messages[3]);
        const tile = withTile.tiles.find((t) => t.label === 'Remove Me');
        expect(tile).toBeDefined();
        ws.send(JSON.stringify({ type: 'REMOVE_TILE', tileId: tile!.id }));
      }

      if (messages.length === 5) {
        const updated: DeckConfigMessage = JSON.parse(messages[4]);
        expect(updated.tiles.some((t) => t.label === 'Remove Me')).toBe(false);
        ws.close();
        done();
      }
    });
  });

  it('handles SET_TILE_PINNED and responds with pinned tile first', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());

      if (messages.length === 3) {
        ws.send(JSON.stringify({
          type: 'ADD_TILE',
          tile: { kind: 'url', label: 'Pin Me', iconId: 'globe', action: { kind: 'URL_OPEN', url: 'https://pin-me.example.com' } },
        }));
      }

      if (messages.length === 4) {
        const withTile: DeckConfigMessage = JSON.parse(messages[3]);
        const tile = withTile.tiles.find((t) => t.label === 'Pin Me');
        expect(tile).toBeDefined();
        ws.send(JSON.stringify({ type: 'SET_TILE_PINNED', tileId: tile!.id, pinned: true }));
      }

      if (messages.length === 5) {
        const updated: DeckConfigMessage = JSON.parse(messages[4]);
        expect(updated.tiles[0]).toMatchObject({ label: 'Pin Me', pinned: true });
        ws.close();
        done();
      }
    });
  });
});
```

- [ ] **Step 3: Run the full test suite**

```bash
cd apps/agent && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/websocket/ws.gateway.ts apps/agent/tests/ws.gateway.test.ts
git commit -m "feat: send LICENSE_STATUS on connect, handle OPEN_ACTIVATION_DIALOG and GET_LICENSE_STATUS"
```

---

### Task A7: CommandService quota check + AiRouterService credit decrement

**Files:**
- Modify: `apps/agent/src/command/command.service.ts`
- Modify: `apps/agent/src/ai/ai-router.service.ts`
- Modify: `apps/agent/tests/command.service.test.ts`

- [ ] **Step 1: Add `quotaExceeded` to CommandResult and quota check for AI_CLIPBOARD**

Replace `apps/agent/src/command/command.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ButtonAction } from '@control-surface/shared';
import { shell } from 'electron';
import { ClipboardService } from '../clipboard/clipboard.service';
import { AiRouterService } from '../ai/ai-router.service';
import { AppLaunchService } from '../app-launch/app-launch.service';
import { KeystrokeService } from '../keystroke/keystroke.service';
import { LicenseService } from '../license/license.service';

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
  quotaExceeded?: boolean;
}

@Injectable()
export class CommandService {
  constructor(
    private readonly clipboard: ClipboardService,
    private readonly aiRouter: AiRouterService,
    private readonly appLaunch: AppLaunchService,
    private readonly keystroke: KeystrokeService,
    private readonly licenseService: LicenseService,
  ) {}

  async execute(action: ButtonAction): Promise<CommandResult> {
    try {
      switch (action.kind) {
        case 'CLIPBOARD_WRITE':
          await this.clipboard.write(action.text);
          return { success: true };

        case 'AI_CLIPBOARD': {
          if (this.licenseService.creditsRemaining() <= 0) {
            return { success: false, quotaExceeded: true };
          }
          const context = await this.clipboard.read();
          const result = await this.aiRouter.call(action.prompt, context);
          if (action.outputMode === 'viewer') {
            return { success: true, output: result };
          }
          await this.clipboard.write(result);
          return { success: true };
        }

        case 'APP_LAUNCH':
          await this.appLaunch.launch(action.appId);
          return { success: true };

        case 'URL_OPEN':
          await this.appLaunch.openUrl(action.url);
          return { success: true };

        case 'KEYSTROKE':
          await this.keystroke.execute(action.keys);
          return { success: true };

        case 'EXEC': {
          const err = await shell.openPath(action.exePath);
          if (err) return { success: false, error: `Failed to launch: ${err}` };
          return { success: true };
        }

        default: {
          const exhaustive: never = action;
          return { success: false, error: `Unknown action kind: ${(exhaustive as ButtonAction).kind}` };
        }
      }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
```

- [ ] **Step 2: Update AiRouterService to inject LicenseService and decrement credits**

Replace `apps/agent/src/ai/ai-router.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { LicenseService } from '../license/license.service';

@Injectable()
export class AiRouterService {
  constructor(private readonly licenseService: LicenseService) {}

  async call(prompt: string, context: string): Promise<string> {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      throw new Error(
        'No AI provider configured. Set GEMINI_API_KEY in environment or .env file.',
      );
    }

    const genAI      = new GoogleGenerativeAI(geminiKey);
    const modelName  = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
    const model      = genAI.getGenerativeModel({ model: modelName });

    const fullPrompt = context
      ? `Clipboard content:\n${context}\n\nInstruction:\n${prompt}`
      : prompt;

    const result = await model.generateContent(fullPrompt);
    const text   = result.response.text();

    // Fire-and-forget — credit decrement must not block or fail the AI response
    this.licenseService.decrementCredit().catch(() => {});

    return text;
  }
}
```

- [ ] **Step 3: Update CommandService tests to cover the quota check**

Add these two tests to `apps/agent/tests/command.service.test.ts`. In the existing `beforeEach`, add a `mockLicenseService` and provide it:

Find the existing `beforeEach` and replace it:

```typescript
  let mockLicenseService: { creditsRemaining: jest.Mock };

  beforeEach(async () => {
    mockAiRouter = { call: jest.fn().mockResolvedValue('AI result text') };
    mockAppLaunch = {
      launch: jest.fn().mockResolvedValue(undefined),
      openUrl: jest.fn().mockResolvedValue(undefined),
    };
    mockKeystroke = { execute: jest.fn().mockResolvedValue(undefined) };
    mockLicenseService = { creditsRemaining: jest.fn().mockReturnValue(10) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommandService,
        ClipboardService,
        { provide: AiRouterService,   useValue: mockAiRouter },
        { provide: AppLaunchService,  useValue: mockAppLaunch },
        { provide: KeystrokeService,  useValue: mockKeystroke },
        { provide: LicenseService,    useValue: mockLicenseService },
      ],
    }).compile();

    commandService   = moduleRef.get(CommandService);
    clipboardService = moduleRef.get(ClipboardService);
  });
```

Add the import at the top of the test file:
```typescript
import { LicenseService } from '../src/license/license.service';
```

Add two new test cases at the end of the `describe` block:

```typescript
  it('returns quotaExceeded when AI_CLIPBOARD is called with 0 credits', async () => {
    mockLicenseService.creditsRemaining.mockReturnValue(0);
    const result = await commandService.execute({
      kind: 'AI_CLIPBOARD',
      prompt: 'Summarize this',
      outputMode: 'clipboard',
    });
    expect(result.success).toBe(false);
    expect(result.quotaExceeded).toBe(true);
    expect(mockAiRouter.call).not.toHaveBeenCalled();
  });

  it('calls AI when credits are available (1+)', async () => {
    mockLicenseService.creditsRemaining.mockReturnValue(1);
    await clipboardService.write('some text');
    const result = await commandService.execute({
      kind: 'AI_CLIPBOARD',
      prompt: 'Fix grammar',
      outputMode: 'clipboard',
    });
    expect(result.success).toBe(true);
    expect(mockAiRouter.call).toHaveBeenCalled();
  });
```

- [ ] **Step 4: Run all tests**

```bash
cd apps/agent && npm test
```

Expected: all tests pass (62 existing + 2 new quota tests).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/command/command.service.ts apps/agent/src/ai/ai-router.service.ts apps/agent/tests/command.service.test.ts
git commit -m "feat: add AI quota check in CommandService and credit decrement in AiRouterService"
```
