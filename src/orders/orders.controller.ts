import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/request-user';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderDto } from './dto/order.dto';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOkResponse({ type: [OrderDto] })
  findAll(@CurrentUser() user: RequestUser) {
    return this.orders.findAll(user);
  }

  @Get(':id')
  @ApiOkResponse({ type: OrderDto })
  @ApiNotFoundResponse()
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.findOne(id, user);
  }

  @Post()
  @ApiCreatedResponse({ type: OrderDto })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.id, dto);
  }
}
