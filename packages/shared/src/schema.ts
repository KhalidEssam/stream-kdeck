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
  | { kind: 'CLIPBOARD_WRITE'; text: string };

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
  kind: 'app' | 'url' | 'ai' | 'shortcut';
  label: string;
  iconId: string;
  color?: string;
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

export type AgentMessage = ActionResultMessage | ConnectedMessage | DeckConfigMessage;
export type MobileMessage = ButtonTapMessage | AddTileMessage | RemoveTileMessage;
