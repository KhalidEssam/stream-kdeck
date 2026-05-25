import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ButtonAction } from '@control-surface/shared';
import { WebSocket } from 'ws';
import { shell } from 'electron';
import { ClipboardService } from '../clipboard/clipboard.service';
import { AiRouterService, AiQuotaError } from '../ai/ai-router.service';
import { AppLaunchService } from '../app-launch/app-launch.service';
import { KeystrokeService } from '../keystroke/keystroke.service';
import { LicenseService } from '../license/license.service';
import { PackRegistryService } from '../packs/pack-registry.service';
import { IntegrationRouterService } from '../integrations/integration-router.service';
import { PluginCatalogService } from '../integrations/plugin-catalog.service';
import { CloudIntegrationClientService } from '../integrations/cloud-integration-client.service';
import { ShellRunnerService } from './shell-runner.service';
import { RunHistoryService } from '../history/run-history.service';
import { ContextAssemblerService, ContextAssemblyError } from '../context/context-assembler.service';
import { UserContextCanceledError, UserContextRequestService } from '../context/user-context-request.service';

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
  quotaExceeded?: boolean;
}

@Injectable()
export class CommandService {
  constructor(
    private readonly clipboard: ClipboardService,
    private readonly aiRouter: AiRouterService,
    private readonly appLaunch: AppLaunchService,
    private readonly keystroke: KeystrokeService,
    private readonly licenseService: LicenseService,
    private readonly packRegistry: PackRegistryService,
    private readonly integrationRouter: IntegrationRouterService,
    private readonly pluginCatalog: PluginCatalogService,
    private readonly cloudClient: CloudIntegrationClientService,
    private readonly shellRunner: ShellRunnerService,
    private readonly runHistory: RunHistoryService,
    private readonly assembler: ContextAssemblerService,
    private readonly userContextRequest: UserContextRequestService,
  ) {}

  async execute(action: ButtonAction, client: WebSocket): Promise<CommandResult> {
    const start = Date.now();
    const result = await this.executeAction(action, client);
    this.runHistory.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      success: result.success,
      output: result.output,
      error: result.error,
      durationMs: Date.now() - start,
    });
    return result;
  }

  private async executeAction(action: ButtonAction, client: WebSocket): Promise<CommandResult> {
    try {
      switch (action.kind) {
        case 'CLIPBOARD_WRITE':
          await this.clipboard.write(action.text);
          return { success: true };

        case 'AI_CLIPBOARD': {
          if (this.licenseService.creditsRemaining() <= 0) {
            return { success: false, quotaExceeded: true };
          }

          let prompt = action.prompt;
          let outputMode = action.outputMode;
          let context = '';

          if (action.toolId) {
            const tool = this.packRegistry.getById(action.toolId);
            if (!tool) {
              return { success: false, error: 'Pack tool not found — re-add the tile from the AI Tools tab' };
            }
            if (tool.kind === 'ai') {
              prompt = tool.prompt;
              outputMode = tool.outputMode;

              let userIntent: string | undefined;
              const userInputReq = tool.contextRequirements?.find((req) => (
                req.provider === 'user_input' && req.required
              ));
              if (userInputReq) {
                try {
                  const captured = await this.userContextRequest.capture(client, {
                    toolId: tool.id,
                    packId: tool.packId,
                    title: tool.label,
                    prompt: userInputReq.reason,
                    required: true,
                    captureMode: userInputReq.captureMode ?? 'speech_or_text',
                  });
                  userIntent = captured.text;
                } catch (err) {
                  if (err instanceof UserContextCanceledError) return { success: false, error: 'Canceled' };
                  throw err;
                }
              }

              const inferredRequirements = tool.contextRequirements?.filter((req) => req.provider !== 'user_input') ?? [];
              const packSlug = this.packRegistry.getPacks().find((pack) => pack.id === tool.packId)?.slug;

              if (inferredRequirements.length || userIntent) {
                try {
                  context = await this.assembler.assemble(
                    inferredRequirements,
                    client,
                    tool.packId,
                    tool.id,
                    userIntent,
                    packSlug,
                  );
                } catch (err) {
                  if (err instanceof ContextAssemblyError) return { success: false, error: err.message };
                  throw err;
                }
              } else {
                context = await this.clipboard.read();
              }
            } else {
              context = await this.clipboard.read();
            }
          } else {
            context = await this.clipboard.read();
          }

          console.log('[CommandService] AI_CLIPBOARD prompt:\n', prompt);
          console.log('[CommandService] AI_CLIPBOARD context:\n', context);
          const result = await this.aiRouter.call(prompt, context);
          this.licenseService.decrementCredit();
          if (outputMode === 'viewer') {
            return { success: true, output: result };
          }
          await this.clipboard.write(result);
          return { success: true };
        }

        case 'APP_LAUNCH':
          await this.appLaunch.launch(action.appId);
          return { success: true };

        case 'URL_OPEN':
          await this.appLaunch.openUrl(action.url);
          return { success: true };

        case 'KEYSTROKE':
          await this.keystroke.execute(action.keys);
          return { success: true };

        case 'EXEC': {
          const err = await shell.openPath(action.exePath);
          if (err) return { success: false, error: `Failed to launch: ${err}` };
          return { success: true };
        }

        case 'WORKFLOW': {
          for (const step of action.steps) {
            if (step.delayBefore > 0) {
              await new Promise<void>(resolve => setTimeout(resolve, step.delayBefore));
            }
            const result = await this.execute(step.action, client);
            if (!result.success && action.stopOnError) {
              return { success: false, error: `Step "${step.label}" failed: ${result.error}` };
            }
          }
          return { success: true };
        }

        case 'INTEGRATION_ACTION': {
          const plugin = this.pluginCatalog.getPlugins().find((p) => p.id === action.pluginId);
          const tool = plugin?.tools.find((t) => t.id === action.toolId);
          if (!tool) {
            return { success: false, error: 'Plugin tool not found - re-add the tile from the Plugin Library' };
          }

          if (tool.executionMode === 'cloud') {
            return this.cloudClient.execute({
              pluginId: action.pluginId,
              toolId: action.toolId,
              actionId: action.actionId,
              params: action.params,
              confirmed: (action as { confirmed?: boolean }).confirmed,
            });
          }

          return this.integrationRouter.dispatch(
            action.actionId,
            action.params,
            tool.paramsSchema as Record<string, unknown> | undefined,
          );
        }

        case 'SHELL_RUN': {
          const shellResult = await this.shellRunner.run({ command: action.command });
          if (!shellResult.success) {
            return { success: false, error: shellResult.stderr };
          }
          if (action.outputMode === 'viewer') {
            return { success: true, output: shellResult.stdout };
          }
          if (action.outputMode === 'clipboard' || action.outputMode === 'autopaste') {
            await this.clipboard.write(shellResult.stdout);
          }
          return { success: true };
        }

        default: {
          const exhaustive: never = action;
          return { success: false, error: `Unknown action kind: ${(exhaustive as ButtonAction).kind}` };
        }
      }
    } catch (err: unknown) {
      if (err instanceof AiQuotaError) return { success: false, quotaExceeded: true };
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
