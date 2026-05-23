import { Module, OnModuleInit } from '@nestjs/common';
import { ContextRegistryService } from './context-registry.service';
import { ClipboardProvider } from './providers/clipboard.provider';
import { ActiveWindowProvider } from './providers/active-window.provider';
import { ActiveTerminalCwdProvider } from './providers/active-terminal-cwd.provider';
import { ProjectWorkspaceProvider } from './providers/project-workspace.provider';
import { GitContextProvider } from './providers/git-context.provider';

@Module({
  providers: [
    ContextRegistryService,
    ClipboardProvider,
    ActiveWindowProvider,
    ActiveTerminalCwdProvider,
    ProjectWorkspaceProvider,
    GitContextProvider,
  ],
  exports: [ContextRegistryService],
})
export class ContextRuntimeModule implements OnModuleInit {
  constructor(
    private readonly registry: ContextRegistryService,
    private readonly clipboardProvider: ClipboardProvider,
    private readonly activeWindowProvider: ActiveWindowProvider,
    private readonly activeTerminalCwdProvider: ActiveTerminalCwdProvider,
    private readonly projectWorkspaceProvider: ProjectWorkspaceProvider,
    private readonly gitContextProvider: GitContextProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.clipboardProvider);
    this.registry.register(this.activeWindowProvider);
    this.registry.register(this.activeTerminalCwdProvider);
    this.registry.register(this.projectWorkspaceProvider);
    this.registry.register(this.gitContextProvider);
  }
}
