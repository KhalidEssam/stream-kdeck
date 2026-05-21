import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { IconService } from './icon.service';

@Module({
  providers: [MediaService, IconService],
  exports: [MediaService, IconService],
})
export class MediaModule {}
