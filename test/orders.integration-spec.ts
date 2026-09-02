import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
import { startTestDatabase, stopTestDatabase } from './setup-db';

const USER = {
  id: '00000000-0000-4000-8000-0000000000aa',
  email: 'integration@example.com',
  name: 'Integration User',
};

describe('Orders (integration, real postgres)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;

  beforeAll(async () => {
    await startTestDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    orders = moduleRef.get(OrdersService);
    await prisma.$connect();
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  // Truncate between tests rather than re-migrating.
  afterEach(async () => {
    await prisma.truncateAll();
  });

  beforeEach(async () => {
    await prisma.user.create({ data: USER });
  });

  it('persists an order and its items atomically', async () => {
    const created = await orders.create({
      userId: USER.id,
      items: [
        { sku: 'SKU-A', quantity: 2, unitPrice: 1500 },
        { sku: 'SKU-B', quantity: 1, unitPrice: 500 },
      ],
      discount: 250,
    });

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: true },
    });

    expect(stored.subtotal).toBe(3500);
    expect(stored.discount).toBe(250);
    expect(stored.items).toHaveLength(2);
    expect(created.total).toBe(3250);
  });

  it('rolls the whole write back when a foreign key is violated', async () => {
    const before = await prisma.orderItem.count();

    await expect(
      orders.create({
        userId: '00000000-0000-4000-8000-00000000ffff', // no such user
        items: [{ sku: 'SKU-A', quantity: 1, unitPrice: 100 }],
      }),
    ).rejects.toBeDefined();

    expect(await prisma.orderItem.count()).toBe(before);
    expect(await prisma.order.count()).toBe(0);
  });

  it('cascades item deletion when an order is removed', async () => {
    const created = await orders.create({
      userId: USER.id,
      items: [{ sku: 'SKU-A', quantity: 1, unitPrice: 100 }],
    });

    await prisma.order.delete({ where: { id: created.id } });

    expect(await prisma.orderItem.count()).toBe(0);
  });

  it('reads the total back through a real query, clamped at zero', async () => {
    const created = await orders.create({
      userId: USER.id,
      items: [{ sku: 'SKU-A', quantity: 1, unitPrice: 1000 }],
      discount: 5000,
    });

    await expect(orders.total(created.id)).resolves.toBe(0);
  });
});
