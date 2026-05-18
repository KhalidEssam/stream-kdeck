# Electron Installer Design

## Goal

Produce a double-click `.exe` installer (Windows) and `.dmg` disk image (macOS) for the Control Surface desktop agent using `electron-builder` with `asar: false`.

## Architecture

`electron-builder` packages the compiled TypeScript (`dist/`), assets, bundled `.env`, and all `node_modules` (including native binaries) as loose files inside the installer. No ASAR archive — NestJS dynamic requires and `@nut-tree-fork/nut-js` native bindings require direct filesystem access.

`apps.config.json` (user tile config) moves out of the app bundle and into the OS user-data directory, written by Electron's `app.getPath('userData')`. This makes it writable on all platforms and survives app updates.

## Components

### 1. `electron-builder` config (in `apps/agent/package.json`)

```json
"build": {
  "appId": "com.controlsurface.agent",
  "productName": "Control Surface Agent",
  "directories": { "output": "release" },
  "files": ["dist/**/*", "assets/**/*", ".env", "package.json", "node_modules/**/*"],
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
    "extendInfo": { "LSUIElement": true }
  }
}
```

`LSUIElement: 1` suppresses the macOS dock icon at the OS level (the app already calls `app.dock?.hide()` in code, but this prevents the icon flashing during startup).

### 2. Build scripts (in `apps/agent/package.json`)

```json
"predist":   "node scripts/write-env.js",
"dist":      "tsc --build && electron-builder",
"dist:win":  "tsc --build && electron-builder --win",
"dist:mac":  "tsc --build && electron-builder --mac"
```

`predist` runs automatically before any `dist*` script via npm lifecycle.

### 3. `apps/agent/scripts/write-env.js`

Reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `process.env`, validates they are set, writes `apps/agent/.env`. Exits with code 1 if either is missing so the build fails fast in CI.

Only these two vars are written — `GEMINI_API_KEY` is gone (now a Supabase secret used by the Edge Function).

### 4. `apps/agent/src/main.ts` change

Add before `bootstrapNestJS()`:
```typescript
process.env.USER_DATA_PATH = app.getPath('userData');
```

### 5. `apps/agent/src/app-launch/app-registry.service.ts` changes

Replace module-level `CONFIG_PATH` constant with an instance field:
```typescript
private readonly configPath: string;
constructor() {
  this.configPath = path.join(
    process.env.USER_DATA_PATH ?? path.join(__dirname, '../../'),
    'apps.config.json'
  );
  this.loadConfig();
}
```

Wrap `persist()` body in try/catch (non-fatal write failure).

Replace all `CONFIG_PATH` references with `this.configPath`.

### 6. Cleanup

- Remove `GEMINI_API_KEY` lines from `apps/agent/.env.example`
- Remove `console.log('[Agent] GEMINI_API_KEY loaded: ...')` from `apps/agent/src/nestjs.ts`
- Add `apps/agent/release/` to root `.gitignore`

## Env Var Injection

| Var | Source | How |
|-----|--------|-----|
| `SUPABASE_URL` | CI secret / dev `.env` | `write-env.js` writes to `apps/agent/.env` before build |
| `SUPABASE_ANON_KEY` | CI secret / dev `.env` | Same |

The bundled `.env` is readable by users who unpack the installer, but both vars are public anon keys by design — not secrets.

## Platform Notes

- **Windows:** Build on any OS with `npm run dist:win`. NSIS per-user install goes to `%LOCALAPPDATA%\Programs\Control Surface Agent\` — no admin rights required.
- **macOS:** Must be built on a macOS machine with `npm run dist:mac`. Produces a universal DMG (x64 + arm64). No code signing in this pass (P1).
- **Output:** `apps/agent/release/` — gitignored.

## Testing

After `npm run dist:win`:
1. Run the generated `.exe` — one-click install with no UAC prompt
2. Agent starts, tray icon appears
3. Activation dialog opens on first run (no stored session)
4. After activation: tray shows "Licensed ✓", WebSocket on port 3001 ready
5. `apps.config.json` written to `%APPDATA%\Control Surface Agent\` on first tile interaction
