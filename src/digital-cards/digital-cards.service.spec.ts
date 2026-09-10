import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DigitalCardsService } from './digital-cards.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DigitalCardsService (unit)', () => {
  let service: DigitalCardsService;

  const prisma = {
    product: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    digitalCard: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DigitalCardsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(DigitalCardsService);
    jest.resetAllMocks();
  });

  const mockProduct = {
    id: 'prod-1',
    gtin: '00614141000418',
    sku: 'SKU-ECO-01',
    name: 'Eco Bottle',
    imageUrl: null,
    brand: { id: 'brand-1', name: 'GreenCo', logoUrl: null },
    sustainabilityInfo: {
      carbonScoreGrams: 120,
      recyclabilityPercent: 95,
      verified: true,
      verifiedAt: null,
    },
  };

  const mockUser = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Demo User',
    email: 'demo@example.com',
  };

  const mockCard = {
    id: 'card-1',
    createdAt: new Date('2026-01-01'),
    product: mockProduct,
    user: mockUser,
  };

  describe('create', () => {
    it('returns a digital card when GTIN and user are valid', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.digitalCard.create.mockResolvedValue(mockCard);

      const result = await service.create({
        userId: mockUser.id,
        gtin: mockProduct.gtin,
      });

      expect(result.id).toBe('card-1');
      expect(result.product.gtin).toBe('00614141000418');
      expect(result.user.name).toBe('Demo User');
    });

    it('throws NotFoundException for an unknown GTIN', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ userId: mockUser.id, gtin: 'UNKNOWN' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ userId: 'missing-uuid', gtin: mockProduct.gtin }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('returns the card when found', async () => {
      prisma.digitalCard.findUnique.mockResolvedValue(mockCard);

      const result = await service.findOne('card-1');

      expect(result.id).toBe('card-1');
      expect(result.product.name).toBe('Eco Bottle');
    });

    it('throws NotFoundException for an unknown card id', async () => {
      prisma.digitalCard.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findByUser', () => {
    it('returns all cards for a user ordered by newest first', async () => {
      prisma.digitalCard.findMany.mockResolvedValue([mockCard]);

      const result = await service.findByUser(mockUser.id);

      expect(result).toHaveLength(1);
      expect(result[0].user.id).toBe(mockUser.id);
    });

    it('returns an empty array when the user has no cards', async () => {
      prisma.digitalCard.findMany.mockResolvedValue([]);

      const result = await service.findByUser(mockUser.id);

      expect(result).toEqual([]);
    });
  });
});
