import { WebSocketGateway, OnGatewayConnection, WebSocketServer } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { platform } from 'os';
import {
  ConnectedMessage,
  MobileMessage,
  ActionResultMessage,
  DeckConfigMessage,
  LicenseStatusMessage,
  AiQuotaExceededMessage,
  SearchAppsResultMessage,
  ValidatePathResultMessage,
} from '@control-surface/shared';
import { CommandService } from '../command/command.service';
import { AppRegistryService } from '../app-launch/app-registry.service';
import { AppSearchService } from '../app-search/app-search.service';
import { LicenseService } from '../license/license.service';
import { ActivationDialogService } from '../license/activation-dialog.service';

@WebSocketGateway()
export class WsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly commandService: CommandService,
    private readonly appRegistry: AppRegistryService,
    private readonly appSearch: AppSearchService,
    private readonly licenseService: LicenseService,
    private readonly activationDialog: ActivationDialogService,
  ) {
    this.activationDialog.onActivated?.(() => this.broadcastLicenseStatus());
  }

  private sendDeckConfig(client: WebSocket): void {
    const msg: DeckConfigMessage = {
      type: 'DECK_CONFIG',
      tiles: this.appRegistry.getTiles(),
    };
    client.send(JSON.stringify(msg));
  }

  private broadcastLicenseStatus(): void {
    const payload = JSON.stringify(this.buildLicenseStatusMsg());
    this.server.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  private buildLicenseStatusMsg(): LicenseStatusMessage {
    const claims = this.licenseService.getClaims();
    return {
      type:             'LICENSE_STATUS',
      licensed:         claims.licensed,
      aiPro:            claims.ai_pro,
      creditsRemaining: claims.credits_remaining,
      creditQuota:      claims.credit_quota,
    };
  }

  private sendLicenseStatus(client: WebSocket): void {
    client.send(JSON.stringify(this.buildLicenseStatusMsg()));
  }

  handleConnection(client: WebSocket): void {
    const connected: ConnectedMessage = {
      type:         'CONNECTED',
      agentVersion: '0.1.0',
      platform:     platform() as 'darwin' | 'win32' | 'linux',
    };
    client.send(JSON.stringify(connected));
    this.sendDeckConfig(client);
    this.sendLicenseStatus(client);

    console.log('[Agent] Mobile client connected');

    client.on('message', async (raw) => {
      let data: MobileMessage;
      try {
        data = JSON.parse(raw.toString()) as MobileMessage;
      } catch {
        return;
      }

      if (data.type === 'OPEN_ACTIVATION_DIALOG') {
        this.activationDialog.open();
        return;
      }

      if (data.type === 'GET_LICENSE_STATUS') {
        this.sendLicenseStatus(client);
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

      if (data.type === 'SET_TILE_PINNED') {
        this.appRegistry.setTilePinned(data.tileId, data.pinned);
        this.sendDeckConfig(client);
        return;
      }

      if (data.type === 'SEARCH_APPS') {
        const startedAt = Date.now();
        console.log(`[Agent] SEARCH_APPS "${data.query}"`);
        const results = await this.appSearch.searchApps(data.query);
        const names = results.slice(0, 5).map((r) => r.name).join(', ');
        console.log(
          `[Agent] SEARCH_APPS_RESULT "${data.query}": ${results.length} result(s)` +
            (names ? ` [${names}]` : '') +
            ` in ${Date.now() - startedAt}ms`,
        );
        const response: SearchAppsResultMessage = { type: 'SEARCH_APPS_RESULT', results };
        client.send(JSON.stringify(response));
        return;
      }

      if (data.type === 'VALIDATE_PATH') {
        console.log(`[Agent] VALIDATE_PATH "${data.exePath}"`);
        const outcome = await this.appSearch.validatePath(data.exePath);
        console.log(`[Agent] VALIDATE_PATH_RESULT "${data.exePath}": ${outcome.valid ? 'valid' : outcome.error}`);
        const response: ValidatePathResultMessage = { type: 'VALIDATE_PATH_RESULT', ...outcome };
        client.send(JSON.stringify(response));
        return;
      }

      if (data.type !== 'BUTTON_TAP') return;

      console.log(`[Agent] BUTTON_TAP ${data.buttonId} (${data.action.kind})`);
      const result = await this.commandService.execute(data.action);

      if (result.quotaExceeded) {
        const quotaMsg: AiQuotaExceededMessage = { type: 'AI_QUOTA_EXCEEDED', reason: 'credits_exhausted' };
        client.send(JSON.stringify(quotaMsg));
        this.sendLicenseStatus(client);
        return;
      }

      if (!result.success) {
        console.error(`[Agent] Action failed: ${result.error}`);
      }

      const response: ActionResultMessage = {
        type:     'ACTION_RESULT',
        buttonId: data.buttonId,
        success:  result.success,
        output:   result.output,
        error:    result.error,
      };
      client.send(JSON.stringify(response));

      if (data.action.kind === 'AI_CLIPBOARD') {
        this.sendLicenseStatus(client);
      }
    });
  }
}
