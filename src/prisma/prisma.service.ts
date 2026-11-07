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

  async truncateAll(): Promise<void> {
    await this.$executeRawUnsafe(
      'TRUNCATE TABLE "DigitalCard", "SustainabilityInfo", "OrderItem", "Order", "Product", "Brand", "User" RESTART IDENTITY CASCADE',
    );
  }
}
