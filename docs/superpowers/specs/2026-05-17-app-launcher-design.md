# App Launcher & Unified Icon Grid — Design Spec

**Date:** 2026-05-17  
**Status:** Approved  
**Scope:** Replace the hardcoded AI text-button grid with a unified, dynamic icon grid. Users configure app/URL/AI tiles from mobile. The agent is the source of truth for config; mobile can add tiles via a "+" screen.

---

## 1. Goals

1. Open any desktop app or URL from a mobile button tap (Spotify, OBS, Twitch, VS Code, etc.)
2. Unified grid — AI clipboard actions and app launchers are the same kind of tile, not separate screens
3. Config lives on the agent (`apps.config.json`) and is pushed to mobile on every connect
4. Mobile can add tiles from a curated library + custom URL fallback
5. Works on Windows and macOS from day one — no native modules required (Electron `shell` API only)

---

## 2. Architecture

```
apps.config.json  +  built-in registry
         │
         ▼  on connect
  DECK_CONFIG (WebSocket)
         │
         ▼
  Mobile renders icon grid
         │
    user taps "+"
         │
         ▼
  ADD_TILE (WebSocket) ──► agent appends to apps.config.json
                        ──► sends fresh DECK_CONFIG
         │
    user taps tile
         │
         ▼
  BUTTON_TAP ──► CommandService ──► AppLaunchService ──► shell.openExternal()
```

### App resolution — two-layer lookup

1. **Built-in registry** (TypeScript, shipped with agent): maps `appId` → `{ label, windows, mac, iconId }` for ~25 common apps
2. **User config** (`apps/agent/apps.config.json`): adds custom apps and overrides registry entries (user wins)

### Icon resolution — two-layer

1. **Bundled PNGs** in `apps/mobile/assets/icons/<appId>.png` — ships with the mobile app for all curated apps
2. **Fallback** — colored square tile with the first letter of the label (for custom apps not in the library)

---

## 3. Schema Changes (`packages/shared/src/schema.ts`)

### Updated `ButtonAction`

```ts
export type ButtonAction =
  | { kind: 'AI_CLIPBOARD'; prompt: string; outputMode: 'clipboard' | 'autopaste' | 'viewer' }
  | { kind: 'KEYSTROKE';    keys: string[] }                          // still stubbed
  | { kind: 'APP_LAUNCH';   appId: string }                          // was bundleId, now friendly name
  | { kind: 'URL_OPEN';     url: string }                            // new — direct URL, no lookup
  | { kind: 'CLIPBOARD_WRITE'; text: string };
```

### New agent → mobile messages

```ts
export interface TileConfig {
  id: string;           // stable UUID, authored by agent
  kind: 'app' | 'url' | 'ai';
  label: string;        // shown below the icon
  iconId: string;       // maps to assets/icons/<iconId>.png; fallback to first letter
  color?: string;       // background color (used for AI tiles; apps default to #1E1E2E)
  action: ButtonAction;
}

export interface DeckConfigMessage {
  type: 'DECK_CONFIG';
  tiles: TileConfig[];
}
```

### New mobile → agent message

```ts
export interface AddTileMessage {
  type: 'ADD_TILE';
  tile: Omit<TileConfig, 'id'>; // agent assigns the id
}
```

### Updated union types

```ts
export type AgentMessage  = ActionResultMessage | ConnectedMessage | DeckConfigMessage;
export type MobileMessage = ButtonTapMessage | AddTileMessage;
```

---

## 4. Agent — New Services

### 4a. `AppLaunchService` (`src/app-launch/app-launch.service.ts`)

Executes the launch. Two methods:

- `launch(appId: string): Promise<void>` — looks up `appId` in `AppRegistryService`, calls `shell.openExternal(resolvedTarget)`. Throws a descriptive error if `appId` is unknown.
- `openUrl(url: string): Promise<void>` — calls `shell.openExternal(url)` directly.

Both rely on Electron's `shell.openExternal()`. No native modules. Works on Windows + macOS.

`CommandService` gains two new implemented cases:
```ts
case 'APP_LAUNCH': await this.appLaunch.launch(action.appId); return { success: true };
case 'URL_OPEN':   await this.appLaunch.openUrl(action.url);  return { success: true };
```

### 4b. `AppRegistryService` (`src/app-launch/app-registry.service.ts`)

Owns both the built-in registry and the user config file.

**Built-in registry (~25 apps):**

| appId | Label | Windows target | macOS target |
|---|---|---|---|
| `spotify` | Spotify | `spotify://` | `spotify://` |
| `obs` | OBS Studio | `C:\Program Files\obs-studio\bin\64bit\obs64.exe` | `open -a "OBS"` (via shell) |
| `vscode` | VS Code | `code://` | `vscode://` |
| `chrome` | Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` | `open -a "Google Chrome"` |
| `discord` | Discord | `discord://` | `discord://` |
| `slack` | Slack | `slack://` | `slack://` |
| `notion` | Notion | `notion://` | `notion://` |
| `figma` | Figma | `https://figma.com` | `https://figma.com` |
| `claude` | Claude | `https://claude.ai` | `https://claude.ai` |
| `github` | GitHub | `https://github.com` | `https://github.com` |
| `youtube` | YouTube | `https://youtube.com` | `https://youtube.com` |
| `twitch` | Twitch | `https://twitch.tv` | `https://twitch.tv` |
| `powershell` | PowerShell | `powershell.exe` | *(macOS N/A)* |
| `terminal` | Terminal | `wt.exe` (Windows Terminal) | `open -a Terminal` |
| `explorer` | File Explorer | `explorer.exe` | `open ~` |
| `steam` | Steam | `steam://` | `steam://` |
| `postman` | Postman | `https://web.postman.co` | `https://web.postman.co` |
| `linear` | Linear | `https://linear.app` | `https://linear.app` |
| `vercel` | Vercel | `https://vercel.com` | `https://vercel.com` |

**`apps.config.json` format** (created empty on first run):
```json
{
  "tiles": [
    {
      "kind": "app",
      "label": "Spotify",
      "iconId": "spotify",
      "action": { "kind": "APP_LAUNCH", "appId": "spotify" }
    }
  ],
  "overrides": {
    "obs": "C:\\custom\\path\\obs64.exe"
  }
}
```

**Methods:**
- `getTiles(): TileConfig[]` — merges built-in defaults with `tiles` from config file, assigns stable UUIDs, returns ordered list
- `addTile(tile: Omit<TileConfig, 'id'>): void` — appends to `apps.config.json`, persists to disk
- `resolveTarget(appId: string): string` — returns the platform-appropriate target string; checks `overrides` first, then built-in registry; throws if unknown

### 4c. `WsGateway` changes

On connect, after sending `CONNECTED`, immediately send `DECK_CONFIG`:
```ts
const deckConfig: DeckConfigMessage = {
  type: 'DECK_CONFIG',
  tiles: this.appRegistry.getTiles(),
};
client.send(JSON.stringify(deckConfig));
```

Handle incoming `ADD_TILE`:
```ts
if (data.type === 'ADD_TILE') {
  this.appRegistry.addTile(data.tile);
  const updated: DeckConfigMessage = { type: 'DECK_CONFIG', tiles: this.appRegistry.getTiles() };
  client.send(JSON.stringify(updated));
}
```

### 4d. `AppModule` changes

Add `AppLaunchService` and `AppRegistryService` to providers.

---

## 5. Mobile — New UI

### 5a. `AppTile` component (`src/components/AppTile.tsx`)

Replaces `DeckButton`. Square tile:
- **Icon**: `<Image source={require('../assets/icons/<iconId>.png')} />` if the asset exists; else a colored square with the label's first letter centered
- **Label**: small text below the icon, 2-line max, centered
- **AI badge**: small "✦" in top-right corner when `kind === 'ai'`
- **Loading**: semi-transparent overlay + spinner when `isLoading`
- **Press animation**: same spring scale as current `DeckButton`

### 5b. `DeckScreen` changes

- Replaces `DEMO_BUTTONS` hardcoded array with `tiles: TileConfig[]` from state
- On `DECK_CONFIG` message: `setTiles(msg.tiles)`
- Before first `DECK_CONFIG` arrives: shows skeleton placeholders (same grid layout, grey boxes)
- "+" FAB button (bottom-right, 56×56, rounded): navigates to `AddTileScreen`
- Handles both `ACTION_RESULT` (existing) and `DECK_CONFIG` / `ADD_TILE_ACK` (new)

### 5c. `AddTileScreen` (`src/screens/AddTileScreen.tsx`)

Full-screen modal or new route:
- **Search bar** at top — filters the curated list by label
- **Curated grid** — 3-column grid of `AppTile` showing all 25 built-in apps
- **"Custom URL" row** at the bottom — text input + "Add" button; creates a `URL_OPEN` tile with a generic globe icon
- Tapping any curated app sends `ADD_TILE` to agent and pops the screen
- Agent responds with fresh `DECK_CONFIG` which updates the main grid

### 5d. Icon assets

25 PNG files at `apps/mobile/assets/icons/<appId>.png`:
- Size: 512×512 (React Native scales down)
- Format: PNG with transparency
- Source: official brand assets / simple SVG-to-PNG conversions
- Generic fallback rendered in code (no asset file needed)

---

## 6. Error Handling

| Scenario | Behavior |
|---|---|
| `appId` not in registry or config | Agent returns `{ success: false, error: 'Unknown app: <id>' }` |
| App not installed (path doesn't exist) | `shell.openExternal()` fails silently on most platforms; agent catches and returns error |
| `URL_OPEN` with malformed URL | Agent validates `url.startsWith('http')` before calling shell; returns error if invalid |
| No `DECK_CONFIG` received | Mobile shows skeleton grid; refresh button triggers reconnect |
| `ADD_TILE` when agent config not writable | Agent returns error; mobile shows toast |

---

## 7. Testing

**Agent:**
- `AppRegistryService`: unit tests — `resolveTarget` for known/unknown appIds, `addTile` writes to config, `getTiles` merges correctly
- `AppLaunchService`: mock `shell.openExternal`, verify called with correct target
- `CommandService`: two new cases (`APP_LAUNCH`, `URL_OPEN`) added to existing test suite
- `WsGateway`: integration test — verify `DECK_CONFIG` sent on connect, `ADD_TILE` triggers config update + fresh `DECK_CONFIG`

**Mobile:**
- `AppTile`: snapshot test for icon/fallback/badge/loading states
- `AddTileScreen`: sends correct `ADD_TILE` message on tap
- `WebSocketService`: handles `DECK_CONFIG` message and fires `onDeckConfig` callback

---

## 8. Out of Scope (this spec)

- Drag-to-reorder tiles
- Delete / edit existing tiles from mobile
- Reading actual installed app icons from the OS
- KEYSTROKE execution (separate spec)
- OBS integration (separate spec)
- Tile profiles / multiple pages
