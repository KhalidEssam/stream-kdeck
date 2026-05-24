import { Global, Module } from '@nestjs/common';
import { ClipboardService } from './clipboard/clipboard.service';
import { ActiveWindowService } from './active-window/active-window.service';
import { ShellRunnerService } from './command/shell-runner.service';
import { TerminalCwdTrackerService } from './command/terminal-cwd-tracker.service';

@Global()
@Module({
  providers: [ClipboardService, ActiveWindowService, ShellRunnerService, TerminalCwdTrackerService],
  exports: [ClipboardService, ActiveWindowService, ShellRunnerService],
})
export class CoreServicesModule {}
