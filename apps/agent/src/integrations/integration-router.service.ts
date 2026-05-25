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
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;

    if (required) {
      for (const field of required) {
        if (params[field] === undefined || params[field] === null || params[field] === '') {
          return `Missing required param: ${field}`;
        }
      }
    }

    if (properties) {
      for (const [field, propSchema] of Object.entries(properties)) {
        const value = params[field];
        if (value === undefined || value === null || value === '') continue;

        const expectedType = propSchema.type as string | undefined;
        if (expectedType && !this.valueMatchesType(value, expectedType)) {
          return `Invalid type for param '${field}': expected ${expectedType}, got ${typeof value}`;
        }

        const allowedValues = propSchema.enum as unknown[] | undefined;
        if (allowedValues && !allowedValues.includes(value)) {
          return `Invalid value for param '${field}': must be one of [${allowedValues.join(', ')}]`;
        }
      }
    }

    return null;
  }

  private valueMatchesType(value: unknown, expectedType: string): boolean {
    if (typeof value === expectedType) return true;
    if (expectedType === 'number' && typeof value === 'string') {
      return value.trim() !== '' && Number.isFinite(Number(value));
    }
    if (expectedType === 'boolean' && typeof value === 'string') {
      return value === 'true' || value === 'false';
    }
    return false;
  }
}
