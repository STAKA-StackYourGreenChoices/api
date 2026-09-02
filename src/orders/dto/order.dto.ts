import { ApiProperty } from '@nestjs/swagger';

export class OrderItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() unitPrice!: number;
}

export class OrderDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ description: 'Sum of item lines, in minor units' })
  subtotal!: number;
  @ApiProperty() discount!: number;
  @ApiProperty({ description: 'subtotal - discount, clamped at zero' })
  total!: number;
  @ApiProperty({ enum: ['PENDING', 'PAID', 'CANCELLED'] })
  status!: string;
  @ApiProperty({ type: [OrderItemDto] })
  items!: OrderItemDto[];
}
