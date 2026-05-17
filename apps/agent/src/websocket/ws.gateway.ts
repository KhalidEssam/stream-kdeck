import { WebSocketGateway, OnGatewayConnection, WebSocketServer } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { platform } from 'os';
import {
  ConnectedMessage,
  MobileMessage,
  ActionResultMessage,
  DeckConfigMessage,
} from '@control-surface/shared';
import { CommandService } from '../command/command.service';
import { AppRegistryService } from '../app-launch/app-registry.service';

// No port in decorator — attaches to the HTTP server's port (3001 in production, test port in tests).
// NestJS WsAdapter expects { event, data } format for @SubscribeMessage routing.
// Our schema uses { type, buttonId, action } instead, so we handle messages via
// raw client.on('message') in handleConnection rather than @SubscribeMessage.
@WebSocketGateway()
export class WsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly commandService: CommandService,
    private readonly appRegistry: AppRegistryService,
  ) {}

  handleConnection(client: WebSocket): void {
    const connected: ConnectedMessage = {
      type: 'CONNECTED',
      agentVersion: '0.1.0',
      platform: platform() as 'darwin' | 'win32' | 'linux',
    };
    client.send(JSON.stringify(connected));

    const deckConfig: DeckConfigMessage = {
      type: 'DECK_CONFIG',
      tiles: this.appRegistry.getTiles(),
    };
    client.send(JSON.stringify(deckConfig));

    console.log('[Agent] Mobile client connected');

    client.on('message', async (raw) => {
      let data: MobileMessage;
      try {
        data = JSON.parse(raw.toString()) as MobileMessage;
      } catch {
        return;
      }

      if (data.type === 'ADD_TILE') {
        this.appRegistry.addTile(data.tile);
        const updated: DeckConfigMessage = {
          type: 'DECK_CONFIG',
          tiles: this.appRegistry.getTiles(),
        };
        client.send(JSON.stringify(updated));
        return;
      }

      if (data.type !== 'BUTTON_TAP') return;

      console.log(`[Agent] BUTTON_TAP ${data.buttonId} (${data.action.kind})`);
      const result = await this.commandService.execute(data.action);

      if (!result.success) {
        console.error(`[Agent] Action failed: ${result.error}`);
      }

      const response: ActionResultMessage = {
        type: 'ACTION_RESULT',
        buttonId: data.buttonId,
        success: result.success,
        output: result.output,
        error: result.error,
      };
      client.send(JSON.stringify(response));
    });
  }
}
