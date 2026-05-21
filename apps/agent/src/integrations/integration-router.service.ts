import { Injectable } from '@nestjs/common';
import { CommandResult } from '../command/command.service';
import { IntegrationAdapter } from './integration.adapter';

@Injectable()
export class IntegrationRouterService {
  private readonly adapters: IntegrationAdapter[] = [];

  register(adapter: IntegrationAdapter): void {
    this.adapters.push(adapter);
  }

  async dispatch(
    actionId: string,
    params: Record<string, unknown>,
    paramsSchema?: Record<string, unknown>,
  ): Promise<CommandResult> {
    if (paramsSchema) {
      const err = this.validateParams(params, paramsSchema);
      if (err) return { success: false, error: err };
    }

    const adapter = this.adapters.find((a) => a.canExecute(actionId));
    if (!adapter) return { success: false, error: `No adapter handles actionId: ${actionId}` };

    return adapter.execute(actionId, params);
  }

  getAdapters(): IntegrationAdapter[] {
    return this.adapters;
  }

  private validateParams(params: Record<string, unknown>, schema: Record<string, unknown>): string | null {
    const required = schema.required as string[] | undefined;
    if (!required) return null;

    for (const field of required) {
      if (params[field] === undefined || params[field] === null || params[field] === '') {
        return `Missing required param: ${field}`;
      }
    }
    return null;
  }
}
