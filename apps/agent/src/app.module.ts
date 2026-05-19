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

@Module({
  imports: [LicenseModule, NetworkModule, ContextModule, MouseModule],
  providers: [
    WsGateway,
    ClipboardService,
    AiRouterService,
    CommandService,
    AppLaunchService,
    AppRegistryService,
    KeystrokeService,
    AppSearchService,
  ],
})
export class AppModule {}
