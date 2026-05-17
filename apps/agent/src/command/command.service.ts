import { Injectable } from '@nestjs/common';
import { ButtonAction } from '@control-surface/shared';
import { shell } from 'electron';
import { ClipboardService } from '../clipboard/clipboard.service';
import { AiRouterService } from '../ai/ai-router.service';
import { AppLaunchService } from '../app-launch/app-launch.service';
import { KeystrokeService } from '../keystroke/keystroke.service';

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
}

@Injectable()
export class CommandService {
  constructor(
    private readonly clipboard: ClipboardService,
    private readonly aiRouter: AiRouterService,
    private readonly appLaunch: AppLaunchService,
    private readonly keystroke: KeystrokeService,
  ) {}

  async execute(action: ButtonAction): Promise<CommandResult> {
    try {
      switch (action.kind) {
        case 'CLIPBOARD_WRITE':
          await this.clipboard.write(action.text);
          return { success: true };

        case 'AI_CLIPBOARD': {
          const context = await this.clipboard.read();
          const result = await this.aiRouter.call(action.prompt, context);
          if (action.outputMode === 'viewer') {
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

        default: {
          const exhaustive: never = action;
          return { success: false, error: `Unknown action kind: ${(exhaustive as ButtonAction).kind}` };
        }
      }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
