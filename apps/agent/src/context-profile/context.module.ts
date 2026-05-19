import { Module } from '@nestjs/common';
import { ActiveWindowService } from '../active-window/active-window.service';
import { ContextProfileService } from './context-profile.service';
import { AiRouterService } from '../ai/ai-router.service';
import { LicenseModule } from '../license/license.module';

@Module({
  imports: [LicenseModule],
  providers: [ActiveWindowService, ContextProfileService, AiRouterService],
  exports: [ActiveWindowService, ContextProfileService],
})
export class ContextModule {}
