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
  PackRegistryMessage,
  MediaVolumeDeltaMessage,
  MediaSetMuteMessage,
  MediaBringToFrontMessage,
  MediaPinAppMessage,
  MediaSetVolumeMessage,
  MediaStateMessage,
  MediaSession,
  PluginCatalogMessage,
  InstalledPluginsMessage,
  PluginInstallStatusMessage,
  IntegrationStateMessage,
  PluginConnectionStatusMessage,
  ButtonAction,
  ReorderTilesMessage,
  ConsentScope,
  ContextPermissionResponseMessage,
  ContextPermissionRequestMessage,
} from '@control-surface/shared';
import { MediaService } from '../media/media.service';
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
import { PackRegistryService } from '../packs/pack-registry.service';
import { ConnectorService } from '../integrations/connector.service';
import { IntegrationRouterService } from '../integrations/integration-router.service';
import { IntegrationStateService } from '../integrations/integration-state.service';
import { ObsService } from '../integrations/obs/obs.service';
import { PluginCatalogService } from '../integrations/plugin-catalog.service';
import { PluginInstallService } from '../integrations/plugin-install.service';

function actionIncludesIntegration(action: ButtonAction): boolean {
  if (action.kind === 'INTEGRATION_ACTION') return true;
  if (action.kind === 'WORKFLOW') {
    return action.steps.some((step) => actionIncludesIntegration(step.action));
  }
  return false;
}

@WebSocketGateway()
export class WsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly pluginsReady: Promise<void>;
  private readonly pendingConsentRequests = new Map<string, (granted: boolean, scope?: ConsentScope) => void>();

  constructor(
    private readonly commandService: CommandService,
    private readonly appRegistry: AppRegistryService,
    private readonly appSearch: AppSearchService,
    private readonly licenseService: LicenseService,
    private readonly activationDialog: ActivationDialogService,
    private readonly activeWindow: ActiveWindowService,
    private readonly contextProfile: ContextProfileService,
    private readonly mouseService: MouseService,
    private readonly packRegistry: PackRegistryService,
    private readonly mediaService: MediaService,
    private readonly pluginCatalog: PluginCatalogService,
    private readonly pluginInstall: PluginInstallService,
    private readonly integrationState: IntegrationStateService,
    private readonly integrationRouter: IntegrationRouterService,
    private readonly obsService: ObsService,
    private readonly connectorService: ConnectorService,
  ) {
    this.activationDialog.onActivated?.(() => this.broadcastLicenseStatus());
    this.activeWindow.on('appChanged', (processName: string | null) => {
      void this.handleAppChanged(processName);
    });
    this.appRegistry.on('tilesUpdated', () => this.broadcastDeckConfig());
    void this.packRegistry.load();
    this.mediaService.setBroadcastFn((sessions, plt) => this.broadcastMediaState(sessions, plt));

    this.integrationRouter.register(this.obsService);
    const catalogLoad = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
      ? this.pluginCatalog.load()
      : Promise.resolve();
    this.pluginsReady = Promise.all([
      catalogLoad,
      this.pluginInstall.fetchInstalled(),
    ]).then(() => undefined);
    this.integrationState.setBroadcastFn((msg: IntegrationStateMessage) => this.broadcastIntegrationState(msg));
    this.integrationState.startPolling();
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

  private sendPackRegistry(client: WebSocket): void {
    const msg: PackRegistryMessage = { type: 'PACK_REGISTRY', packs: this.packRegistry.getPacks() };
    client.send(JSON.stringify(msg));
  }

  private sendPluginCatalog(client: WebSocket): void {
    const msg: PluginCatalogMessage = { type: 'PLUGIN_CATALOG', plugins: this.pluginCatalog.getPlugins() };
    client.send(JSON.stringify(msg));
  }

  private sendInstalledPlugins(client: WebSocket): void {
    const msg: InstalledPluginsMessage = {
      type: 'INSTALLED_PLUGINS',
      installedPluginIds: this.pluginInstall.getInstalledPluginIds(),
    };
    client.send(JSON.stringify(msg));
  }

  private broadcastInstalledPlugins(): void {
    const msg: InstalledPluginsMessage = {
      type: 'INSTALLED_PLUGINS',
      installedPluginIds: this.pluginInstall.getInstalledPluginIds(),
    };
    const payload = JSON.stringify(msg);
    this.server.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }

  private sendPluginInstallStatus(client: WebSocket, msg: Omit<PluginInstallStatusMessage, 'type'>): void {
    client.send(JSON.stringify({ type: 'PLUGIN_INSTALL_STATUS', ...msg } satisfies PluginInstallStatusMessage));
  }

  private broadcastIntegrationState(msg: IntegrationStateMessage): void {
    const payload = JSON.stringify(msg);
    this.server.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }

  private broadcastMediaState(sessions: MediaSession[], plt: 'win32' | 'darwin'): void {
    const msg: MediaStateMessage = { type: 'MEDIA_STATE', sessions, platform: plt };
    const payload = JSON.stringify(msg);
    this.server.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }

  private sendMediaState(client: WebSocket): void {
    void this.mediaService.getSessions().then((sessions) => {
      const msg: MediaStateMessage = {
        type: 'MEDIA_STATE',
        sessions: this.mediaService.buildMediaState(sessions),
        platform: platform() as 'win32' | 'darwin',
      };
      client.send(JSON.stringify(msg));
    });
  }

  handleConnection(client: WebSocket): void {
    const connected: ConnectedMessage = {
      type:         'CONNECTED',
      agentVersion: '0.1.0',
      platform:     platform() as 'darwin' | 'win32' | 'linux',
      userId:       this.licenseService.getUserId(),
    };
    client.send(JSON.stringify(connected));
    this.sendDeckConfig(client);
    this.sendLicenseStatus(client);
    this.sendContextShortcuts(client);
    this.sendPackRegistry(client);
    this.sendPluginCatalog(client);
    this.sendInstalledPlugins(client);
    this.sendMediaState(client);
    void this.pluginsReady.then(() => {
      if (client.readyState !== WebSocket.OPEN) return;
      this.sendPluginCatalog(client);
      this.sendInstalledPlugins(client);
    });
    void this.pluginInstall.fetchInstalled().then(() => {
      if (client.readyState === WebSocket.OPEN) this.sendInstalledPlugins(client);
    });

    console.log('[Agent] Mobile client connected');

    client.on('message', async (raw) => {
      let data: MobileMessage;
      try {
        data = JSON.parse(raw.toString()) as MobileMessage;
      } catch {
        return;
      }

      if (data.type === 'MEDIA_VOLUME_DELTA') {
        const d = data as MediaVolumeDeltaMessage;
        this.mediaService.adjustVolume(d.processName, d.delta);
        return;
      }

      if (data.type === 'MEDIA_SET_MUTE') {
        const d = data as MediaSetMuteMessage;
        this.mediaService.setMute(d.processName, d.muted);
        return;
      }

      if (data.type === 'MEDIA_BRING_TO_FRONT') {
        const d = data as MediaBringToFrontMessage;
        this.mediaService.bringToFront(d.processName);
        return;
      }

      if (data.type === 'MEDIA_PIN_APP') {
        const d = data as MediaPinAppMessage;
        this.mediaService.pinApp(d.processName, d.label, d.pinned, d.iconBase64);
        return;
      }

      if (data.type === 'MEDIA_SET_VOLUME') {
        const d = data as MediaSetVolumeMessage;
        this.mediaService.setVolume(d.processName, d.volume);
        return;
      }

      if (data.type === 'GET_MEDIA_STATE') {
        this.sendMediaState(client);
        return;
      }

      if (data.type === 'GET_PLUGIN_CATALOG') {
        this.sendPluginCatalog(client);
        return;
      }

      if (data.type === 'INSTALL_PLUGIN') {
        const result = await this.safePluginInstall(() => this.pluginInstall.install(data.pluginId));
        this.sendPluginInstallStatus(client, {
          pluginId: data.pluginId,
          status: result.success ? 'installed' : 'error',
          error: result.error,
        });
        this.broadcastInstalledPlugins();
        return;
      }

      if (data.type === 'UNINSTALL_PLUGIN') {
        const result = await this.safePluginInstall(() => this.pluginInstall.uninstall(data.pluginId));
        this.sendPluginInstallStatus(client, {
          pluginId: data.pluginId,
          status: result.success ? 'uninstalled' : 'error',
          error: result.error,
        });
        this.broadcastInstalledPlugins();
        return;
      }

      if (data.type === 'SET_PLUGIN_CONNECTION') {
        const plugin = this.pluginCatalog.getPlugins().find((item) => item.id === data.pluginId);
        if (plugin?.slug === 'obs') {
          const testResult = await this.obsService.testConnection(data.metadata);
          if (!testResult.success) {
            const statusMsg: PluginConnectionStatusMessage = {
              type: 'PLUGIN_CONNECTION_STATUS',
              pluginId: data.pluginId,
              status: 'error',
              error: testResult.error,
            };
            client.send(JSON.stringify(statusMsg));
            return;
          }
        }

        await this.connectorService.setDeviceConnection(data.pluginId, data.metadata);
        const statusMsg: PluginConnectionStatusMessage = {
          type: 'PLUGIN_CONNECTION_STATUS',
          pluginId: data.pluginId,
          status: 'connected',
        };
        client.send(JSON.stringify(statusMsg));
        return;
      }

      if (data.type === 'TEST_PLUGIN_CONNECTION') {
        const statusMsg: PluginConnectionStatusMessage = {
          type: 'PLUGIN_CONNECTION_STATUS',
          pluginId: data.pluginId,
          status: 'not_configured',
        };
        client.send(JSON.stringify(statusMsg));
        return;
      }

      if (data.type === 'OPEN_ACTIVATION_DIALOG') {
        this.activationDialog.open();
        return;
      }

      if (data.type === 'REVALIDATE_LICENSE') {
        await this.licenseService.refreshSession();
        this.broadcastLicenseStatus();
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

      if (data.type === 'SET_TILE_ICON') {
        this.appRegistry.setTileIcon(data.tileId, data.customIcon);
        this.sendDeckConfig(client);
        return;
      }

      if (data.type === 'REORDER_TILES') {
        if (Array.isArray(data.tileIds)) {
          this.appRegistry.reorderTiles(data.tileIds as string[]);
        }
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

      if (data.type === 'CONTEXT_PERMISSION_RESPONSE') {
        const d = data as ContextPermissionResponseMessage;
        const resolve = this.pendingConsentRequests.get(d.requestId);
        if (resolve) {
          this.pendingConsentRequests.delete(d.requestId);
          resolve(d.granted, d.scope);
        }
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

      if (result.success && actionIncludesIntegration(data.action)) {
        void this.integrationState.pollNow();
      }

      if (data.action.kind === 'AI_CLIPBOARD') {
        this.sendLicenseStatus(client);
      }
    });
  }

  async requestConsent(
    client: WebSocket,
    packId: string,
    providerId: string,
    providerLabel: string,
    reason: string,
  ): Promise<{ granted: boolean; scope?: ConsentScope }> {
    const requestId = Math.random().toString(36).slice(2);
    const msg: ContextPermissionRequestMessage = {
      type: 'CONTEXT_PERMISSION_REQUEST',
      requestId,
      packId,
      providerId,
      providerLabel,
      reason,
      scopeOptions: ['once', 'session', 'permanent'],
    };
    client.send(JSON.stringify(msg));

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingConsentRequests.delete(requestId);
        resolve({ granted: false });
      }, 60_000);

      this.pendingConsentRequests.set(requestId, (granted, scope) => {
        clearTimeout(timer);
        resolve({ granted, scope });
      });
    });
  }

  private async safePluginInstall(
    operation: () => Promise<{ success: boolean; error?: string }>,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      return await operation();
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
