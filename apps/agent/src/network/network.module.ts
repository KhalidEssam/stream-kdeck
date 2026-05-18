import { Module } from '@nestjs/common';
import { MdnsService } from './mdns.service';

@Module({
  providers: [MdnsService],
})
export class NetworkModule {}
