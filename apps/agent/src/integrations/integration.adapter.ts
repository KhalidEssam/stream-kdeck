import { CommandResult } from '../command/command.service';

export interface IntegrationState {
  toolId?:   string;
  key:       string;
  value:     unknown;
  label?:    string;
  updatedAt: string;
}

export interface IntegrationAdapter {
  readonly pluginSlug: string;
  canExecute(actionId: string): boolean;
  execute(actionId: string, params: Record<string, unknown>): Promise<CommandResult>;
  getState?(): Promise<IntegrationState[]>;
}
