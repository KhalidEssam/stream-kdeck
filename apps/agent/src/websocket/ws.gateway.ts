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
  ContextShortcutsMessage,
  ContextProfilesMessage,
  AddContextShortcutMessage,
  RemoveContextShortcutMessage,
} from '@control-surface/shared';
import { CommandService } from '../command/command.service';
import { AppRegistryService } from '../app-launch/app-registry.service';
import { AppSearchService } from '../app-search/app-search.service';
import { LicenseService } from '../license/license.service';
import { ActivationDialogService } from '../license/activation-dialog.service';
import { ActiveWindowService } from '../active-window/active-window.service';
import { ContextProfileService } from '../context-profile/context-profile.service';
import { ContextProfile } from '../context-profile/context-profile.service';
import { MouseService } from '../mouse/mouse.service';
import { MouseMoveMessage, MouseClickMessage, MouseScrollMessage } from '@control-surface/shared';

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
    private readonly activeWindow: ActiveWindowService,
    private readonly contextProfile: ContextProfileService,
    private readonly mouseService: MouseService,
  ) {
    this.activationDialog.onActivated?.(() => this.broadcastLicenseStatus());
    this.activeWindow.on('appChanged', (processName: string | null) => {
      void this.handleAppChanged(processName);
    });
    this.appRegistry.on('tilesUpdated', () => this.broadcastDeckConfig());
  }

  private sendDeckConfig(client: WebSocket): void {
    const msg: DeckConfigMessage = {
      type: 'DECK_CONFIG',
      tiles: this.appRegistry.getTiles(),
    };
    client.send(JSON.stringify(msg));
  }

  private broadcastDeckConfig(): void {
    const msg: DeckConfigMessage = {
      type: 'DECK_CONFIG',
      tiles: this.appRegistry.getTiles(),
    };
    const payload = JSON.stringify(msg);
    this.server.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
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

  private async handleAppChanged(processName: string | null): Promise<void> {
    if (processName && this.contextProfile.isCurated(processName)) {
      const existing = this.contextProfile.getProfile(processName);
      const shouldGenerate = !existing || (existing.source === 'llm-failed' && existing.shortcuts.length === 0);
      if (shouldGenerate) {
        const meta = this.contextProfile.getCuratedMeta(processName)!;
        console.log(`[Agent] appChanged: ${processName} → generating shortcuts...`);
        const { quotaExceeded } = await this.contextProfile.generateAndCache(processName, meta.appLabel, meta.iconId, platform());
        if (quotaExceeded) {
          this.broadcastQuotaExceeded();
        }
      }
    }
    const profile = this.contextProfile.getProfile(processName);
    this.broadcastContextShortcuts(processName, profile);
  }

  private broadcastQuotaExceeded(): void {
    const quotaMsg: AiQuotaExceededMessage = { type: 'AI_QUOTA_EXCEEDED', reason: 'credits_exhausted' };
    const payload = JSON.stringify(quotaMsg);
    this.server.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
    this.broadcastLicenseStatus();
  }

  private buildContextMsg(
    processName: string | null,
    profile: ContextProfile | null,
  ): ContextShortcutsMessage {
    const hasContent = profile && profile.shortcuts.length > 0;
    return {
      type:        'CONTEXT_SHORTCUTS',
      processName: processName ?? '',
      appLabel:    hasContent ? profile.appLabel : '',
      iconId:      hasContent ? profile.iconId   : '',
      shortcuts:   hasContent ? profile.shortcuts : [],
    };
  }

  private broadcastContextShortcuts(
    processName: string | null,
    profile: ContextProfile | null,
  ): void {
    const payload = JSON.stringify(this.buildContextMsg(processName, profile));
    this.server.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }

  private sendContextShortcuts(client: WebSocket): void {
    const pn = this.activeWindow.current;
    const profile = this.contextProfile.getProfile(pn);
    client.send(JSON.stringify(this.buildContextMsg(pn, profile)));
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
    this.sendContextShortcuts(client);

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

      if (data.type === 'ADD_CONTEXT_SHORTCUT') {
        const d = data as AddContextShortcutMessage;
        this.contextProfile.addShortcut(d.processName, d.appLabel, d.iconId, d.shortcut);
        const profile = this.contextProfile.getProfile(d.processName);
        client.send(JSON.stringify(this.buildContextMsg(d.processName, profile)));
        return;
      }

      if (data.type === 'REMOVE_CONTEXT_SHORTCUT') {
        const d = data as RemoveContextShortcutMessage;
        this.contextProfile.removeShortcut(d.processName, d.shortcutId);
        const profile = this.contextProfile.getProfile(d.processName);
        client.send(JSON.stringify(this.buildContextMsg(d.processName, profile)));
        return;
      }

      if (data.type === 'GET_CONTEXT_PROFILES') {
        const msg: ContextProfilesMessage = {
          type:     'CONTEXT_PROFILES',
          profiles: this.contextProfile.getAllProfiles(),
        };
        client.send(JSON.stringify(msg));
        return;
      }

      if (data.type === 'MOUSE_MOVE') {
        const d = data as MouseMoveMessage;
        await this.mouseService.moveMouse(d.dx, d.dy);
        return;
      }

      if (data.type === 'MOUSE_CLICK') {
        const d = data as MouseClickMessage;
        await this.mouseService.clickMouse(d.button, d.action);
        return;
      }

      if (data.type === 'MOUSE_SCROLL') {
        const d = data as MouseScrollMessage;
        await this.mouseService.scrollMouse(d.dx, d.dy);
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
