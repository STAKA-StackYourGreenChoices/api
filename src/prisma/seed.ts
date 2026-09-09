import { PrismaClient, OrderStatus } from '../../generated/prisma';

const prisma = new PrismaClient();

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ORDER_ID = '00000000-0000-4000-8000-000000000101';
const BRAND_ID = '00000000-0000-4000-8000-000000000201';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000301';
const CARD_ID = '00000000-0000-4000-8000-000000000401';

async function main() {
  const user = await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: { id: USER_ID, email: 'demo@example.com', name: 'Demo User' },
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

  const brand = await prisma.brand.upsert({
    where: { id: BRAND_ID },
    update: {},
    create: {
      id: BRAND_ID,
      name: 'GreenCo',
      description: 'Sustainable products for a greener planet.',
      logoUrl: 'https://placehold.co/100x100?text=GreenCo',
    },
  });

  const product = await prisma.product.upsert({
    where: { id: PRODUCT_ID },
    update: {},
    create: {
      id: PRODUCT_ID,
      gtin: '00614141000418',
      sku: 'SKU-ECO-01',
      name: 'Eco Bottle 500ml',
      imageUrl: 'https://placehold.co/400x400?text=EcoBottle',
      brandId: brand.id,
      sustainabilityInfo: {
        create: {
          carbonScoreGrams: 120,
          recyclabilityPercent: 95,
          verified: true,
          verifiedAt: new Date('2026-01-15'),
        },
      },
    },
  });

  await prisma.digitalCard.upsert({
    where: { id: CARD_ID },
    update: {},
    create: {
      id: CARD_ID,
      userId: user.id,
      productId: product.id,
    },
  });

  console.log('Seed complete: 1 user, 1 order, 1 brand, 1 product, 1 digital card.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
