import { Module } from '@nestjs/common';
import { WsGateway } from './websocket/ws.gateway';
import { ClipboardService } from './clipboard/clipboard.service';
import { AiRouterService } from './ai/ai-router.service';
import { CommandService } from './command/command.service';

@Module({
  providers: [WsGateway, ClipboardService, AiRouterService, CommandService],
})
export class AppModule {}
