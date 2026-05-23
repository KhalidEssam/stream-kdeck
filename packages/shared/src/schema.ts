// Mobile → Agent
export interface ButtonTapMessage {
  type: 'BUTTON_TAP';
  buttonId: string;
  action: ButtonAction;
}

export type ButtonAction =
  | { kind: 'AI_CLIPBOARD'; prompt: string; outputMode: 'clipboard' | 'autopaste' | 'viewer'; toolId?: string }
  | { kind: 'KEYSTROKE'; keys: string[] }
  | { kind: 'APP_LAUNCH'; appId: string }
  | { kind: 'URL_OPEN'; url: string }
  | { kind: 'CLIPBOARD_WRITE'; text: string }
  | { kind: 'EXEC'; exePath: string }
  | { kind: 'SHELL_RUN'; command: string; outputMode: 'clipboard' | 'autopaste' | 'viewer' | 'silent'; toolId?: string }
  | { kind: 'WORKFLOW'; steps: WorkflowStep[]; stopOnError: boolean }
  | { kind: 'INTEGRATION_ACTION'; pluginId: string; toolId: string; actionId: string; params: Record<string, unknown> };

// WorkflowStepAction excludes AI_CLIPBOARD (no credit charges) and WORKFLOW (no nesting)
export type WorkflowStepAction = Exclude<ButtonAction, { kind: 'AI_CLIPBOARD' | 'WORKFLOW' }>;

export interface WorkflowStep {
  id: string;           // crypto.randomUUID() on creation — used as React key + DraggableFlatList key
  action: WorkflowStepAction;
  delayBefore: number;  // milliseconds; 0 = no delay; max 10000
  label: string;        // human-readable summary, e.g. "Launch VS Code"
}

// Pack catalog types (Agent → Mobile via PACK_REGISTRY)
export type PackTool =
  | {
      kind: 'ai';
      id: string;
      packId: string;
      label: string;
      prompt: string;
      outputMode: 'clipboard' | 'autopaste' | 'viewer';
      source: 'clipboard' | 'active_window' | 'shell';
      icon: string;
      color?: string;
      order: number;
      phase: number;
      builtinId?: string;
    }
  | {
      kind: 'command';
      id: string;
      packId: string;
      label: string;
      command: string;
      outputMode: 'viewer' | 'silent';
      icon: string;
      color?: string;
      order: number;
      phase: number;
      builtinId?: string;
    };

export interface Pack {
  id: string;
  slug: string;
  name: string;
  description?: string;
  icon: string;
  color?: string;
  order: number;
  category?: PackCategory;
  tools: PackTool[];
}

export type PackCategory = 'streamer' | 'media' | 'productivity' | 'developer' | 'writing' | 'learning' | 'other';

export interface PackRegistryMessage {
  type: 'PACK_REGISTRY';
  packs: Pack[];
}

// --- Integration plugin types ---

export type ConnectorType = 'oauth2' | 'api-key' | 'local-websocket' | 'local-http' | 'mdns-discovery' | 'none';
export type PluginStatus = 'draft' | 'internal' | 'beta' | 'published' | 'deprecated' | 'disabled';
export type ExecutionMode = 'agent' | 'mobile' | 'cloud';

export interface IntegrationTool {
  id: string;
  pluginId: string;
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  actionId: string;
  executionMode: ExecutionMode;
  paramsSchema: Record<string, unknown>;
  supportsWorkflows: boolean;
  supportsState: boolean;
  requiresConfirmation: boolean;
  minAgentCapability: number;
  sortOrder: number;
  status: PluginStatus;
}

export interface IntegrationPlugin {
  id: string;
  slug: string;
  name: string;
  description?: string;
  category: string;
  icon: string;
  color?: string;
  publisher: string;
  version: string;
  status: PluginStatus;
  minAgentCapability: number;
  minMobileCapability: number;
  supportedPlatforms: string[];
  requiresConnector: boolean;
  connectorType?: ConnectorType;
  sortOrder: number;
  tools: IntegrationTool[];
}

// Mobile → Agent: plugin messages
export interface GetPluginCatalogMessage { type: 'GET_PLUGIN_CATALOG' }
export interface InstallPluginMessage    { type: 'INSTALL_PLUGIN';   pluginId: string }
export interface UninstallPluginMessage  { type: 'UNINSTALL_PLUGIN'; pluginId: string }

export interface SetPluginConnectionMessage {
  type:     'SET_PLUGIN_CONNECTION';
  pluginId: string;
  metadata: Record<string, unknown>;
}

export interface TestPluginConnectionMessage {
  type:     'TEST_PLUGIN_CONNECTION';
  pluginId: string;
}

// Agent → Mobile: plugin messages
export interface PluginCatalogMessage {
  type:    'PLUGIN_CATALOG';
  plugins: IntegrationPlugin[];
}

export interface InstalledPluginsMessage {
  type:               'INSTALLED_PLUGINS';
  installedPluginIds: string[];
}

export interface PluginInstallStatusMessage {
  type:     'PLUGIN_INSTALL_STATUS';
  pluginId: string;
  status:   'installed' | 'uninstalled' | 'error';
  error?:   string;
}

export interface PluginConnectionStatusMessage {
  type:     'PLUGIN_CONNECTION_STATUS';
  pluginId: string;
  status:   'not_configured' | 'connected' | 'error' | 'expired';
  error?:   string;
}

export interface IntegrationStateMessage {
  type:     'INTEGRATION_STATE';
  pluginId: string;
  states:   Array<{
    toolId?:   string;
    key:       string;
    value:     unknown;
    label?:    string;
    updatedAt: string;
  }>;
}

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
  userId?: string | null;
}

export interface TileConfig {
  id: string;
  kind: 'app' | 'url' | 'ai' | 'shortcut' | 'custom' | 'workflow' | 'integration';
  label: string;
  iconId: string;
  color?: string;
  iconBase64?: string;
  customIcon?: TileIconOverride;
  pinned?: boolean;
  action: ButtonAction;
}

export type TileIconOverride =
  | { kind: 'glyph'; value: string }
  | { kind: 'emoji'; value: string }
  | { kind: 'image'; uri: string };

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

export interface SetTileIconMessage {
  type: 'SET_TILE_ICON';
  tileId: string;
  customIcon?: TileIconOverride;
}

export interface ReorderTilesMessage {
  type: 'REORDER_TILES';
  tileIds: string[];
}

// Custom launcher messages
export interface AppSearchResult {
  name: string;
  exePath: string;
  processName?: string;
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

export interface RevalidateLicenseMessage {
  type: 'REVALIDATE_LICENSE';
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

// --- Media / Audio Session messages ---

export interface MediaSession {
  processName: string;
  label: string;
  iconBase64?: string;
  volume: number;        // 0–1
  muted: boolean;
  pinned: boolean;
  active: boolean;
}

export interface MediaStateMessage {
  type: 'MEDIA_STATE';
  sessions: MediaSession[];
  platform: 'win32' | 'darwin';
}

export interface GetMediaStateMessage {
  type: 'GET_MEDIA_STATE';
}

export interface MediaVolumeDeltaMessage {
  type: 'MEDIA_VOLUME_DELTA';
  processName: string;
  delta: number;
}

export interface MediaSetMuteMessage {
  type: 'MEDIA_SET_MUTE';
  processName: string;
  muted: boolean;
}

export interface MediaBringToFrontMessage {
  type: 'MEDIA_BRING_TO_FRONT';
  processName: string;
}

export interface MediaPinAppMessage {
  type: 'MEDIA_PIN_APP';
  processName: string;
  label: string;
  iconBase64?: string;
  pinned: boolean;
}

export interface MediaSetVolumeMessage {
  type: 'MEDIA_SET_VOLUME';
  processName: string;
  volume: number; // 0–1
}

// --- Context permission messages ---

export type ConsentScope = 'once' | 'session' | 'permanent';

// Agent → Mobile: request consent for a provider
export interface ContextPermissionRequestMessage {
  type: 'CONTEXT_PERMISSION_REQUEST';
  requestId: string;
  packId: string;
  providerId: string;
  providerLabel: string;
  reason: string;
  scopeOptions: ConsentScope[];
}

// Mobile → Agent: user's decision
export interface ContextPermissionResponseMessage {
  type: 'CONTEXT_PERMISSION_RESPONSE';
  requestId: string;
  granted: boolean;
  scope?: ConsentScope;
}

export type AgentMessage =
  | ActionResultMessage
  | ConnectedMessage
  | ContextPermissionRequestMessage
  | DeckConfigMessage
  | SearchAppsResultMessage
  | ValidatePathResultMessage
  | LicenseStatusMessage
  | AiQuotaExceededMessage
  | ContextShortcutsMessage
  | ContextProfilesMessage
  | PackRegistryMessage
  | MediaStateMessage
  | PluginCatalogMessage
  | InstalledPluginsMessage
  | PluginInstallStatusMessage
  | PluginConnectionStatusMessage
  | IntegrationStateMessage;

export type MobileMessage =
  | ButtonTapMessage
  | AddTileMessage
  | RemoveTileMessage
  | SetTilePinnedMessage
  | SetTileIconMessage
  | ReorderTilesMessage
  | SearchAppsMessage
  | ValidatePathMessage
  | OpenActivationDialogMessage
  | GetLicenseStatusMessage
  | RevalidateLicenseMessage
  | AddContextShortcutMessage
  | RemoveContextShortcutMessage
  | GetContextProfilesMessage
  | MouseMoveMessage
  | MouseClickMessage
  | MouseScrollMessage
  | MediaVolumeDeltaMessage
  | MediaSetMuteMessage
  | MediaBringToFrontMessage
  | MediaPinAppMessage
  | MediaSetVolumeMessage
  | GetMediaStateMessage
  | GetPluginCatalogMessage
  | InstallPluginMessage
  | UninstallPluginMessage
  | SetPluginConnectionMessage
  | TestPluginConnectionMessage
  | ContextPermissionResponseMessage;
