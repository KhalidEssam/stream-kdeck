import { Module, OnModuleInit } from '@nestjs/common';
import { ContextRegistryService } from './context-registry.service';
import { ClipboardProvider } from './providers/clipboard.provider';
import { ActiveWindowProvider } from './providers/active-window.provider';
import { ActiveTerminalCwdProvider } from './providers/active-terminal-cwd.provider';
import { ProjectWorkspaceProvider } from './providers/project-workspace.provider';
import { GitContextProvider } from './providers/git-context.provider';
import { MediaContextProvider } from './providers/media-context.provider';
import { ObsContextProvider } from './providers/obs-context.provider';
import { ConsentStoreService } from './consent-store.service';
import { ConsentRequestService } from './consent-request.service';
import { ContextAssemblerService } from './context-assembler.service';
import { ContextEvaluatorService } from './context-evaluator.service';
import { UserContextRequestService } from './user-context-request.service';
import { MediaModule } from '../media/media.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [MediaModule, IntegrationsModule],
  providers: [
    ContextRegistryService,
    ClipboardProvider,
    ActiveWindowProvider,
    ActiveTerminalCwdProvider,
    ProjectWorkspaceProvider,
    GitContextProvider,
    MediaContextProvider,
    ObsContextProvider,
    ConsentStoreService,
    ConsentRequestService,
    ContextAssemblerService,
    ContextEvaluatorService,
    UserContextRequestService,
  ],
  exports: [
    ContextRegistryService,
    ConsentRequestService,
    ContextAssemblerService,
    ContextEvaluatorService,
    UserContextRequestService,
  ],
})
export class ContextRuntimeModule implements OnModuleInit {
  constructor(
    private readonly registry: ContextRegistryService,
    private readonly clipboardProvider: ClipboardProvider,
    private readonly activeWindowProvider: ActiveWindowProvider,
    private readonly activeTerminalCwdProvider: ActiveTerminalCwdProvider,
    private readonly projectWorkspaceProvider: ProjectWorkspaceProvider,
    private readonly gitContextProvider: GitContextProvider,
    private readonly mediaContextProvider: MediaContextProvider,
    private readonly obsContextProvider: ObsContextProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.clipboardProvider);
    this.registry.register(this.activeWindowProvider);
    this.registry.register(this.activeTerminalCwdProvider);
    this.registry.register(this.projectWorkspaceProvider);
    this.registry.register(this.gitContextProvider);
    this.registry.register(this.mediaContextProvider);
    this.registry.register(this.obsContextProvider);
  }
}
