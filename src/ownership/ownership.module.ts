import { Module } from '@nestjs/common';
import {
  ClaimsController,
  CardOwnershipController,
} from './ownership.controller';
import { OwnershipService } from './ownership.service';
import { ReceiptStorageService } from './receipt-storage.service';

@Module({
  controllers: [CardOwnershipController, ClaimsController],
  providers: [OwnershipService, ReceiptStorageService],
})
export class OwnershipModule {}
