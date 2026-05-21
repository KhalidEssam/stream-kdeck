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
  AiQuotaExceededMessage,
  OpenActivationDialogMessage,
  GetLicenseStatusMessage,
  RevalidateLicenseMessage,
  ContextShortcutsMessage,
  ContextProfilesMessage,
  AddContextShortcutMessage,
  RemoveContextShortcutMessage,
  GetContextProfilesMessage,
  ContextShortcut,
  MouseMoveMessage,
  MouseClickMessage,
  MouseScrollMessage,
  PackRegistryMessage,
  MediaStateMessage,
  MediaVolumeDeltaMessage,
  MediaSetMuteMessage,
  MediaBringToFrontMessage,
  MediaPinAppMessage,
} from '../types/schema';

type Status = 'connecting' | 'connected' | 'disconnected';
type StatusCallback = (status: Status) => void;
export interface ConnectionErrorInfo {
  url: string;
  phase: 'open' | 'close';
  message: string;
  code?: number;
  reason?: string;
}
type ConnectionErrorCallback = (error: ConnectionErrorInfo) => void;
type ResultCallback = (msg: ActionResultMessage) => void;
type DeckConfigCallback = (msg: DeckConfigMessage) => void;
type SearchAppsResultCallback = (msg: SearchAppsResultMessage) => void;
type ValidatePathResultCallback = (msg: ValidatePathResultMessage) => void;
type LicenseStatusCallback = (msg: LicenseStatusMessage) => void;
type AiQuotaExceededCallback = (msg: AiQuotaExceededMessage) => void;
type ContextShortcutsCallback = (msg: ContextShortcutsMessage) => void;
type ContextProfilesCallback  = (msg: ContextProfilesMessage) => void;
type PackRegistryCallback = (msg: PackRegistryMessage) => void;
type MediaStateCallback = (msg: MediaStateMessage) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private statusCallbacks: StatusCallback[] = [];
  private connectionErrorCallbacks: ConnectionErrorCallback[] = [];
  private resultCallbacks: ResultCallback[] = [];
  private deckConfigCallbacks: DeckConfigCallback[] = [];
  private searchAppsCallbacks: SearchAppsResultCallback[] = [];
  private validatePathCallbacks: ValidatePathResultCallback[] = [];
  private licenseStatusCallbacks: LicenseStatusCallback[] = [];
  private aiQuotaExceededCallbacks: AiQuotaExceededCallback[] = [];
  private contextShortcutsCallbacks: ContextShortcutsCallback[] = [];
  private contextProfilesCallbacks:  ContextProfilesCallback[]  = [];
  private packRegistryCallbacks: PackRegistryCallback[] = [];
  private mediaStateCallbacks: MediaStateCallback[] = [];

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
      } else if (msg.type === 'AI_QUOTA_EXCEEDED') {
        this.aiQuotaExceededCallbacks.forEach((cb) => cb(msg));
      } else if (msg.type === 'CONTEXT_SHORTCUTS') {
        this.contextShortcutsCallbacks.forEach((cb) => cb(msg));
      } else if (msg.type === 'CONTEXT_PROFILES') {
        this.contextProfilesCallbacks.forEach((cb) => cb(msg));
      } else if (msg.type === 'PACK_REGISTRY') {
        this.packRegistryCallbacks.forEach((cb) => cb(msg));
      } else if (msg.type === 'MEDIA_STATE') {
        this.mediaStateCallbacks.forEach((cb) => cb(msg as MediaStateMessage));
      }
    };

    this.ws.onclose = () => {
      this.notifyStatus('disconnected');
    };

    this.ws.onerror = (event) => {
      this.notifyConnectionError({
        url: this.url,
        phase: 'open',
        message: getWebSocketEventMessage(event, 'WebSocket connection failed'),
      });
      this.notifyStatus('disconnected');
    };
  }

  tap(buttonId: string, action: ButtonAction): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: ButtonTapMessage = { type: 'BUTTON_TAP', buttonId, action };
    this.ws.send(JSON.stringify(msg));
  }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
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

  revalidateLicense(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: RevalidateLicenseMessage = { type: 'REVALIDATE_LICENSE' };
    this.ws.send(JSON.stringify(msg));
  }

  requestLicenseStatus(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: GetLicenseStatusMessage = { type: 'GET_LICENSE_STATUS' };
    this.ws.send(JSON.stringify(msg));
  }

  addContextShortcut(
    processName: string,
    appLabel: string,
    iconId: string,
    shortcut: Omit<ContextShortcut, 'id'>,
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: AddContextShortcutMessage = {
      type: 'ADD_CONTEXT_SHORTCUT',
      processName,
      appLabel,
      iconId,
      shortcut,
    };
    this.ws.send(JSON.stringify(msg));
  }

  removeContextShortcut(processName: string, shortcutId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: RemoveContextShortcutMessage = { type: 'REMOVE_CONTEXT_SHORTCUT', processName, shortcutId };
    this.ws.send(JSON.stringify(msg));
  }

  requestContextProfiles(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: GetContextProfilesMessage = { type: 'GET_CONTEXT_PROFILES' };
    this.ws.send(JSON.stringify(msg));
  }

  moveMouse(dx: number, dy: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: MouseMoveMessage = { type: 'MOUSE_MOVE', dx, dy };
    this.ws.send(JSON.stringify(msg));
  }

  clickMouse(button: 'left' | 'right' | 'middle', action: 'click' | 'down' | 'up'): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: MouseClickMessage = { type: 'MOUSE_CLICK', button, action };
    this.ws.send(JSON.stringify(msg));
  }

  scrollMouse(dx: number, dy: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: MouseScrollMessage = { type: 'MOUSE_SCROLL', dx, dy };
    this.ws.send(JSON.stringify(msg));
  }

  sendMediaVolumeDelta(processName: string, delta: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: MediaVolumeDeltaMessage = { type: 'MEDIA_VOLUME_DELTA', processName, delta };
    this.ws.send(JSON.stringify(msg));
  }

  sendMediaSetMute(processName: string, muted: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: MediaSetMuteMessage = { type: 'MEDIA_SET_MUTE', processName, muted };
    this.ws.send(JSON.stringify(msg));
  }

  sendMediaBringToFront(processName: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: MediaBringToFrontMessage = { type: 'MEDIA_BRING_TO_FRONT', processName };
    this.ws.send(JSON.stringify(msg));
  }

  sendMediaPinApp(processName: string, label: string, pinned: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: MediaPinAppMessage = { type: 'MEDIA_PIN_APP', processName, label, pinned };
    this.ws.send(JSON.stringify(msg));
  }

  onStatusChange(cb: StatusCallback): void {
    this.statusCallbacks.push(cb);
  }

  onConnectionError(cb: ConnectionErrorCallback): () => void {
    this.connectionErrorCallbacks.push(cb);
    return () => {
      this.connectionErrorCallbacks = this.connectionErrorCallbacks.filter((c) => c !== cb);
    };
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

  onAiQuotaExceeded(cb: AiQuotaExceededCallback): () => void {
    this.aiQuotaExceededCallbacks.push(cb);
    return () => {
      this.aiQuotaExceededCallbacks = this.aiQuotaExceededCallbacks.filter((c) => c !== cb);
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

  onContextShortcuts(cb: ContextShortcutsCallback): () => void {
    this.contextShortcutsCallbacks.push(cb);
    return () => {
      this.contextShortcutsCallbacks = this.contextShortcutsCallbacks.filter((c) => c !== cb);
    };
  }

  onContextProfiles(cb: ContextProfilesCallback): () => void {
    this.contextProfilesCallbacks.push(cb);
    return () => {
      this.contextProfilesCallbacks = this.contextProfilesCallbacks.filter((c) => c !== cb);
    };
  }

  onPackRegistry(cb: PackRegistryCallback): () => void {
    this.packRegistryCallbacks.push(cb);
    return () => {
      this.packRegistryCallbacks = this.packRegistryCallbacks.filter((c) => c !== cb);
    };
  }

  onMediaState(cb: MediaStateCallback): () => void {
    this.mediaStateCallbacks.push(cb);
    return () => {
      this.mediaStateCallbacks = this.mediaStateCallbacks.filter((c) => c !== cb);
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

  private notifyConnectionError(error: ConnectionErrorInfo): void {
    this.connectionErrorCallbacks.forEach((cb) => cb(error));
  }
}

function getWebSocketEventMessage(event: Event, fallback: string): string {
  const candidate = event as Event & { message?: unknown; error?: unknown };
  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message;
  }
  if (candidate.error instanceof Error && candidate.error.message.trim()) {
    return candidate.error.message;
  }
  if (typeof candidate.error === 'string' && candidate.error.trim()) {
    return candidate.error;
  }
  return fallback;
}
