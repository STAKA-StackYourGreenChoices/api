import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Wipes every table. Used by the integration suite between tests —
   * TRUNCATE is orders of magnitude faster than re-running migrations.
   */
  async truncateAll(): Promise<void> {
    await this.$executeRawUnsafe(
      'TRUNCATE TABLE "OrderItem", "Order", "User" RESTART IDENTITY CASCADE',
    );
  }
}
