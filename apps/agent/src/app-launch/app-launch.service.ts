import { Injectable } from '@nestjs/common';
import { shell } from 'electron';
import { AppRegistryService } from './app-registry.service';

// Matches absolute Windows paths (C:\...) and Unix paths (/...)
const IS_ABSOLUTE_PATH = /^[A-Za-z]:[\\\/]|^\//;

@Injectable()
export class AppLaunchService {
  constructor(private readonly registry: AppRegistryService) {}

  async launch(appId: string): Promise<void> {
    const target = this.registry.resolveTarget(appId);
    if (IS_ABSOLUTE_PATH.test(target)) {
      // Absolute exe path — shell.openPath runs the executable directly
      const err = await shell.openPath(target);
      if (err) throw new Error(`Failed to launch ${appId}: ${err}`);
    } else {
      // Protocol (spotify://) or web URL — shell.openExternal hands to OS
      await shell.openExternal(target);
    }
  }

  async openUrl(url: string): Promise<void> {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error(`Invalid URL: must start with http:// or https://`);
    }
    await shell.openExternal(url);
  }
}
