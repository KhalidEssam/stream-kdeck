import { AgentMessage, ButtonAction, ButtonTapMessage, ActionResultMessage } from '../types/schema';

type Status = 'connecting' | 'connected' | 'disconnected';
type StatusCallback = (status: Status) => void;
type ResultCallback = (msg: ActionResultMessage) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private statusCallbacks: StatusCallback[] = [];
  private resultCallbacks: ResultCallback[] = [];

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

  onStatusChange(cb: StatusCallback): void {
    this.statusCallbacks.push(cb);
  }

  onResult(cb: ResultCallback): void {
    this.resultCallbacks.push(cb);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private notifyStatus(status: Status): void {
    this.statusCallbacks.forEach((cb) => cb(status));
  }
}
