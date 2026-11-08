import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '../generated/prisma';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DigitalCardsService } from '../src/digital-cards/digital-cards.service';
import { startTestDatabase, stopTestDatabase } from './setup-db';

const USER = {
  id: '00000000-0000-4000-8000-0000000000cc',
  email: 'carduser@example.com',
  name: 'Card User',
  password: 'not-a-real-hash',
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

  const owner = { id: USER.id, role: Role.USER };

  describe('create', () => {
    it('creates and persists a card from a 13-digit scan', async () => {
      await seedProduct();

      const { card, created } = await digitalCards.create(
        USER.id,
        '0614141000418',
      );

      expect(created).toBe(true);
      expect(card.user).toEqual({ id: USER.id, name: USER.name });
      expect(card.product.gtin).toBe('00614141000418');
      expect(card.product.name).toBe('Reusable Bag');

      const persisted = await prisma.digitalCard.findUnique({
        where: { id: card.id },
      });
      expect(persisted?.userId).toBe(USER.id);
    });

    it('returns the existing card on a repeat scan, enforced by the unique index', async () => {
      await seedProduct();
      const first = await digitalCards.create(USER.id, '0614141000418');
      const second = await digitalCards.create(USER.id, '00614141000418');

      expect(second).toMatchObject({
        created: false,
        card: { id: first.card.id },
      });
      await expect(
        prisma.digitalCard.create({
          data: { userId: USER.id, productId: 'prod-card-1' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('throws NotFoundException for a valid but unknown GTIN', async () => {
      await expect(
        digitalCards.create(USER.id, '4006381333931'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findByUser', () => {
    it('returns all digital cards for a given user', async () => {
      await seedProduct();
      const { card } = await digitalCards.create(USER.id, '00614141000418');

      const results = await digitalCards.findByUser(USER.id);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(card.id);
    });

    it('returns an empty array when the user has no cards', async () => {
      await expect(digitalCards.findByUser(USER.id)).resolves.toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns the card to its owner and hides it from others', async () => {
      await seedProduct();
      const { card } = await digitalCards.create(USER.id, '00614141000418');

      await expect(digitalCards.findOne(card.id, owner)).resolves.toMatchObject(
        {
          id: card.id,
        },
      );
      await expect(
        digitalCards.findOne(card.id, {
          id: '00000000-0000-4000-8000-000000000099',
          role: Role.USER,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when card does not exist', async () => {
      await expect(
        digitalCards.findOne('00000000-0000-4000-8000-000000000099', owner),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
