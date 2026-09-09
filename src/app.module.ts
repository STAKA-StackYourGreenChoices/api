import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { DigitalCardsModule } from './digital-cards/digital-cards.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    PrismaModule,
    HealthModule,
    OrdersModule,
    ProductsModule,
    DigitalCardsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
