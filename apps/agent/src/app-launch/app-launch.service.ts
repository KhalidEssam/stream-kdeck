import { Injectable } from '@nestjs/common';
import { shell } from 'electron';
import { AppRegistryService } from './app-registry.service';

@Injectable()
export class AppLaunchService {
  constructor(private readonly registry: AppRegistryService) {}

  async launch(appId: string): Promise<void> {
    const target = this.registry.resolveTarget(appId);
    await shell.openExternal(target);
  }

  async openUrl(url: string): Promise<void> {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error(`Invalid URL: must start with http:// or https://`);
    }
    await shell.openExternal(url);
  }
}
