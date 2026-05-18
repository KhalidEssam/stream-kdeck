# Electron Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the Control Surface desktop agent into a one-click `.exe` installer (Windows) and `.dmg` disk image (macOS) using `electron-builder`.

**Architecture:** `electron-builder` with `asar: false` bundles the compiled `dist/`, `assets/`, a baked-in `.env`, and `node_modules` as loose files. User tile config (`apps.config.json`) moves from the app bundle to the OS user-data directory (`app.getPath('userData')`), making it writable on all platforms and persistent across app updates. `SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected at build time via a `scripts/write-env.js` helper.

**Tech Stack:** electron-builder ^25, NSIS (Windows), DMG (macOS), Node.js scripts

---

## File Map

| File | Action | Reason |
|------|--------|--------|
| `apps/agent/src/app-launch/app-registry.service.ts` | Modify | Replace `CONFIG_PATH` const with `this.configPath` using `USER_DATA_PATH` env var |
| `apps/agent/src/main.ts` | Modify | Set `process.env.USER_DATA_PATH` before NestJS bootstrap |
| `apps/agent/src/nestjs.ts` | Modify | Remove stale `GEMINI_API_KEY` log line |
| `apps/agent/.env.example` | Modify | Remove `GEMINI_API_KEY` lines (key moved server-side) |
| `apps/agent/scripts/write-env.js` | Create | CI helper: validate + write `.env` before build |
| `apps/agent/package.json` | Modify | Add `electron-builder` dep, build config, dist scripts |
| `.gitignore` | Modify | Add `apps/agent/release/` |

---

### Task 1: Fix AppRegistryService config path to use userData

The service currently stores `apps.config.json` next to the app binary, which is read-only on macOS when installed in `/Applications`. This moves it to the OS user-data directory when running inside Electron.

**Files:**
- Modify: `apps/agent/src/app-launch/app-registry.service.ts`
- Test: `apps/agent/tests/app-registry.service.test.ts` (existing — must still pass)

- [ ] **Step 1: Run the existing tests to confirm baseline**

```bash
cd apps/agent
npx jest tests/app-registry.service.test.ts --no-coverage
```

Expected: all tests PASS (20+ passing).

- [ ] **Step 2: Replace the module-level CONFIG_PATH constant with an instance field**

In `apps/agent/src/app-launch/app-registry.service.ts`, find and remove:

```typescript
const CONFIG_PATH = path.join(__dirname, '../../apps.config.json');
```

Replace the `constructor()` (currently just calls `this.loadConfig()`) with:

```typescript
private readonly configPath: string;

constructor() {
  this.configPath = path.join(
    process.env.USER_DATA_PATH ?? path.join(__dirname, '../../'),
    'apps.config.json',
  );
  this.loadConfig();
}
```

- [ ] **Step 3: Replace all CONFIG_PATH references with this.configPath**

In the same file, make these two replacements:

In `loadConfig()`, change:
```typescript
if (fs.existsSync(CONFIG_PATH)) {
```
to:
```typescript
if (fs.existsSync(this.configPath)) {
```

And:
```typescript
const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
```
to:
```typescript
const raw = fs.readFileSync(this.configPath, 'utf-8');
```

In `persist()`, change:
```typescript
private persist(): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf-8');
}
```
to:
```typescript
private persist(): void {
  try {
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  } catch {
    // Non-fatal: config directory may be read-only (e.g. unsigned macOS bundle)
  }
}
```

- [ ] **Step 4: Run the existing tests to confirm they still pass**

The tests use `jest.mock('fs')` which fully mocks the filesystem — `configPath` value doesn't affect them.

```bash
cd apps/agent
npx jest tests/app-registry.service.test.ts --no-coverage
```

Expected: same results as Step 1 — all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd apps/agent
git add src/app-launch/app-registry.service.ts
git commit -m "fix(agent): store apps.config.json in OS userData directory"
```

---

### Task 2: Set USER_DATA_PATH in Electron main process

`AppRegistryService` reads `process.env.USER_DATA_PATH` at construction time. The main Electron process must set it before NestJS bootstraps.

**Files:**
- Modify: `apps/agent/src/main.ts`

- [ ] **Step 1: Add USER_DATA_PATH assignment before bootstrapNestJS()**

In `apps/agent/src/main.ts`, the current `app.whenReady()` callback starts:

```typescript
app.whenReady().then(async () => {
  app.dock?.hide();

  const { nestApp } = await bootstrapNestJS();
```

Change it to:

```typescript
app.whenReady().then(async () => {
  app.dock?.hide();

  process.env.USER_DATA_PATH = app.getPath('userData');

  const { nestApp } = await bootstrapNestJS();
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd apps/agent
npx tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
cd apps/agent
git add src/main.ts
git commit -m "fix(agent): set USER_DATA_PATH from Electron app.getPath before NestJS bootstrap"
```

---

### Task 3: Cleanup stale GEMINI references and update gitignore

`GEMINI_API_KEY` was removed from the agent in a prior commit (it now lives as a Supabase secret). Clean up its remaining traces.

**Files:**
- Modify: `apps/agent/src/nestjs.ts`
- Modify: `apps/agent/.env.example`
- Modify: `.gitignore` (root)

- [ ] **Step 1: Remove GEMINI_API_KEY log line from nestjs.ts**

In `apps/agent/src/nestjs.ts`, remove this line:

```typescript
  console.log('[Agent] GEMINI_API_KEY loaded:', !!process.env.GEMINI_API_KEY);
```

The file after the removal should end with:

```typescript
export async function bootstrapNestJS(): Promise<{ nestApp: INestApplication }> {
  const nestApp = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  nestApp.useWebSocketAdapter(new WsAdapter(nestApp));
  await nestApp.listen(AGENT_PORT);
  console.log(`[Agent] WebSocket server ready on ws://localhost:${AGENT_PORT}`);
  return { nestApp };
}
```

- [ ] **Step 2: Update .env.example to remove GEMINI lines**

Replace the full content of `apps/agent/.env.example` with:

```
# Supabase — required for license activation and session refresh (always needed, not secret)
# Project Settings > API  (anon/publishable key — safe to ship in the installer)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
```

- [ ] **Step 3: Add release/ to root .gitignore**

In `.gitignore` (root of the repo), append:

```
apps/agent/release/
```

- [ ] **Step 4: Verify TypeScript still compiles**

```bash
cd apps/agent
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd D:/BMC/stream-deck   # repo root for .gitignore
git add apps/agent/src/nestjs.ts apps/agent/.env.example .gitignore
git commit -m "chore(agent): remove stale GEMINI_API_KEY references, add release/ to gitignore"
```

---

### Task 4: Add write-env.js CI helper script

This script reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from environment variables, validates they are non-empty, and writes `apps/agent/.env`. It runs automatically as the `predist` npm lifecycle hook before every dist build.

**Files:**
- Create: `apps/agent/scripts/write-env.js`

- [ ] **Step 1: Create the scripts directory and write-env.js**

Create `apps/agent/scripts/write-env.js` with this content:

```javascript
#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing  = REQUIRED.filter((k) => !process.env[k]);

if (missing.length > 0) {
  console.error(`[write-env] Missing required env vars: ${missing.join(', ')}`);
  console.error('[write-env] Set them in your environment or CI secrets before running dist.');
  process.exit(1);
}

const lines   = REQUIRED.map((k) => `${k}=${process.env[k]}`).join('\n') + '\n';
const outPath = path.join(__dirname, '../.env');

fs.writeFileSync(outPath, lines, 'utf8');
console.log(`[write-env] Wrote ${outPath}`);
```

- [ ] **Step 2: Test the script manually**

Run it without the required env vars to confirm it exits with code 1:

```bash
cd apps/agent
node scripts/write-env.js
```

Expected output:
```
[write-env] Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY
[write-env] Set them in your environment or CI secrets before running dist.
```
And exit code 1.

- [ ] **Step 3: Test with env vars set**

```bash
SUPABASE_URL=https://test.supabase.co SUPABASE_ANON_KEY=anon-key-test node scripts/write-env.js
```

On Windows PowerShell:
```powershell
$env:SUPABASE_URL="https://test.supabase.co"; $env:SUPABASE_ANON_KEY="anon-key-test"; node scripts/write-env.js
```

Expected output:
```
[write-env] Wrote <absolute-path>\apps\agent\.env
```

Verify `.env` was written:
```bash
cat apps/agent/.env
```

Expected:
```
SUPABASE_URL=https://test.supabase.co
SUPABASE_ANON_KEY=anon-key-test
```

- [ ] **Step 4: Commit**

```bash
cd apps/agent
git add scripts/write-env.js
git commit -m "feat(agent): add write-env.js to bake Supabase vars into .env at build time"
```

---

### Task 5: Add electron-builder config and dist scripts

Install `electron-builder`, configure it in `package.json`, and verify `npm run dist:win` produces an installer.

**Files:**
- Modify: `apps/agent/package.json`

- [ ] **Step 1: Install electron-builder as a devDependency**

```bash
cd apps/agent
npm install --save-dev electron-builder@^25.0.0
```

Expected: `package.json` devDependencies gains `"electron-builder": "^25.x.x"` and `package-lock.json` is updated.

- [ ] **Step 2: Add build config and dist scripts to package.json**

In `apps/agent/package.json`, add the `"build"` key and update `"scripts"`. The final `package.json` `"scripts"` section should be:

```json
"scripts": {
  "dev":      "tsc --build && electron .",
  "build":    "tsc --build",
  "test":     "jest",
  "predist":  "node scripts/write-env.js",
  "dist":     "tsc --build && electron-builder",
  "dist:win": "tsc --build && electron-builder --win",
  "dist:mac": "tsc --build && electron-builder --mac"
},
```

And add a top-level `"build"` key (sibling of `"scripts"`, `"dependencies"`, etc.):

```json
"build": {
  "appId": "com.controlsurface.agent",
  "productName": "Control Surface Agent",
  "copyright": "Copyright © 2026 Control Surface",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "assets/**/*",
    ".env",
    "package.json",
    "node_modules/**/*"
  ],
  "asar": false,
  "win": {
    "target": [{ "target": "nsis", "arch": ["x64"] }],
    "icon": "assets/icon.png"
  },
  "nsis": {
    "oneClick": true,
    "perMachine": false,
    "createDesktopShortcut": false,
    "createStartMenuShortcut": true
  },
  "mac": {
    "category": "public.app-category.utilities",
    "target": [{ "target": "dmg", "arch": ["x64", "arm64"] }],
    "icon": "assets/icon.png",
    "extendInfo": {
      "LSUIElement": true
    }
  }
}
```

- [ ] **Step 3: Ensure a real .env exists with actual Supabase values**

The `predist` script will fail if `SUPABASE_URL` and `SUPABASE_ANON_KEY` are not set. Either:
- Set them in your shell environment, **or**
- Manually create `apps/agent/.env` with real values from the Supabase dashboard

```
SUPABASE_URL=https://your-actual-project-ref.supabase.co
SUPABASE_ANON_KEY=your-actual-anon-key
```

- [ ] **Step 4: Run the Windows dist build**

```bash
cd apps/agent
npm run dist:win
```

This runs `predist` → `tsc --build` → `electron-builder --win`. Expect a few minutes on first run (downloading Electron binary, rebuilding native modules).

Expected output (last lines):
```
  • building        target=NSIS name="Control Surface Agent" file=Control Surface Agent Setup x.x.x.exe archs=x64
  • building        nsis installer
  • built           release/Control Surface Agent Setup 0.1.0.exe
```

- [ ] **Step 5: Verify the installer**

Check that the file exists:

```bash
ls apps/agent/release/
```

Expected: `Control Surface Agent Setup 0.1.0.exe` (size ~150-200MB).

Double-click `Control Surface Agent Setup 0.1.0.exe` to install. Expected:
- Installs silently to `%LOCALAPPDATA%\Programs\Control Surface Agent\` without UAC prompt
- Tray icon appears in the system tray after install
- Activation dialog opens (no stored session yet)
- After activation: tray shows "Licensed ✓", WebSocket ready on port 3001

- [ ] **Step 6: Commit**

```bash
cd apps/agent
git add package.json package-lock.json
git commit -m "feat(agent): add electron-builder installer config and dist scripts"
```

---

## macOS Build Note

`npm run dist:mac` must be run on a macOS machine. It produces:
- `release/Control Surface Agent-0.1.0-universal.dmg` — runs on both Intel (x64) and Apple Silicon (arm64)

Steps on Mac:
1. `cd apps/agent && npm install`
2. Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are in your environment
3. `npm run dist:mac`
4. Mount the DMG, drag `Control Surface Agent.app` to `/Applications`
5. Right-click → Open (required on first launch since the app is unsigned — code signing is P1)

---

## Post-Implementation Checklist

- [ ] `npm run dist:win` produces an installable `.exe`
- [ ] Installed agent: tray icon visible, activation dialog opens on first run
- [ ] After activation: `%APPDATA%\Control Surface Agent\apps.config.json` is created on first tile interaction
- [ ] `apps/agent/release/` is gitignored (not committed)
- [ ] `apps/agent/.env` is gitignored (not committed)
