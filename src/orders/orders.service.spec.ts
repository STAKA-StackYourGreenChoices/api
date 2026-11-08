import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OrdersService (unit)', () => {
  let service: OrdersService;

  const prisma = {
    order: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [OrdersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(OrdersService);
    jest.resetAllMocks();
  });

  describe('computeTotal', () => {
    it('subtracts the discount from the subtotal', () => {
      expect(OrdersService.computeTotal(1000, 250)).toBe(750);
    });

    it('clamps at zero when the discount exceeds the subtotal', () => {
      expect(OrdersService.computeTotal(1000, 1500)).toBe(0);
    });

    it('returns the subtotal when there is no discount', () => {
      expect(OrdersService.computeTotal(1000, 0)).toBe(1000);
    });
  });

  describe('total', () => {
    it('clamps the total at zero when the discount exceeds the subtotal', async () => {
      prisma.order.findUnique.mockResolvedValue({
        subtotal: 1000,
        discount: 1500,
      });
      await expect(service.total('order-1')).resolves.toBe(0);
    });

    it('throws NotFound for an unknown order', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.total('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('derives the subtotal from quantity x unit price across all lines', async () => {
      prisma.order.create.mockImplementation((args: any) => ({
        id: 'order-1',
        userId: args.data.userId,
        subtotal: args.data.subtotal,
        discount: args.data.discount,
        status: 'PENDING',
        items: [],
      }));

      const result = await service.create(
        '00000000-0000-4000-8000-000000000001',
        {
          items: [
            { sku: 'A', quantity: 2, unitPrice: 1500 },
            { sku: 'B', quantity: 3, unitPrice: 100 },
          ],
        },
      );

      expect(result.subtotal).toBe(3300);
      expect(result.total).toBe(3300);
    });

    it('defaults the discount to zero when omitted', async () => {
      prisma.order.create.mockResolvedValue({
        id: 'order-1',
        userId: 'u',
        subtotal: 100,
        discount: 0,
        status: 'PENDING',
        items: [],
      });

      await service.create('00000000-0000-4000-8000-000000000001', {
        items: [{ sku: 'A', quantity: 1, unitPrice: 100 }],
      });

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ discount: 0 }),
        }),
      );
    });
  });
});
