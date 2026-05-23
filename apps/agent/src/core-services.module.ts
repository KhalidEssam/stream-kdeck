import { Global, Module } from '@nestjs/common';
import { ClipboardService } from './clipboard/clipboard.service';
import { ActiveWindowService } from './active-window/active-window.service';
import { ShellRunnerService } from './command/shell-runner.service';

@Global()
@Module({
  providers: [ClipboardService, ActiveWindowService, ShellRunnerService],
  exports: [ClipboardService, ActiveWindowService, ShellRunnerService],
})
export class CoreServicesModule {}
