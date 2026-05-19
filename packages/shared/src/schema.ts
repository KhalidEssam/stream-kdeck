// Mobile → Agent
export interface ButtonTapMessage {
  type: 'BUTTON_TAP';
  buttonId: string;
  action: ButtonAction;
}

export type ButtonAction =
  | { kind: 'AI_CLIPBOARD'; prompt: string; outputMode: 'clipboard' | 'autopaste' | 'viewer' }
  | { kind: 'KEYSTROKE'; keys: string[] }
  | { kind: 'APP_LAUNCH'; appId: string }
  | { kind: 'URL_OPEN'; url: string }
  | { kind: 'CLIPBOARD_WRITE'; text: string }
  | { kind: 'EXEC'; exePath: string };

// Agent → Mobile
export interface ActionResultMessage {
  type: 'ACTION_RESULT';
  buttonId: string;
  success: boolean;
  output?: string;
  error?: string;
}

export interface ConnectedMessage {
  type: 'CONNECTED';
  agentVersion: string;
  platform: 'darwin' | 'win32' | 'linux';
}

export interface TileConfig {
  id: string;
  kind: 'app' | 'url' | 'ai' | 'shortcut' | 'custom';
  label: string;
  iconId: string;
  color?: string;
  iconBase64?: string;
  pinned?: boolean;
  action: ButtonAction;
}

export interface DeckConfigMessage {
  type: 'DECK_CONFIG';
  tiles: TileConfig[];
}

export interface AddTileMessage {
  type: 'ADD_TILE';
  tile: Omit<TileConfig, 'id'>;
}

export interface RemoveTileMessage {
  type: 'REMOVE_TILE';
  tileId: string;
}

export interface SetTilePinnedMessage {
  type: 'SET_TILE_PINNED';
  tileId: string;
  pinned: boolean;
}

// Custom launcher messages
export interface AppSearchResult {
  name: string;
  exePath: string;
  source: 'startmenu' | 'windows' | 'filesystem' | 'steam' | 'epic';
  iconBase64?: string;
}

export interface SearchAppsMessage {
  type: 'SEARCH_APPS';
  query: string;
}

export interface ValidatePathMessage {
  type: 'VALIDATE_PATH';
  exePath: string;
}

export interface SearchAppsResultMessage {
  type: 'SEARCH_APPS_RESULT';
  results: AppSearchResult[];
}

export interface ValidatePathResultMessage {
  type: 'VALIDATE_PATH_RESULT';
  valid: boolean;
  label?: string;
  iconBase64?: string;
  error?: string;
}

// --- Licensing messages ---

export interface LicenseStatusMessage {
  type: 'LICENSE_STATUS';
  licensed: boolean;
  aiPro: boolean;
  creditsRemaining: number;
  creditQuota: number;
}

export interface AiQuotaExceededMessage {
  type: 'AI_QUOTA_EXCEEDED';
  reason: 'credits_exhausted';
}

export interface OpenActivationDialogMessage {
  type: 'OPEN_ACTIVATION_DIALOG';
}

export interface GetLicenseStatusMessage {
  type: 'GET_LICENSE_STATUS';
}

// --- Context-aware deck messages ---

export interface ContextShortcut {
  id: string;
  label: string;
  keys: string[];
  description: string;
}

export interface ContextShortcutsMessage {
  type: 'CONTEXT_SHORTCUTS';
  processName: string;   // OS process name, e.g. "Discord.exe" — needed to key ADD_CONTEXT_SHORTCUT
  appLabel: string;
  iconId: string;
  shortcuts: ContextShortcut[];
}

export interface AddContextShortcutMessage {
  type: 'ADD_CONTEXT_SHORTCUT';
  processName: string;
  appLabel: string;
  iconId: string;
  shortcut: Omit<ContextShortcut, 'id'>;
}

export interface RemoveContextShortcutMessage {
  type: 'REMOVE_CONTEXT_SHORTCUT';
  processName: string;
  shortcutId: string;
}

export interface GetContextProfilesMessage {
  type: 'GET_CONTEXT_PROFILES';
}

export interface ContextProfileSummary {
  processName: string;
  appLabel: string;
  iconId: string;
  source: 'llm' | 'user' | 'llm-failed' | 'llm-quota';
  shortcutCount: number;
  shortcuts: ContextShortcut[];  // full list — needed by ContextShortcutsScreen detail view
}

export interface ContextProfilesMessage {
  type: 'CONTEXT_PROFILES';
  profiles: ContextProfileSummary[];
}

// --- Trackpad / mouse messages ---

export interface MouseMoveMessage {
  type: 'MOUSE_MOVE';
  dx: number;  // pixel delta, sensitivity already applied on mobile
  dy: number;
}

export interface MouseClickMessage {
  type: 'MOUSE_CLICK';
  button: 'left' | 'right' | 'middle';
  action: 'click' | 'down' | 'up';
}

export interface MouseScrollMessage {
  type: 'MOUSE_SCROLL';
  dx: number;
  dy: number;
}

export type AgentMessage =
  | ActionResultMessage
  | ConnectedMessage
  | DeckConfigMessage
  | SearchAppsResultMessage
  | ValidatePathResultMessage
  | LicenseStatusMessage
  | AiQuotaExceededMessage
  | ContextShortcutsMessage
  | ContextProfilesMessage;

export type MobileMessage =
  | ButtonTapMessage
  | AddTileMessage
  | RemoveTileMessage
  | SetTilePinnedMessage
  | SearchAppsMessage
  | ValidatePathMessage
  | OpenActivationDialogMessage
  | GetLicenseStatusMessage
  | AddContextShortcutMessage
  | RemoveContextShortcutMessage
  | GetContextProfilesMessage
  | MouseMoveMessage
  | MouseClickMessage
  | MouseScrollMessage;
