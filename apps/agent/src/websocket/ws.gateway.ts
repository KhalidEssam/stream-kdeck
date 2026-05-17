import { WebSocketGateway, OnGatewayConnection, WebSocketServer } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { platform } from 'os';
import {
  ConnectedMessage,
  MobileMessage,
  ActionResultMessage,
  DeckConfigMessage,
  SearchAppsResultMessage,
  ValidatePathResultMessage,
} from '@control-surface/shared';
import { CommandService } from '../command/command.service';
import { AppRegistryService } from '../app-launch/app-registry.service';
import { AppSearchService } from '../app-search/app-search.service';

@WebSocketGateway()
export class WsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly commandService: CommandService,
    private readonly appRegistry: AppRegistryService,
    private readonly appSearch: AppSearchService,
  ) {}

  private sendDeckConfig(client: WebSocket): void {
    const msg: DeckConfigMessage = {
      type: 'DECK_CONFIG',
      tiles: this.appRegistry.getTiles(),
    };
    client.send(JSON.stringify(msg));
  }

  handleConnection(client: WebSocket): void {
    const connected: ConnectedMessage = {
      type: 'CONNECTED',
      agentVersion: '0.1.0',
      platform: platform() as 'darwin' | 'win32' | 'linux',
    };
    client.send(JSON.stringify(connected));
    this.sendDeckConfig(client);

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
        this.sendDeckConfig(client);
        return;
      }

      if (data.type === 'REMOVE_TILE') {
        this.appRegistry.removeTile(data.tileId);
        this.sendDeckConfig(client);
        return;
      }

      if (data.type === 'SEARCH_APPS') {
        const results = await this.appSearch.searchApps(data.query);
        const response: SearchAppsResultMessage = { type: 'SEARCH_APPS_RESULT', results };
        client.send(JSON.stringify(response));
        return;
      }

      if (data.type === 'VALIDATE_PATH') {
        const outcome = await this.appSearch.validatePath(data.exePath);
        const response: ValidatePathResultMessage = { type: 'VALIDATE_PATH_RESULT', ...outcome };
        client.send(JSON.stringify(response));
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
