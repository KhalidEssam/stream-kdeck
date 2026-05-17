import { Injectable } from '@nestjs/common';
import { ButtonAction } from '@control-surface/shared';
import { ClipboardService } from '../clipboard/clipboard.service';
import { AiRouterService } from '../ai/ai-router.service';

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

        case 'KEYSTROKE':
          return { success: false, error: 'KEYSTROKE not yet implemented (Week 3-4)' };

        case 'APP_LAUNCH':
          return { success: false, error: 'APP_LAUNCH not yet implemented (Week 3-4)' };

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
