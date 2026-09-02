import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A discount larger than the subtotal must never produce a negative total —
   * that would refund money on checkout.
   */
  static computeTotal(subtotal: number, discount: number): number {
    return Math.max(0, subtotal - discount);
  }

  async total(id: string): Promise<number> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { subtotal: true, discount: true },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return OrdersService.computeTotal(order.subtotal, order.discount);
  }

  async create(dto: CreateOrderDto) {
    const subtotal = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );

    // A single transaction: an order and its items are created atomically, so a
    // failure halfway through can never leave a headless order row behind.
    const order = await this.prisma.order.create({
      data: {
        userId: dto.userId,
        subtotal,
        discount: dto.discount ?? 0,
        items: {
          create: dto.items.map((item) => ({
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
      include: { items: true },
    });

    return this.present(order);
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return this.present(order);
  }

  async findAll() {
    const orders = await this.prisma.order.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((order) => this.present(order));
  }

  private present(order: {
    id: string;
    userId: string;
    subtotal: number;
    discount: number;
    status: string;
    items: {
      id: string;
      sku: string;
      quantity: number;
      unitPrice: number;
    }[];
  }) {
    return {
      id: order.id,
      userId: order.userId,
      subtotal: order.subtotal,
      discount: order.discount,
      total: OrdersService.computeTotal(order.subtotal, order.discount),
      status: order.status,
      items: order.items.map((item) => ({
        id: item.id,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    };
  }
}
