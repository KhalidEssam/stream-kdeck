import { Module } from '@nestjs/common';
import { MouseService } from './mouse.service';

@Module({
  providers: [MouseService],
  exports: [MouseService],
})
export class MouseModule {}
