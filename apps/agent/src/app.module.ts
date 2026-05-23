import { Module } from '@nestjs/common';
import { WsGateway } from './websocket/ws.gateway';
import { ClipboardService } from './clipboard/clipboard.service';
import { AiRouterService } from './ai/ai-router.service';
import { CommandService } from './command/command.service';
import { AppLaunchService } from './app-launch/app-launch.service';
import { AppRegistryService } from './app-launch/app-registry.service';
import { KeystrokeService } from './keystroke/keystroke.service';
import { AppSearchService } from './app-search/app-search.service';
import { LicenseModule } from './license/license.module';
import { NetworkModule } from './network/network.module';
import { ContextModule } from './context-profile/context.module';
import { MouseModule } from './mouse/mouse.module';
import { MediaModule } from './media/media.module';
import { PackRegistryService } from './packs/pack-registry.service';
import { IntegrationsModule } from './integrations/integrations.module';
import { ShellRunnerService } from './command/shell-runner.service';
import { ContextRuntimeModule } from './context/context-runtime.module';
import { ActiveWindowService } from './active-window/active-window.service';

@Module({
  imports: [
    LicenseModule,
    NetworkModule,
    ContextModule,
    MouseModule,
    MediaModule,
    IntegrationsModule,
    ContextRuntimeModule,
  ],
  providers: [
    WsGateway,
    ClipboardService,
    AiRouterService,
    CommandService,
    AppLaunchService,
    AppRegistryService,
    KeystrokeService,
    AppSearchService,
    PackRegistryService,
    ShellRunnerService,
    ActiveWindowService,
  ],
})
export class AppModule {}
