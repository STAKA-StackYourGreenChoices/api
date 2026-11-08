import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '../../generated/prisma';
import { DigitalCardsService } from './digital-cards.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DigitalCardsService (unit)', () => {
  let service: DigitalCardsService;

  const prisma = {
    product: { findUnique: jest.fn() },
    digitalCard: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    ownershipClaim: { findMany: jest.fn() },
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
    prisma.ownershipClaim.findMany.mockResolvedValue([]);
  });

  const owner = { id: '00000000-0000-4000-8000-000000000001', role: Role.USER };
  const stranger = {
    id: '00000000-0000-4000-8000-000000000002',
    role: Role.USER,
  };
  const admin = {
    id: '00000000-0000-4000-8000-000000000003',
    role: Role.ADMIN,
  };

  const mockProduct = {
    id: 'prod-1',
    gtin: '00614141000418',
    sku: 'SKU-ECO-01',
    name: 'Eco Bottle',
    description: null,
    imageUrl: null,
    brandId: 'brand-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    brand: {
      id: 'brand-1',
      name: 'GreenCo',
      description: null,
      logoUrl: null,
      createdAt: new Date('2026-01-01'),
    },
    sustainabilityInfo: {
      id: 'si-1',
      productId: 'prod-1',
      carbonScoreGrams: 120,
      recyclabilityPercent: 95,
      verified: true,
      verifiedAt: null,
      certifierName: 'GRS',
      updatedAt: new Date('2026-01-01'),
    },
  };

  const mockCard = {
    id: 'card-1',
    userId: owner.id,
    productId: 'prod-1',
    ownershipVerifiedAt: null,
    createdAt: new Date('2026-01-01'),
    product: mockProduct,
    user: { id: owner.id, name: 'Demo User' },
  };

  describe('create', () => {
    it('creates a card for the signed-in user from an EAN-13 scan', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      prisma.digitalCard.findUnique.mockResolvedValue(null);
      prisma.digitalCard.create.mockResolvedValue(mockCard);

      const result = await service.create(owner.id, '0614141000418');

      expect(prisma.product.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { gtin: '00614141000418' } }),
      );
      expect(prisma.digitalCard.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { productId: 'prod-1', userId: owner.id },
        }),
      );
      expect(result.created).toBe(true);
      expect(result.card.product.sustainabilityInfo?.certifierName).toBe('GRS');
    });

    it('never exposes the owner email on a card', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      prisma.digitalCard.findUnique.mockResolvedValue(null);
      prisma.digitalCard.create.mockResolvedValue(mockCard);

      const { card } = await service.create(owner.id, '0614141000418');

      expect(card.user).toEqual({ id: owner.id, name: 'Demo User' });
    });

    it('returns the existing card instead of creating a duplicate', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      prisma.digitalCard.findUnique.mockResolvedValue(mockCard);

      const result = await service.create(owner.id, '00614141000418');

      expect(result).toMatchObject({ created: false, card: { id: 'card-1' } });
      expect(prisma.digitalCard.create).not.toHaveBeenCalled();
    });

    it('returns the winning card when two scans race on the unique key', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      prisma.digitalCard.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockCard);
      prisma.digitalCard.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const result = await service.create(owner.id, '0614141000418');

      expect(result).toMatchObject({ created: false, card: { id: 'card-1' } });
    });

    it('rejects a malformed GTIN before touching the database', async () => {
      await expect(
        service.create(owner.id, '0614141000419'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.product.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a valid but unknown GTIN', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.create(owner.id, '4006381333931'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('returns the card to its owner', async () => {
      prisma.digitalCard.findUnique.mockResolvedValue(mockCard);

      const result = await service.findOne('card-1', owner);

      expect(result.id).toBe('card-1');
      expect(result.product.name).toBe('Eco Bottle');
    });

    it('returns any card to an admin', async () => {
      prisma.digitalCard.findUnique.mockResolvedValue(mockCard);

      await expect(service.findOne('card-1', admin)).resolves.toMatchObject({
        id: 'card-1',
      });
    });

    it("hides another user's card behind a 404", async () => {
      prisma.digitalCard.findUnique.mockResolvedValue(mockCard);

      await expect(service.findOne('card-1', stranger)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException for an unknown card id', async () => {
      prisma.digitalCard.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing', owner)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('ownership', () => {
    it('reports a new card as unverified with 5 receipt uploads left', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      prisma.digitalCard.findUnique.mockResolvedValue(null);
      prisma.digitalCard.create.mockResolvedValue(mockCard);

      const { card } = await service.create(owner.id, '0614141000418');

      expect(card.ownership).toEqual({
        status: 'UNVERIFIED',
        receiptAttemptsUsed: 0,
        receiptAttemptsLeft: 5,
      });
    });

    it("groups the user's claims per product in a single query", async () => {
      prisma.digitalCard.findMany.mockResolvedValue([
        mockCard,
        { ...mockCard, id: 'card-2', productId: 'prod-2' },
      ]);
      prisma.ownershipClaim.findMany.mockResolvedValue([
        {
          productId: 'prod-2',
          method: 'RECEIPT',
          status: 'PENDING',
          rejectionReason: null,
          reviewedAt: null,
          createdAt: new Date(),
        },
      ]);

      const cards = await service.findByUser(owner.id);

      expect(prisma.ownershipClaim.findMany).toHaveBeenCalledTimes(1);
      expect(cards.map((card) => card.ownership.status)).toEqual([
        'UNVERIFIED',
        'PENDING',
      ]);
    });

    it('treats a card stamped as verified as verified', async () => {
      prisma.digitalCard.findUnique.mockResolvedValue({
        ...mockCard,
        ownershipVerifiedAt: new Date('2026-02-01'),
      });

      const card = await service.findOne('card-1', owner);

      expect(card.ownership.status).toBe('VERIFIED');
    });
  });

  describe('findByUser', () => {
    it('returns all cards for a user ordered by newest first', async () => {
      prisma.digitalCard.findMany.mockResolvedValue([mockCard]);

      const result = await service.findByUser(owner.id);

      expect(result).toHaveLength(1);
      expect(prisma.digitalCard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: owner.id },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('returns an empty array when the user has no cards', async () => {
      prisma.digitalCard.findMany.mockResolvedValue([]);

      await expect(service.findByUser(owner.id)).resolves.toEqual([]);
    });
  });
});
