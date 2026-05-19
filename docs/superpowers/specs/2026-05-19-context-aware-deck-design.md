# Context-Aware Deck — Design Spec

**Date:** 2026-05-19
**Status:** Approved

---

## 0. Context

KDeck's mobile app currently shows a static deck of tiles the user has configured. This spec adds a context strip that appears automatically at the bottom of the deck when a known app is focused on the desktop — showing that app's most useful keyboard shortcuts as tappable tiles. Shortcuts execute via the existing `BUTTON_TAP + KEYSTROKE` path.

Reference: core architecture at `docs/superpowers/specs/2026-05-13-control-surface-platform-design.md`.

---

## 1. User-Facing Behaviour

1. User focuses Discord on their PC.
2. After 1.5s (debounce), the agent detects the focus change.
3. A context strip slides up from the bottom of the mobile deck showing Discord's shortcuts in a horizontally scrollable row.
4. User taps "Mute" — `Ctrl+Shift+M` fires on the desktop. Strip stays visible.
5. User focuses an unknown app — strip slides away.
6. User focuses an app that has no cached profile yet (first time, curated list) — strip stays hidden while Gemini generates shortcuts in the background. Strip appears once ready.
7. User focuses an uncurated/unknown app — strip stays hidden. User can manually create shortcuts for it via the settings screen.

---

## 2. Architecture

```
active-win (500ms poll)
        │  debounce 1.5s
        ▼
ActiveWindowService  ──emits appChanged──►  ContextProfileService
                                                    │
                                          cache hit? └─► return shortcuts
                                          cache miss + curated? └─► call Gemini → cache → return
                                          cache miss + unknown? └─► return null
                                                    │
                                                    ▼
                                              WsGateway
                                                    │  CONTEXT_SHORTCUTS push
                                                    ▼
                                           Mobile WebSocketService
                                                    │
                                                    ▼
                                              DeckScreen state
                                                    │
                                            contextShortcuts non-empty?
                                                    │
                                                    ▼
                                             ContextStrip component
```

Shortcut execution path (unchanged):
```
Tap tile → BUTTON_TAP { action: { kind: 'KEYSTROKE', keys: [...] } }
         → CommandService → KeystrokeService → OS keyboard event
```

**Important dependency:** `KeystrokeService` is currently stubbed. This feature requires it to be implemented (see Section 6).

---

## 3. Data Model

### `context-profiles.json` (agent disk, alongside `apps.config.json`)

```json
{
  "profiles": {
    "Discord.exe": {
      "source": "llm",
      "generatedAt": "2026-05-19T10:00:00Z",
      "appLabel": "Discord",
      "iconId": "discord",
      "shortcuts": [
        {
          "id": "uuid-v4",
          "label": "Mute",
          "keys": ["Ctrl", "Shift", "M"],
          "description": "Toggle microphone mute"
        }
      ]
    },
    "obs64.exe": {
      "source": "llm",
      "generatedAt": "2026-05-19T10:00:00Z",
      "appLabel": "OBS Studio",
      "iconId": "obs",
      "shortcuts": [...]
    },
    "MyCustomApp.exe": {
      "source": "user",
      "appLabel": "My Custom App",
      "iconId": "custom",
      "shortcuts": [
        {
          "id": "uuid-v4",
          "label": "Save",
          "keys": ["Ctrl", "S"],
          "description": ""
        }
      ]
    }
  }
}
```

**Field notes:**
- Keyed by OS process name as returned by `active-win` (e.g. `Discord.exe` on Windows, `Discord` on macOS)
- `source: "llm"` — auto-generated; shown with small "AI" badge in mobile UI
- `source: "user"` — manually created; no badge
- `source: "llm-failed"` — generation attempted but failed; not retried until next agent restart
- Each shortcut has a stable UUID so entries can be individually deleted or edited
- User additions to an LLM profile are appended to the same `shortcuts` array; `source` stays `"llm"`

### New WebSocket messages (`packages/shared/src/schema.ts`)

**Agent → Mobile:**
```ts
export interface ContextShortcut {
  id: string;
  label: string;
  keys: string[];
  description: string;
}

export interface ContextShortcutsMessage {
  type: 'CONTEXT_SHORTCUTS';
  appLabel: string;       // e.g. "Discord"
  iconId: string;         // maps to existing mobile icon assets
  shortcuts: ContextShortcut[];  // empty array = hide strip
}
```

**Mobile → Agent:**
```ts
export interface AddContextShortcutMessage {
  type: 'ADD_CONTEXT_SHORTCUT';
  processName: string;    // e.g. "Discord.exe"
  appLabel: string;
  iconId: string;
  shortcut: Omit<ContextShortcut, 'id'>;  // agent assigns UUID
}

export interface RemoveContextShortcutMessage {
  type: 'REMOVE_CONTEXT_SHORTCUT';
  processName: string;
  shortcutId: string;
}

export interface GetContextProfilesMessage {
  type: 'GET_CONTEXT_PROFILES';
}

export interface ContextProfilesMessage {
  type: 'CONTEXT_PROFILES';
  profiles: Array<{
    processName: string;
    appLabel: string;
    iconId: string;
    source: 'llm' | 'user' | 'llm-failed';
    shortcutCount: number;
  }>;
}
```

Updated union types:
```ts
export type AgentMessage  = ... | ContextShortcutsMessage | ContextProfilesMessage;
export type MobileMessage = ... | AddContextShortcutMessage | RemoveContextShortcutMessage | GetContextProfilesMessage;
```

`BUTTON_TAP` with `action: { kind: 'KEYSTROKE', keys: [...] }` is unchanged — existing schema.

---

## 4. Agent — New Services

### 4a. `ActiveWindowService` (`src/active-window/active-window.service.ts`)

```ts
@Injectable()
export class ActiveWindowService implements OnModuleInit, OnModuleDestroy {
  // Polls active-win every 500ms
  // Debounces emits: only fires if same process held focus for 1.5s
  // Emits: appChanged(processName: string | null)
  // null = desktop, lock screen, or detection failure
}
```

- Uses `active-win` npm package (already in planned stack)
- Exposes `current: string | null` property — the process name that last triggered `appChanged`, readable synchronously by `WsGateway` on new client connections
- Interval cleared on module destroy (clean agent shutdown)
- Handles `active-win` returning `undefined` (lock screen / no window) → emits `null`

### 4b. `ContextProfileService` (`src/context-profile/context-profile.service.ts`)

```ts
@Injectable()
export class ContextProfileService {
  // Reads/writes context-profiles.json
  // getProfile(processName): ContextProfile | null
  // generateAndCache(processName, appLabel, iconId): Promise<void>
  // addShortcut(processName, appLabel, iconId, shortcut): void
  // removeShortcut(processName, shortcutId): void
  // isCurated(processName): boolean  — checks against CURATED_APPS map
}
```

**`CURATED_APPS` map** (TypeScript constant, shipped with agent):
Maps process name → `{ appLabel, iconId }` for all apps in the existing `AppRegistryService` built-in registry (~25 apps). Example:

```ts
const CURATED_APPS: Record<string, { appLabel: string; iconId: string }> = {
  'Discord.exe':     { appLabel: 'Discord',    iconId: 'discord' },
  'obs64.exe':       { appLabel: 'OBS Studio', iconId: 'obs' },
  'Code.exe':        { appLabel: 'VS Code',    iconId: 'vscode' },
  'Spotify.exe':     { appLabel: 'Spotify',    iconId: 'spotify' },
  'Slack.exe':       { appLabel: 'Slack',      iconId: 'slack' },
  'figma_agent.exe': { appLabel: 'Figma',      iconId: 'figma' },
  // macOS equivalents alongside Windows entries
  'Discord':         { appLabel: 'Discord',    iconId: 'discord' },
  'obs':             { appLabel: 'OBS Studio', iconId: 'obs' },
  // ...
};
```

**Generation flow:**
1. Check `context-profiles.json` for existing profile → return if found
2. Check `CURATED_APPS` → if not present, return null (strip stays hidden)
3. Call `AiRouterService` with the generation prompt
4. Parse and validate response JSON
5. Write profile to `context-profiles.json` with `source: "llm"`
6. If parse fails or returns 0 shortcuts → write `source: "llm-failed"`, return null

### 4c. `ContextModule` (`src/context-profile/context.module.ts`)

NestJS module wiring `ActiveWindowService` + `ContextProfileService`. Imported into `AppModule`.

### 4d. `WsGateway` changes

```ts
// On new client connection — send current context immediately
const profile = this.contextProfile.getProfile(this.activeWindow.current);
client.send(JSON.stringify(buildContextMessage(profile)));

// On appChanged event
this.activeWindow.on('appChanged', async (processName) => {
  let profile = this.contextProfile.getProfile(processName);
  if (!profile && processName && this.contextProfile.isCurated(processName)) {
    await this.contextProfile.generateAndCache(processName, ...);
    profile = this.contextProfile.getProfile(processName);
  }
  const msg: ContextShortcutsMessage = {
    type: 'CONTEXT_SHORTCUTS',
    appLabel: profile?.appLabel ?? '',
    iconId: profile?.iconId ?? '',
    shortcuts: profile?.shortcuts ?? [],
  };
  this.broadcastAll(JSON.stringify(msg));
});

// Handle ADD_CONTEXT_SHORTCUT → contextProfile.addShortcut() → send fresh CONTEXT_SHORTCUTS
// Handle REMOVE_CONTEXT_SHORTCUT → contextProfile.removeShortcut() → send fresh CONTEXT_SHORTCUTS
// Handle GET_CONTEXT_PROFILES → send CONTEXT_PROFILES with summary list
```

---

## 5. Mobile — New UI

### 5a. `ContextStrip` component (`src/components/ContextStrip.tsx`)

```
┌─────────────────────────────────────────────────────┐
│  [icon] Discord                              [×]    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ··· │
│  │  🎤  │ │  🔇  │ │  ✏️  │ │  🔎  │ │  📌  │     │
│  │ Mute │ │Deafen│ │ Edit │ │Search│ │Inbox │     │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘     │
└─────────────────────────────────────────────────────┘
```

- Animated slide-up when `shortcuts` array becomes non-empty; slide-down when empty
- Header row: app icon (from existing icon assets) + app label + dismiss `[×]` button
- LLM-generated profiles show a small "AI" badge next to the app label
- `FlatList` horizontal, `showsHorizontalScrollIndicator={false}`, right-fade gradient to hint at more
- Each tile: same dimensions and press animation as existing `AppTile`
- "+" icon as last tile in the list → opens inline shortcut creation form
- Dismiss `[×]` hides the strip until the active app changes again — the next `CONTEXT_SHORTCUTS` push (triggered by a real focus change) re-shows it. Not persisted; state is in-memory only.

### 5b. `DeckScreen` changes

```ts
const [contextShortcuts, setContextShortcuts] = useState<ContextShortcutsMessage | null>(null);

// In WebSocketService handler:
case 'CONTEXT_SHORTCUTS':
  setContextShortcuts(msg.shortcuts.length > 0 ? msg : null);
  break;
```

`ContextStrip` rendered below the main tile grid, conditionally on `contextShortcuts !== null`.

### 5c. Context Shortcuts settings screen (`src/screens/ContextShortcutsScreen.tsx`)

- Listed under app settings (accessible regardless of what's focused on desktop)
- Shows all profiles from `context-profiles.json` (agent sends full list on request via `GET_CONTEXT_PROFILES` message)
- Each row: app icon + label + shortcut count + source badge ("AI" or "Manual")
- Tap row → profile detail: list of shortcuts, swipe-to-delete per entry, "+" to add
- "Add app" row at bottom → form: app label + process name (user must know it, e.g. `Discord.exe`) + first shortcut

### 5d. Inline shortcut creation form (within `ContextStrip`)

Tapping "+" in the strip opens a bottom sheet:
- Label field (text input)
- Key recorder: tapping modifier chips (Ctrl, Shift, Alt, Meta) + a key input field
- Save → sends `ADD_CONTEXT_SHORTCUT` → agent writes to `context-profiles.json` → sends fresh `CONTEXT_SHORTCUTS`

---

## 6. KeystrokeService Implementation (dependency)

`KeystrokeService` (`src/keystroke/keystroke.service.ts`) is currently stubbed. This feature requires it.

**Recommended package:** `@nut-tree/nut-js` — pure JS, no native compilation required, cross-platform (Windows + macOS), works inside Electron renderer/main.

```ts
execute(keys: string[]): Promise<void>
// Maps ["Ctrl","Shift","M"] → nut-js Key constants → keyboard.pressKey / releaseKey sequence
```

**Alternative:** `robotjs` — faster but requires native compilation per Electron version (fragile). Avoid.

---

## 7. LLM Prompt

```
You are a keyboard shortcut assistant. List the most useful default keyboard
shortcuts for [appLabel] on [Windows|macOS].

Return ONLY a JSON array, no markdown, no explanation:
[
  { "label": "Short action name (2-3 words max)", "keys": ["Ctrl","Shift","M"], "description": "One sentence." },
  ...
]

Rules:
- Return 12–15 shortcuts maximum
- Order by how frequently a power user would reach for them (most useful first)
- Use the app's actual documented default key bindings only — no guesses
- Keys array: use exact modifier names: "Ctrl", "Shift", "Alt", "Meta"
- If you are not confident about a shortcut, omit it entirely
```

Response validation: must be a JSON array; each item must have `label` (string) and `keys` (string[]). Invalid items dropped silently. If 0 valid items remain, profile written as `source: "llm-failed"`.

---

## 8. Error Handling

| Scenario | Behaviour |
|---|---|
| `active-win` returns null (lock screen / desktop) | Emit null → send empty `CONTEXT_SHORTCUTS` → strip hides |
| App switches faster than debounce | Debounce resets — strip only reacts after 1.5s stable focus |
| Curated app, no AI credits | Skip generation silently; `source: "llm-failed"` written; strip stays hidden |
| Gemini returns invalid JSON | Same as no credits |
| `KeystrokeService` fails (app ignores keystroke) | Existing `ACTION_RESULT { success: false }` → mobile toast |
| Multiple mobile clients connected | All receive same `CONTEXT_SHORTCUTS` broadcast |
| Mobile reconnects mid-session | `WsGateway` re-sends current context profile on connect |
| User deletes single shortcut from LLM profile | Entry removed from JSON; `source` stays `"llm"` |
| iOS app backgrounded | WebSocket may drop; strip state stale until reconnect which re-pushes context |

---

## 9. Component Breakdown Summary

### Agent — new files
| File | Responsibility |
|---|---|
| `src/active-window/active-window.service.ts` | Poll active-win, debounce, emit appChanged |
| `src/context-profile/context-profile.service.ts` | Cache, Gemini generation, CRUD for shortcuts |
| `src/context-profile/context.module.ts` | NestJS module wiring |

### Agent — changed files
| File | Change |
|---|---|
| `src/websocket/ws.gateway.ts` | Subscribe to appChanged; handle ADD/REMOVE_CONTEXT_SHORTCUT/GET_CONTEXT_PROFILES; push on connect |
| `src/keystroke/keystroke.service.ts` | Implement using @nut-tree/nut-js (currently stubbed) |
| `src/app.module.ts` | Import ContextModule |

### Mobile — new files
| File | Responsibility |
|---|---|
| `src/components/ContextStrip.tsx` | Animated strip, horizontal FlatList, dismiss, "+" tile |
| `src/screens/ContextShortcutsScreen.tsx` | Full profile management UI |

### Mobile — changed files
| File | Change |
|---|---|
| `src/services/websocket.service.ts` | Handle CONTEXT_SHORTCUTS, ADD_CONTEXT_SHORTCUT ack |
| `src/screens/DeckScreen.tsx` | Render ContextStrip conditionally |
| `src/types/schema.ts` | Add new message types |

### Shared
| File | Change |
|---|---|
| `packages/shared/src/schema.ts` | Add ContextShortcut, ContextShortcutsMessage, AddContextShortcutMessage, RemoveContextShortcutMessage |

---

## 10. Out of Scope

- Reading shortcuts from app config files (VS Code `keybindings.json` etc.) — deferred
- OBS WebSocket native integration (separate spec) — deferred
- Drag-to-reorder shortcuts within a profile
- Per-profile "regenerate" button (force re-call Gemini)
- Syncing context profiles to Supabase (local-only for now)
- macOS process name mapping (macOS uses bundle IDs not `.exe` — handled in `CURATED_APPS` with separate entries)
