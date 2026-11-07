/**
 * Deterministic seed data for preview environments and local development.
 *
 * IDs are fixed on purpose: Playwright and Flutter fixtures hard-code them, so
 * the dataset must be byte-identical on every run. Never seed a preview from a
 * production dump — see §5.5 of the DevOps playbook.
 */
import { PrismaClient, OrderStatus } from '../../generated/prisma';

const prisma = new PrismaClient();

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ORDER_ID = '00000000-0000-4000-8000-000000000101';
const DEMO_PASSWORD_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

async function main() {
  const user = await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: {
      id: USER_ID,
      email: 'demo@example.com',
      name: 'Demo User',
      password: DEMO_PASSWORD_HASH,
    },
  });

  await prisma.order.upsert({
    where: { id: ORDER_ID },
    update: {},
    create: {
      id: ORDER_ID,
      userId: user.id,
      subtotal: 4500,
      discount: 500,
      status: OrderStatus.PAID,
      items: {
        create: [
          { sku: 'SKU-ALPHA', quantity: 2, unitPrice: 1500 },
          { sku: 'SKU-BETA', quantity: 1, unitPrice: 1500 },
        ],
      },
    },
  });

  console.log('Seed complete: 1 user, 1 order, 2 items.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
