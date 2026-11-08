import { Module } from '@nestjs/common';
import {
  CardShareController,
  PublicTagsController,
} from './sharing.controller';
import { SharingService } from './sharing.service';

@Module({
  controllers: [CardShareController, PublicTagsController],
  providers: [SharingService],
})
export class SharingModule {}
