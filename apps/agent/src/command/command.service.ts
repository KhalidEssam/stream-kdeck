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
import { ShellRunnerService } from './shell-runner.service';
import { RunHistoryService } from '../history/run-history.service';
import { ContextAssemblerService, ContextAssemblyError } from '../context/context-assembler.service';

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
    private readonly shellRunner: ShellRunnerService,
    private readonly runHistory: RunHistoryService,
    private readonly assembler: ContextAssemblerService,
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
            if (tool && tool.kind === 'ai') {
              prompt = tool.prompt;
              outputMode = tool.outputMode;

              if (tool.contextRequirements?.length) {
                try {
                  context = await this.assembler.assemble(
                    tool.contextRequirements,
                    client,
                    tool.packId,
                    tool.id,
                  );
                } catch (err) {
                  if (err instanceof ContextAssemblyError) {
                    return { success: false, error: err.message };
                  }
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
          return this.integrationRouter.dispatch(
            action.actionId,
            action.params,
            tool?.paramsSchema as Record<string, unknown> | undefined,
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
