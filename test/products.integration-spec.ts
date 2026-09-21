import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductsService } from '../src/products/products.service';
import { startTestDatabase, stopTestDatabase } from './setup-db';

describe('Products (integration, real postgres)', () => {
  let prisma: PrismaService;
  let products: ProductsService;

  beforeAll(async () => {
    await startTestDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    products = moduleRef.get(ProductsService);
    await prisma.$connect();
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  afterEach(async () => {
    await prisma.truncateAll();
  });

  const seedProduct = async () => {
    const brand = await prisma.brand.create({
      data: {
        id: 'brand-1',
        name: 'EcoBrand',
        logoUrl: 'https://example.com/logo.png',
      },
    });

    const product = await prisma.product.create({
      data: {
        id: 'prod-1',
        gtin: '00614141000418',
        sku: 'SKU-ECO-01',
        name: 'Eco Bottle',
        imageUrl: 'https://example.com/bottle.png',
        brandId: brand.id,
        sustainabilityInfo: {
          create: {
            carbonScoreGrams: 120,
            recyclabilityPercent: 95,
            verified: true,
          },
        },
      },
      include: { brand: true, sustainabilityInfo: true },
    });

    return { brand, product };
  };

  describe('findByGtin', () => {
    it('returns a product with brand and sustainability info by GTIN', async () => {
      await seedProduct();

      const result = await products.findByGtin('00614141000418');

      expect(result.id).toBe('prod-1');
      expect(result.name).toBe('Eco Bottle');
      expect(result.gtin).toBe('00614141000418');
      expect(result.sku).toBe('SKU-ECO-01');
      expect(result.brand.name).toBe('EcoBrand');
      expect(result.sustainabilityInfo?.carbonScoreGrams).toBe(120);
      expect(result.sustainabilityInfo?.recyclabilityPercent).toBe(95);
      expect(result.sustainabilityInfo?.verified).toBe(true);
    });

    it('throws NotFoundException when GTIN is unknown', async () => {
      await expect(
        products.findByGtin('00000000000000'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findBySku', () => {
    it('returns a product with brand and sustainability info by SKU', async () => {
      await seedProduct();

      const result = await products.findBySku('SKU-ECO-01');

      expect(result.id).toBe('prod-1');
      expect(result.sku).toBe('SKU-ECO-01');
      expect(result.gtin).toBe('00614141000418');
      expect(result.brand.name).toBe('EcoBrand');
    });

    it('throws NotFoundException when SKU is unknown', async () => {
      await expect(products.findBySku('UNKNOWN-SKU')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
