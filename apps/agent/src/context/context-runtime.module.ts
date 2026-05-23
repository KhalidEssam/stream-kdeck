import { Module, OnModuleInit } from '@nestjs/common';
import { ContextRegistryService } from './context-registry.service';
import { ClipboardProvider } from './providers/clipboard.provider';
import { ActiveWindowProvider } from './providers/active-window.provider';
import { ActiveTerminalCwdProvider } from './providers/active-terminal-cwd.provider';

@Module({
  providers: [
    ContextRegistryService,
    ClipboardProvider,
    ActiveWindowProvider,
    ActiveTerminalCwdProvider,
  ],
  exports: [ContextRegistryService],
})
export class ContextRuntimeModule implements OnModuleInit {
  constructor(
    private readonly registry: ContextRegistryService,
    private readonly clipboardProvider: ClipboardProvider,
    private readonly activeWindowProvider: ActiveWindowProvider,
    private readonly activeTerminalCwdProvider: ActiveTerminalCwdProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.clipboardProvider);
    this.registry.register(this.activeWindowProvider);
    this.registry.register(this.activeTerminalCwdProvider);
  }
}
