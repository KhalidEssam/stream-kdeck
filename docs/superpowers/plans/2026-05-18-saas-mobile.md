# SaaS Licensing — Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase Auth login/signup, a license gate screen shown when the agent reports `licensed: false`, credit counter badges on AI tiles, and an upsell bottom sheet when a user taps an AI tile with 0 credits.

**Architecture:** `AuthScreen` handles Supabase Auth sign-in before the WebSocket connects. `LicenseGateScreen` is shown inside `DeckScreen` when the agent sends `LICENSE_STATUS { licensed: false }`. `WebSocketService` gains `onLicenseStatus` and `openActivationDialog` methods. `AppTile` shows a small credit counter badge on AI tiles; at 0 credits a bottom sheet offers the AI Pro upsell instead of firing the action.

**Tech Stack:** Expo 54, React Native 0.81, `@supabase/supabase-js`, TypeScript

**Run tests with:** `cd apps/mobile && npx jest`

**Context:** Spec at `docs/superpowers/specs/2026-05-18-saas-licensing-design.md`. Requires the agent-side `LICENSE_STATUS` and `AI_QUOTA_EXCEEDED` messages from the agent plan. Schema types from Backend Plan Task B1 must already be committed to `apps/mobile/src/types/schema.ts`.

---

### Task M1: Install @supabase/supabase-js and create the Supabase client

**Files:**
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/src/lib/supabase.ts`

- [ ] **Step 1: Install the package**

```bash
cd apps/mobile && npm install @supabase/supabase-js
```

Expected: `@supabase/supabase-js` in `apps/mobile/package.json` dependencies.

- [ ] **Step 2: Create the singleton Supabase client**

Create `apps/mobile/src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = 'https://<your-project-ref>.supabase.co';
const SUPABASE_ANON_KEY = '<your-anon-key>';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

Replace the placeholder values with your project's URL and anon key from the Supabase dashboard → Project Settings → API.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json apps/mobile/src/lib/supabase.ts
git commit -m "feat: add @supabase/supabase-js and singleton client to mobile app"
```

---

### Task M2: AuthScreen

**Files:**
- Create: `apps/mobile/src/screens/AuthScreen.tsx`

No TDD — this is a UI screen. Verified manually by running the app.

- [ ] **Step 1: Create the screen**

Create `apps/mobile/src/screens/AuthScreen.tsx`:

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../lib/supabase';

interface Props {
  onAuthenticated: () => void;
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode]         = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [info, setInfo]         = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) { setError(err.message); return; }
        onAuthenticated();
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) { setError(err.message); return; }
        setInfo('Check your email to confirm your account, then sign in.');
        setMode('signin');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.logo}>Control Surface</Text>
        <Text style={styles.tagline}>
          {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#555"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#555"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error && <Text style={styles.error}>{error}</Text>}
        {info  && <Text style={styles.info}>{info}</Text>}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchMode}
          onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null); }}
          activeOpacity={0.7}
        >
          <Text style={styles.switchModeText}>
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#0F0F14' },
  inner:           { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logo:            { color: '#FFFFFF', fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  tagline:         { color: '#6B6B8A', fontSize: 14, textAlign: 'center', marginBottom: 32 },
  input: {
    backgroundColor:  '#1A1A2E',
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.1)',
    borderRadius:     10,
    paddingHorizontal: 14,
    paddingVertical:  12,
    color:            '#FFFFFF',
    fontSize:         15,
    marginBottom:     12,
  },
  error:          { color: '#FF6B6B', fontSize: 13, marginBottom: 10, textAlign: 'center' },
  info:           { color: '#44FF88', fontSize: 13, marginBottom: 10, textAlign: 'center' },
  button: {
    backgroundColor: '#5B4FE8',
    borderRadius:    10,
    paddingVertical: 14,
    alignItems:      'center',
    marginTop:       4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  switchMode:     { marginTop: 20, alignItems: 'center' },
  switchModeText: { color: '#6B6B8A', fontSize: 13 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/AuthScreen.tsx
git commit -m "feat: add AuthScreen with Supabase Auth email/password login and signup"
```

---

### Task M3: LicenseGateScreen

**Files:**
- Create: `apps/mobile/src/screens/LicenseGateScreen.tsx`

Shown when the agent sends `LICENSE_STATUS { licensed: false }`. Has a "Buy License" button (opens website) and an "Activate on Desktop" button (sends `OPEN_ACTIVATION_DIALOG` to the agent).

- [ ] **Step 1: Create the screen**

Create `apps/mobile/src/screens/LicenseGateScreen.tsx`:

```typescript
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  StyleSheet,
  SafeAreaView,
} from 'react-native';

interface Props {
  onRequestActivation: () => void;
}

const PURCHASE_URL = 'https://<your-website-url>/buy';

export function LicenseGateScreen({ onRequestActivation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>License Required</Text>
        <Text style={styles.body}>
          Control Surface requires a Desktop License ($19 one-time) to unlock the full
          experience including AI tools, keyboard shortcuts, and app launcher.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => Linking.openURL(PURCHASE_URL)}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>Buy License — $19</Text>
        </TouchableOpacity>

        <Text style={styles.divider}>Already purchased?</Text>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onRequestActivation}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>Activate on Desktop</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Tap "Activate on Desktop" to open the activation dialog on your PC, then
          enter your license key.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0F0F14' },
  inner: {
    flex:              1,
    justifyContent:    'center',
    alignItems:        'center',
    paddingHorizontal: 32,
  },
  icon:  { fontSize: 48, marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  body:  {
    color:         '#888',
    fontSize:      14,
    lineHeight:    22,
    textAlign:     'center',
    marginBottom:  32,
  },
  primaryButton: {
    backgroundColor: '#5B4FE8',
    borderRadius:    12,
    paddingVertical: 15,
    paddingHorizontal: 32,
    width:           '100%',
    alignItems:      'center',
    marginBottom:    20,
  },
  primaryButtonText:   { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  divider:             { color: '#555', fontSize: 13, marginBottom: 16 },
  secondaryButton: {
    borderWidth:     1,
    borderColor:     'rgba(91,79,232,0.5)',
    borderRadius:    12,
    paddingVertical: 13,
    paddingHorizontal: 32,
    width:           '100%',
    alignItems:      'center',
    marginBottom:    16,
  },
  secondaryButtonText: { color: '#5B4FE8', fontSize: 15, fontWeight: '600' },
  hint: { color: '#444', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/LicenseGateScreen.tsx
git commit -m "feat: add LicenseGateScreen with buy link and activate-on-desktop button"
```

---

### Task M4: WebSocketService updates — onLicenseStatus and openActivationDialog

**Files:**
- Modify: `apps/mobile/src/services/websocket.service.ts`
- Create: `apps/mobile/tests/websocket.service.test.ts` (if not already present — check first)

- [ ] **Step 1: Write the failing tests**

Check if `apps/mobile/tests/websocket.service.test.ts` exists. If not, create it:

```typescript
import WS from 'jest-websocket-mock';
import { WebSocketService } from '../src/services/websocket.service';

describe('WebSocketService — license messages', () => {
  let server: WS;
  let service: WebSocketService;

  beforeEach(async () => {
    server = new WS('ws://localhost:9999');
    service = new WebSocketService('ws://localhost:9999');
    await server.connected;
    // Drain the first "connected" state
  });

  afterEach(() => {
    service.disconnect();
    WS.clean();
  });

  it('fires onLicenseStatus callback when LICENSE_STATUS message is received', async () => {
    const cb = jest.fn();
    service.onLicenseStatus(cb);

    server.send(JSON.stringify({
      type: 'LICENSE_STATUS',
      licensed: true,
      aiPro: false,
      creditsRemaining: 42,
    }));

    await new Promise((r) => setTimeout(r, 10));

    expect(cb).toHaveBeenCalledWith({
      type: 'LICENSE_STATUS',
      licensed: true,
      aiPro: false,
      creditsRemaining: 42,
    });
  });

  it('sends OPEN_ACTIVATION_DIALOG when openActivationDialog is called', async () => {
    service.openActivationDialog();
    await expect(server).toReceiveMessage(
      JSON.stringify({ type: 'OPEN_ACTIVATION_DIALOG' }),
    );
  });

  it('sends GET_LICENSE_STATUS when requestLicenseStatus is called', async () => {
    service.requestLicenseStatus();
    await expect(server).toReceiveMessage(
      JSON.stringify({ type: 'GET_LICENSE_STATUS' }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/mobile && npx jest websocket.service
```

Expected: FAIL — `onLicenseStatus is not a function`.

- [ ] **Step 3: Update WebSocketService**

Replace `apps/mobile/src/services/websocket.service.ts`:

```typescript
import {
  AgentMessage,
  ButtonAction,
  ButtonTapMessage,
  ActionResultMessage,
  DeckConfigMessage,
  TileConfig,
  AddTileMessage,
  RemoveTileMessage,
  SetTilePinnedMessage,
  SearchAppsMessage,
  ValidatePathMessage,
  SearchAppsResultMessage,
  ValidatePathResultMessage,
  LicenseStatusMessage,
  OpenActivationDialogMessage,
  GetLicenseStatusMessage,
} from '../types/schema';

type Status = 'connecting' | 'connected' | 'disconnected';
type StatusCallback = (status: Status) => void;
type ResultCallback = (msg: ActionResultMessage) => void;
type DeckConfigCallback = (msg: DeckConfigMessage) => void;
type SearchAppsResultCallback = (msg: SearchAppsResultMessage) => void;
type ValidatePathResultCallback = (msg: ValidatePathResultMessage) => void;
type LicenseStatusCallback = (msg: LicenseStatusMessage) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private statusCallbacks: StatusCallback[] = [];
  private resultCallbacks: ResultCallback[] = [];
  private deckConfigCallbacks: DeckConfigCallback[] = [];
  private searchAppsCallbacks: SearchAppsResultCallback[] = [];
  private validatePathCallbacks: ValidatePathResultCallback[] = [];
  private licenseStatusCallbacks: LicenseStatusCallback[] = [];

  constructor(private readonly url: string) {
    this.connect();
  }

  private connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.notifyStatus('connecting');
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const msg: AgentMessage = JSON.parse(event.data as string);
      if (msg.type === 'CONNECTED') {
        this.notifyStatus('connected');
      } else if (msg.type === 'ACTION_RESULT') {
        this.resultCallbacks.forEach((cb) => cb(msg));
      } else if (msg.type === 'DECK_CONFIG') {
        this.deckConfigCallbacks.forEach((cb) => cb(msg));
      } else if (msg.type === 'SEARCH_APPS_RESULT') {
        this.searchAppsCallbacks.forEach((cb) => cb(msg));
      } else if (msg.type === 'VALIDATE_PATH_RESULT') {
        this.validatePathCallbacks.forEach((cb) => cb(msg));
      } else if (msg.type === 'LICENSE_STATUS') {
        this.licenseStatusCallbacks.forEach((cb) => cb(msg));
      }
    };

    this.ws.onclose = () => {
      this.notifyStatus('disconnected');
    };
  }

  tap(buttonId: string, action: ButtonAction): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: ButtonTapMessage = { type: 'BUTTON_TAP', buttonId, action };
    this.ws.send(JSON.stringify(msg));
  }

  addTile(tile: Omit<TileConfig, 'id'>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: AddTileMessage = { type: 'ADD_TILE', tile };
    this.ws.send(JSON.stringify(msg));
  }

  removeTile(tileId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: RemoveTileMessage = { type: 'REMOVE_TILE', tileId };
    this.ws.send(JSON.stringify(msg));
  }

  setTilePinned(tileId: string, pinned: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: SetTilePinnedMessage = { type: 'SET_TILE_PINNED', tileId, pinned };
    this.ws.send(JSON.stringify(msg));
  }

  searchApps(query: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: SearchAppsMessage = { type: 'SEARCH_APPS', query };
    this.ws.send(JSON.stringify(msg));
  }

  validatePath(exePath: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: ValidatePathMessage = { type: 'VALIDATE_PATH', exePath };
    this.ws.send(JSON.stringify(msg));
  }

  openActivationDialog(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: OpenActivationDialogMessage = { type: 'OPEN_ACTIVATION_DIALOG' };
    this.ws.send(JSON.stringify(msg));
  }

  requestLicenseStatus(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: GetLicenseStatusMessage = { type: 'GET_LICENSE_STATUS' };
    this.ws.send(JSON.stringify(msg));
  }

  onStatusChange(cb: StatusCallback): void {
    this.statusCallbacks.push(cb);
  }

  onResult(cb: ResultCallback): void {
    this.resultCallbacks.push(cb);
  }

  onDeckConfig(cb: DeckConfigCallback): void {
    this.deckConfigCallbacks.push(cb);
  }

  onLicenseStatus(cb: LicenseStatusCallback): () => void {
    this.licenseStatusCallbacks.push(cb);
    return () => {
      this.licenseStatusCallbacks = this.licenseStatusCallbacks.filter((c) => c !== cb);
    };
  }

  onSearchAppsResult(cb: SearchAppsResultCallback): () => void {
    this.searchAppsCallbacks.push(cb);
    return () => {
      this.searchAppsCallbacks = this.searchAppsCallbacks.filter((c) => c !== cb);
    };
  }

  onValidatePathResult(cb: ValidatePathResultCallback): () => void {
    this.validatePathCallbacks.push(cb);
    return () => {
      this.validatePathCallbacks = this.validatePathCallbacks.filter((c) => c !== cb);
    };
  }

  reconnect(): void {
    this.disconnect();
    this.notifyStatus('connecting');
    this.connect();
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private notifyStatus(status: Status): void {
    this.statusCallbacks.forEach((cb) => cb(status));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/mobile && npx jest websocket.service
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/websocket.service.ts apps/mobile/tests/websocket.service.test.ts
git commit -m "feat: add onLicenseStatus, openActivationDialog, requestLicenseStatus to WebSocketService"
```

---

### Task M5: DeckScreen updates — AuthScreen gate + LicenseGateScreen

**Files:**
- Modify: `apps/mobile/src/screens/DeckScreen.tsx`

`DeckScreen` now:
1. Checks Supabase Auth session on mount — shows `AuthScreen` if not signed in
2. Listens for `LICENSE_STATUS` from the agent — shows `LicenseGateScreen` if `licensed: false`
3. Passes `creditsRemaining` down to the tile grid (for the badge in Task M6)

- [ ] **Step 1: Update DeckScreen**

Replace `apps/mobile/src/screens/DeckScreen.tsx` with:

```typescript
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  FlatList,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { AppTile } from '../components/AppTile';
import { AddTileScreen } from './AddTileScreen';
import { AuthScreen } from './AuthScreen';
import { LicenseGateScreen } from './LicenseGateScreen';
import { WebSocketService } from '../services/websocket.service';
import { TileConfig } from '../types/schema';
import { supabase } from '../lib/supabase';

const AGENT_URL   = 'ws://192.168.1.5:3001';
const UPGRADE_URL = 'https://<your-website-url>/upgrade';

type DeckTab = 'ai' | 'apps' | 'shortcuts';

const DECK_TABS: Array<{ key: DeckTab; label: string }> = [
  { key: 'ai',        label: 'AI Tools' },
  { key: 'apps',      label: 'Apps' },
  { key: 'shortcuts', label: 'Shortcuts' },
];

export function DeckScreen() {
  const [authenticated, setAuthenticated]   = useState<boolean | null>(null); // null = checking
  const [licensed, setLicensed]             = useState<boolean | null>(null); // null = waiting for agent
  const [creditsRemaining, setCreditsRemaining] = useState(0);

  const [status, setStatus]         = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [tiles, setTiles]           = useState<TileConfig[] | null>(null);
  const [activeTab, setActiveTab]   = useState<DeckTab>('ai');
  const [loadingId, setLoadingId]   = useState<string | null>(null);
  const [viewerText, setViewerText] = useState<string | null>(null);
  const [showAddTile, setShowAddTile] = useState(false);
  const [actionTile, setActionTile] = useState<TileConfig | null>(null);
  const [showUpsell, setShowUpsell] = useState(false);

  const [wsService, setWsService] = useState<WebSocketService | null>(null);
  const wsRef = useRef<WebSocketService | null>(null);

  // Check Supabase Auth session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Connect WebSocket only when authenticated
  useEffect(() => {
    if (!authenticated) return;

    const ws = new WebSocketService(AGENT_URL);
    wsRef.current = ws;
    setWsService(ws);

    ws.onStatusChange(setStatus);

    ws.onResult((result) => {
      setLoadingId(null);
      if (result.output) setViewerText(result.output);
    });

    ws.onDeckConfig((msg) => {
      setTiles(msg.tiles);
    });

    const unsubLicense = ws.onLicenseStatus((msg) => {
      setLicensed(msg.licensed);
      setCreditsRemaining(msg.creditsRemaining);
    });

    return () => {
      unsubLicense();
      ws.disconnect();
      wsRef.current = null;
      setWsService(null);
    };
  }, [authenticated]);

  const handleRefresh = () => {
    setLoadingId(null);
    setViewerText(null);
    setTiles(null);
    setLicensed(null);
    wsRef.current?.reconnect();
  };

  const handleTap = (tile: TileConfig) => {
    if (status !== 'connected') return;
    if (tile.action.kind === 'AI_CLIPBOARD' && creditsRemaining <= 0) {
      setShowUpsell(true);
      return;
    }
    setLoadingId(tile.id);
    wsRef.current?.tap(tile.id, tile.action);
  };

  const handleAddTile    = (tile: Omit<TileConfig, 'id'>) => { wsRef.current?.addTile(tile); };
  const handleRemoveTile = (tileId: string)                => { wsRef.current?.removeTile(tileId); };

  const handleRequestTileActions = (tile: TileConfig) => { setActionTile(tile); };

  const handleTogglePinned = () => {
    if (!actionTile || actionTile.id.startsWith('builtin-')) return;
    wsRef.current?.setTilePinned(actionTile.id, !actionTile.pinned);
    setActionTile(null);
  };

  const handleConfirmRemoveTile = () => {
    if (!actionTile || actionTile.id.startsWith('builtin-')) return;
    handleRemoveTile(actionTile.id);
    setActionTile(null);
  };

  const handleRequestActivation = () => {
    wsRef.current?.openActivationDialog();
  };

  // Auth loading
  if (authenticated === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerFill}>
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Not authenticated — show login
  if (!authenticated) {
    return <AuthScreen onAuthenticated={() => setAuthenticated(true)} />;
  }

  // Waiting for LICENSE_STATUS from agent
  if (licensed === null && status === 'connected') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerFill}>
          <Text style={styles.loadingText}>Checking license…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Not licensed — show gate
  if (licensed === false) {
    return <LicenseGateScreen onRequestActivation={handleRequestActivation} />;
  }

  const statusColor = status === 'connected' ? '#44FF88' : status === 'connecting' ? '#FFB800' : '#FF4444';
  const statusLabel = { connecting: 'Connecting…', connected: 'Connected', disconnected: 'Disconnected' }[status];

  const tabCounts = useMemo(() => {
    const counts: Record<DeckTab, number> = { ai: 0, apps: 0, shortcuts: 0 };
    for (const tile of tiles ?? []) {
      if (tile.kind === 'ai') counts.ai += 1;
      else if (tile.kind === 'shortcut') counts.shortcuts += 1;
      else counts.apps += 1;
    }
    return counts;
  }, [tiles]);

  const visibleTiles = useMemo(() => {
    return (tiles ?? []).filter((tile) => {
      if (activeTab === 'ai')        return tile.kind === 'ai';
      if (activeTab === 'shortcuts') return tile.kind === 'shortcut';
      return tile.kind !== 'ai' && tile.kind !== 'shortcut';
    });
  }, [activeTab, tiles]);

  const emptyCopy =
    activeTab === 'ai'
      ? { title: 'No AI tools yet.',    hint: 'Reconnect to load the built-in tools.' }
      : activeTab === 'apps'
        ? { title: 'No apps yet.',      hint: 'Tap + to add apps, games, or URLs.' }
        : { title: 'No shortcuts yet.', hint: 'Tap + to add keyboard shortcuts.' };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      <View style={styles.header}>
        <Text style={styles.title}>Control Surface</Text>
        <TouchableOpacity style={styles.statusBadge} onPress={handleRefresh} activeOpacity={0.7}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          <Text style={styles.refreshIcon}>↺</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {DECK_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]} numberOfLines={1}>
                {tab.label}
              </Text>
              <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>
                {tabCounts[tab.key]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {viewerText !== null && (
        <View style={styles.viewer}>
          <ScrollView style={styles.viewerScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.viewerText} selectable>{viewerText}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.viewerDismiss} onPress={() => setViewerText(null)}>
            <Text style={styles.viewerDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {tiles === null ? (
        <View style={styles.skeletonGrid}>
          {Array.from({ length: 6 }).map((_, i) => <View key={i} style={styles.skeletonTile} />)}
        </View>
      ) : visibleTiles.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{emptyCopy.title}</Text>
          <Text style={styles.emptyHint}>{emptyCopy.hint}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleTiles}
          keyExtractor={(item) => item.id}
          numColumns={3}
          renderItem={({ item }) => (
            <AppTile
              tile={item}
              isLoading={item.id === loadingId}
              creditsRemaining={creditsRemaining}
              onTap={handleTap}
              onLongPress={handleRequestTileActions}
            />
          )}
          contentContainerStyle={styles.grid}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowAddTile(true)} activeOpacity={0.8}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal
        visible={showAddTile}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddTile(false)}
      >
        {wsService && (
          <AddTileScreen
            currentTiles={tiles ?? []}
            onAdd={handleAddTile}
            onRemove={handleRemoveTile}
            onDismiss={() => setShowAddTile(false)}
            ws={wsService}
          />
        )}
      </Modal>

      <Modal
        visible={actionTile !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setActionTile(null)}
      >
        <View style={styles.actionsBackdrop}>
          <View style={styles.actionsDialog}>
            <Text style={styles.actionsTitle}>Tile Options</Text>
            <Text style={styles.actionsBody} numberOfLines={2}>{actionTile?.label}</Text>
            {actionTile?.id.startsWith('builtin-') && (
              <Text style={styles.actionsHint}>Built-in tiles stay fixed.</Text>
            )}
            <View style={styles.actionsList}>
              {!actionTile?.id.startsWith('builtin-') && (
                <TouchableOpacity style={styles.optionButton} onPress={handleTogglePinned} activeOpacity={0.75}>
                  <Text style={styles.optionButtonText}>
                    {actionTile?.pinned ? 'Unpin from Top' : 'Pin to Top'}
                  </Text>
                </TouchableOpacity>
              )}
              {!actionTile?.id.startsWith('builtin-') && (
                <TouchableOpacity
                  style={[styles.optionButton, styles.dangerOptionButton]}
                  onPress={handleConfirmRemoveTile}
                  activeOpacity={0.75}
                >
                  <Text style={styles.optionButtonText}>Remove Tile</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.actionsFooter}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setActionTile(null)} activeOpacity={0.75}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* AI Pro upsell bottom sheet */}
      <Modal
        visible={showUpsell}
        animationType="slide"
        transparent
        onRequestClose={() => setShowUpsell(false)}
      >
        <View style={styles.upsellBackdrop}>
          <View style={styles.upsellSheet}>
            <Text style={styles.upsellTitle}>Credits Exhausted</Text>
            <Text style={styles.upsellBody}>
              You've used all your AI credits for this month. Upgrade to AI Pro for 500
              credits/month ($8/mo or $59/yr).
            </Text>
            <TouchableOpacity
              style={styles.upsellButton}
              onPress={() => {
                setShowUpsell(false);
                Linking.openURL(UPGRADE_URL);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.upsellButtonText}>Upgrade to AI Pro</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.upsellDismiss} onPress={() => setShowUpsell(false)} activeOpacity={0.7}>
              <Text style={styles.upsellDismissText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0F0F14' },
  centerFill:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText:    { color: '#6B6B8A', fontSize: 14 },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  title:          { color: '#FFFFFF', fontSize: 18, fontWeight: '700', flex: 1 },
  statusBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
  statusDot:      { width: 8, height: 8, borderRadius: 4 },
  statusText:     { fontSize: 12, fontWeight: '600' },
  refreshIcon:    { color: '#6B6B8A', fontSize: 16, marginLeft: 2 },
  tabBar:         { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  tab:            { flex: 1, minHeight: 46, borderRadius: 8, backgroundColor: '#1A1A2E', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tabActive:      { backgroundColor: '#5B4FE8', borderColor: '#7A70FF' },
  tabText:        { color: '#8A8AAA', fontSize: 12, fontWeight: '700' },
  tabTextActive:  { color: '#FFFFFF' },
  tabCount:       { color: '#6B6B8A', fontSize: 11, fontWeight: '700', marginTop: 2 },
  tabCountActive: { color: 'rgba(255,255,255,0.78)' },
  grid:           { padding: 8, paddingBottom: 80 },
  skeletonGrid:   { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  skeletonTile:   { flex: 1, margin: 5, aspectRatio: 1, minWidth: '30%', maxWidth: '32%', backgroundColor: '#1E1E2E', borderRadius: 14, opacity: 0.4 },
  emptyState:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText:      { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  emptyHint:      { color: '#6B6B8A', fontSize: 13 },
  viewer:         { margin: 12, maxHeight: 200, backgroundColor: '#1A1A2E', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  viewerScroll:   { padding: 14 },
  viewerText:     { color: '#E0E0E0', fontSize: 14, lineHeight: 22 },
  viewerDismiss:  { padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', alignItems: 'center' },
  viewerDismissText: { color: '#6B6B8A', fontSize: 13, fontWeight: '600' },
  fab:            { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#5B4FE8', alignItems: 'center', justifyContent: 'center', shadowColor: '#5B4FE8', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  fabText:        { color: '#FFFFFF', fontSize: 28, fontWeight: '300', lineHeight: 32 },
  actionsBackdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  actionsDialog:      { width: '100%', maxWidth: 340, backgroundColor: '#1A1A2E', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 18 },
  actionsTitle:       { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  actionsBody:        { color: '#AAAACC', fontSize: 14, marginTop: 8 },
  actionsHint:        { color: '#6B6B8A', fontSize: 12, marginTop: 8 },
  actionsList:        { gap: 10, marginTop: 18 },
  optionButton:       { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#5B4FE8' },
  dangerOptionButton: { backgroundColor: '#5A2731' },
  optionButtonText:   { color: '#FFFFFF', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  actionsFooter:      { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  cancelButton:       { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#2A2A3A' },
  cancelButtonText:   { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  upsellBackdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  upsellSheet:        { backgroundColor: '#1A1A2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 28, paddingBottom: 40 },
  upsellTitle:        { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 10 },
  upsellBody:         { color: '#888', fontSize: 14, lineHeight: 22, marginBottom: 24 },
  upsellButton:       { backgroundColor: '#5B4FE8', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  upsellButtonText:   { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  upsellDismiss:      { alignItems: 'center', paddingVertical: 8 },
  upsellDismissText:  { color: '#555', fontSize: 14 },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/DeckScreen.tsx
git commit -m "feat: add Supabase auth gate, LicenseGateScreen, and AI upsell bottom sheet to DeckScreen"
```

---

### Task M6: AppTile — credit counter badge on AI tiles

**Files:**
- Modify: `apps/mobile/src/components/AppTile.tsx`

AI tiles now receive a `creditsRemaining` prop and show a small badge. When credits > 0, the badge shows the count. At 0, the badge shows "0" in red. The `DeckScreen` already intercepts taps at 0 credits before reaching `onTap`, so `AppTile` only needs the visual badge.

- [ ] **Step 1: Update AppTile to accept and display creditsRemaining**

Add `creditsRemaining?: number` to the `Props` interface and add a credit badge for AI tiles.

In `apps/mobile/src/components/AppTile.tsx`:

**Update the Props interface** (find and replace):
```typescript
interface Props {
  tile: TileConfig;
  isLoading?: boolean;
  isSelected?: boolean;
  creditsRemaining?: number;
  onTap: (tile: TileConfig) => void;
  onLongPress?: (tile: TileConfig) => void;
}
```

**Update the function signature** (find and replace):
```typescript
export function AppTile({ tile, isLoading, isSelected, creditsRemaining, onTap, onLongPress }: Props) {
```

**Add the credit badge after the existing `aiBadge` view** — find this block:
```typescript
        {/* AI badge */}
        {tile.kind === 'ai' && (
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>✦</Text>
          </View>
        )}
```

Replace it with:
```typescript
        {/* AI badge + credit counter */}
        {tile.kind === 'ai' && creditsRemaining !== undefined && (
          <View style={styles.creditBadge}>
            <Text style={[
              styles.creditBadgeText,
              creditsRemaining === 0 && styles.creditBadgeEmpty,
            ]}>
              {creditsRemaining}
            </Text>
          </View>
        )}
        {tile.kind === 'ai' && creditsRemaining === undefined && (
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>✦</Text>
          </View>
        )}
```

**Add the two new style entries** at the end of the `StyleSheet.create` call (before the closing `}`):
```typescript
  creditBadge: {
    position:        'absolute',
    top:             5,
    right:           5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius:    8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth:        20,
    alignItems:      'center',
  },
  creditBadgeText:  { color: '#AAAACC', fontSize: 9, fontWeight: '800' },
  creditBadgeEmpty: { color: '#FF6B6B' },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all mobile tests**

```bash
cd apps/mobile && npx jest
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/AppTile.tsx
git commit -m "feat: add credit counter badge to AI tiles in AppTile"
```
