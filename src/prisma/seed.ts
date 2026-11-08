/**
 * Local demo data. Safe to re-run: every write is an upsert on a fixed key.
 *
 * Sign-in accounts (local development only):
 *   demo@example.com   / StakaDemo123!   (USER)
 *   admin@example.com  / StakaAdmin123!  (ADMIN)
 *
 * Every product GTIN below is a valid EAN-13, so it can be printed as a
 * barcode and scanned from the web app.
 */
import * as bcrypt from 'bcryptjs';
import { OrderStatus, PrismaClient, Role } from '../../generated/prisma';
import { gtinCheckDigit } from '../products/gtin';

const prisma = new PrismaClient();

const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000002';
const ORDER_ID = '00000000-0000-4000-8000-000000000101';
const CARD_ID = '00000000-0000-4000-8000-000000000401';

/** Builds a valid EAN-13 from its first 12 digits. */
const ean13 = (body: string) => body + String(gtinCheckDigit(body));
/** The stored, 14-digit form. */
const gtin14 = (ean: string) => ean.padStart(14, '0');

const BRANDS = [
  {
    id: '00000000-0000-4000-8000-000000000201',
    name: 'GreenCo',
    description: 'Sustainable everyday products for a greener planet.',
  },
  {
    id: '00000000-0000-4000-8000-000000000202',
    name: 'Terra Threads',
    description:
      'Clothing made from organic and recycled fibres, sewn in audited factories.',
  },
  {
    id: '00000000-0000-4000-8000-000000000203',
    name: 'Loop Footwear',
    description: 'Shoes designed to be resoled, returned and recycled.',
  },
];

interface SeedProduct {
  id: string;
  ean: string;
  sku: string;
  name: string;
  description: string;
  brand: number;
  carbon: number;
  recyclability: number;
  certifier?: string;
}

const PRODUCTS: SeedProduct[] = [
  {
    id: '00000000-0000-4000-8000-000000000301',
    ean: '0614141000418',
    sku: 'SKU-ECO-01',
    name: 'Eco Bottle 500ml',
    description:
      'Double-walled stainless steel bottle that replaces single-use plastic.',
    brand: 0,
    carbon: 120,
    recyclability: 95,
    certifier: 'Cradle to Cradle',
  },
  {
    id: '00000000-0000-4000-8000-000000000302',
    ean: ean13('890123450001'),
    sku: 'TT-TEE-ORG-M',
    name: 'Organic Cotton Tee',
    description: 'Heavyweight tee in 100% GOTS-certified organic cotton.',
    brand: 1,
    carbon: 2100,
    recyclability: 80,
    certifier: 'Global Organic Textile Standard',
  },
  {
    id: '00000000-0000-4000-8000-000000000303',
    ean: ean13('890123450002'),
    sku: 'TT-JEAN-REC-32',
    name: 'Recycled Denim Jeans',
    description: 'Straight-leg jeans woven from 40% recycled denim.',
    brand: 1,
    carbon: 9800,
    recyclability: 70,
  },
  {
    id: '00000000-0000-4000-8000-000000000304',
    ean: ean13('890123450003'),
    sku: 'TT-SWTR-MER-L',
    name: 'Merino Wool Sweater',
    description: 'Mulesing-free merino knit that lasts for years.',
    brand: 1,
    carbon: 7400,
    recyclability: 85,
    certifier: 'Responsible Wool Standard',
  },
  {
    id: '00000000-0000-4000-8000-000000000305',
    ean: ean13('890123450004'),
    sku: 'TT-LINEN-SHIRT-M',
    name: 'Linen Overshirt',
    description: 'European flax linen, garment-dyed with low-impact dyes.',
    brand: 1,
    carbon: 3200,
    recyclability: 90,
  },
  {
    id: '00000000-0000-4000-8000-000000000306',
    ean: ean13('890123450005'),
    sku: 'LF-SNK-HEMP-42',
    name: 'Hemp Canvas Sneakers',
    description:
      'Hemp upper on a natural rubber sole you can send back for resoling.',
    brand: 2,
    carbon: 6100,
    recyclability: 65,
    certifier: 'B Corp',
  },
  {
    id: '00000000-0000-4000-8000-000000000307',
    ean: ean13('890123450006'),
    sku: 'LF-SANDAL-CORK-40',
    name: 'Cork Footbed Sandals',
    description: 'Natural cork footbed and vegetable-tanned straps.',
    brand: 2,
    carbon: 2900,
    recyclability: 75,
  },
];

/** Product illustrations served by the web app (web/public/catalog-images). */
const WEB_APP_URL = (
  process.env.WEB_APP_URL ?? 'http://localhost:3000'
).replace(/\/+$/, '');
const IMAGES: Record<string, string> = {
  'SKU-ECO-01': 'eco-bottle.svg',
  'TT-TEE-ORG-M': 'organic-cotton-tee.svg',
  'TT-JEAN-REC-32': 'recycled-denim-jeans.svg',
  'TT-SWTR-MER-L': 'merino-wool-sweater.svg',
  'TT-LINEN-SHIRT-M': 'linen-overshirt.svg',
  'LF-SNK-HEMP-42': 'hemp-canvas-sneakers.svg',
  'LF-SANDAL-CORK-40': 'cork-footbed-sandals.svg',
};
const productImage = (sku: string) =>
  `${WEB_APP_URL}/catalog-images/${IMAGES[sku]}`;

async function main() {
  const [demoHash, adminHash] = await Promise.all([
    bcrypt.hash('StakaDemo123!', 10),
    bcrypt.hash('StakaAdmin123!', 10),
  ]);

  const user = await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: { password: demoHash, emailVerified: true },
    create: {
      id: DEMO_USER_ID,
      email: 'demo@example.com',
      name: 'Demo User',
      password: demoHash,
      emailVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { id: ADMIN_USER_ID },
    update: { password: adminHash, role: Role.ADMIN, emailVerified: true },
    create: {
      id: ADMIN_USER_ID,
      email: 'admin@example.com',
      name: 'STAKA Admin',
      password: adminHash,
      role: Role.ADMIN,
      emailVerified: true,
    },
  });

  for (const brand of BRANDS) {
    await prisma.brand.upsert({
      where: { id: brand.id },
      update: { name: brand.name, description: brand.description },
      create: {
        ...brand,
        logoUrl: `https://placehold.co/200x200/2F5D3A/F6F3EC/png?text=${encodeURIComponent(brand.name[0])}`,
      },
    });
  }

  for (const product of PRODUCTS) {
    const sustainability = {
      carbonScoreGrams: product.carbon,
      recyclabilityPercent: product.recyclability,
      verified: Boolean(product.certifier),
      verifiedAt: product.certifier ? new Date('2026-01-15') : null,
      certifierName: product.certifier ?? null,
    };
    const fields = {
      gtin: gtin14(product.ean),
      sku: product.sku,
      name: product.name,
      description: product.description,
      imageUrl: productImage(product.sku),
      brandId: BRANDS[product.brand].id,
    };
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        ...fields,
        sustainabilityInfo: {
          upsert: { create: sustainability, update: sustainability },
        },
      },
      create: {
        id: product.id,
        ...fields,
        sustainabilityInfo: { create: sustainability },
      },
    });
  }

  // A paid order for the demo user. Phase 4 matches ownership claims against
  // orders like this one (same user, same SKU).
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
          { sku: 'TT-TEE-ORG-M', quantity: 1, unitPrice: 2500 },
          { sku: 'LF-SNK-HEMP-42', quantity: 1, unitPrice: 2000 },
        ],
      },
    },
  });

  await prisma.digitalCard.upsert({
    where: { id: CARD_ID },
    update: {},
    create: {
      id: CARD_ID,
      userId: user.id,
      productId: PRODUCTS[0].id,
    },
  });

  console.log(
    `Seed complete: 2 users, ${BRANDS.length} brands, ${PRODUCTS.length} products, 1 order, 1 card.`,
  );
  console.table(
    PRODUCTS.map((product) => ({ name: product.name, barcode: product.ean })),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
