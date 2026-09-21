import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DigitalCardsService } from '../src/digital-cards/digital-cards.service';
import { startTestDatabase, stopTestDatabase } from './setup-db';

const USER = {
  id: '00000000-0000-4000-8000-0000000000cc',
  email: 'carduser@example.com',
  name: 'Card User',
};

describe('DigitalCards (integration, real postgres)', () => {
  let prisma: PrismaService;
  let digitalCards: DigitalCardsService;

  beforeAll(async () => {
    await startTestDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    digitalCards = moduleRef.get(DigitalCardsService);
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
        id: 'brand-card-1',
        name: 'GreenBrand',
      },
    });

    return prisma.product.create({
      data: {
        id: 'prod-card-1',
        gtin: '00614141000418',
        sku: 'SKU-CARD-01',
        name: 'Reusable Bag',
        brandId: brand.id,
        sustainabilityInfo: {
          create: {
            carbonScoreGrams: 50,
            recyclabilityPercent: 100,
            verified: true,
          },
        },
      },
    });
  };

  beforeEach(async () => {
    await prisma.user.create({ data: USER });
  });

  describe('create', () => {
    it('creates and persists a digital card for a valid user and GTIN', async () => {
      await seedProduct();

      const created = await digitalCards.create({
        userId: USER.id,
        gtin: '00614141000418',
      });

      expect(created.id).toBeDefined();
      expect(created.user.id).toBe(USER.id);
      expect(created.product.gtin).toBe('00614141000418');
      expect(created.product.name).toBe('Reusable Bag');

      const persisted = await prisma.digitalCard.findUnique({
        where: { id: created.id },
      });
      expect(persisted).not.toBeNull();
      expect(persisted?.userId).toBe(USER.id);
    });

    it('throws NotFoundException for an unknown GTIN', async () => {
      await expect(
        digitalCards.create({
          userId: USER.id,
          gtin: '99999999999999',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for an unknown user', async () => {
      await seedProduct();

      await expect(
        digitalCards.create({
          userId: '00000000-0000-4000-8000-000000000099',
          gtin: '00614141000418',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findByUser', () => {
    it('returns all digital cards for a given user', async () => {
      await seedProduct();
      const card = await digitalCards.create({
        userId: USER.id,
        gtin: '00614141000418',
      });

      const results = await digitalCards.findByUser(USER.id);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(card.id);
      expect(results[0].product.name).toBe('Reusable Bag');
    });

    it('returns an empty array when the user has no cards', async () => {
      const results = await digitalCards.findByUser(USER.id);
      expect(results).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns the digital card by ID', async () => {
      await seedProduct();
      const created = await digitalCards.create({
        userId: USER.id,
        gtin: '00614141000418',
      });

      const found = await digitalCards.findOne(created.id);
      expect(found.id).toBe(created.id);
      expect(found.product.gtin).toBe('00614141000418');
    });

    it('throws NotFoundException when card does not exist', async () => {
      await expect(
        digitalCards.findOne('00000000-0000-4000-8000-000000000099'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
