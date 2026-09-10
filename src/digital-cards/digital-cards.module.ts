import { Module } from '@nestjs/common';
import { DigitalCardsController } from './digital-cards.controller';
import { DigitalCardsService } from './digital-cards.service';

@Module({
  controllers: [DigitalCardsController],
  providers: [DigitalCardsService],
  exports: [DigitalCardsService],
})
export class DigitalCardsModule {}
