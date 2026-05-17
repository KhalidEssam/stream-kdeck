import {
  AgentMessage,
  ButtonAction,
  ButtonTapMessage,
  ActionResultMessage,
  DeckConfigMessage,
  TileConfig,
  AddTileMessage,
  RemoveTileMessage,
  SearchAppsMessage,
  ValidatePathMessage,
  SearchAppsResultMessage,
  ValidatePathResultMessage,
} from '../types/schema';

type Status = 'connecting' | 'connected' | 'disconnected';
type StatusCallback = (status: Status) => void;
type ResultCallback = (msg: ActionResultMessage) => void;
type DeckConfigCallback = (msg: DeckConfigMessage) => void;
type SearchAppsResultCallback = (msg: SearchAppsResultMessage) => void;
type ValidatePathResultCallback = (msg: ValidatePathResultMessage) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private statusCallbacks: StatusCallback[] = [];
  private resultCallbacks: ResultCallback[] = [];
  private deckConfigCallbacks: DeckConfigCallback[] = [];
  private searchAppsCallbacks: SearchAppsResultCallback[] = [];
  private validatePathCallbacks: ValidatePathResultCallback[] = [];

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

  onStatusChange(cb: StatusCallback): void {
    this.statusCallbacks.push(cb);
  }

  onResult(cb: ResultCallback): void {
    this.resultCallbacks.push(cb);
  }

  onDeckConfig(cb: DeckConfigCallback): void {
    this.deckConfigCallbacks.push(cb);
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
