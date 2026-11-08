import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { newSlug, SharingService } from './sharing.service';

describe('SharingService (unit)', () => {
  const prisma = {
    digitalCard: { findUnique: jest.fn() },
    shareLink: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    ownershipClaim: { findFirst: jest.fn() },
  };
  const owner = { id: 'user-1', role: Role.USER };
  const stranger = { id: 'user-2', role: Role.USER };
  let service: SharingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SharingService(prisma as unknown as PrismaService);
  });

  describe('share', () => {
    it('only verified owners can share', async () => {
      prisma.digitalCard.findUnique.mockResolvedValue({
        userId: 'user-1',
        ownershipVerifiedAt: null,
        shareLink: null,
      });
      await expect(service.share('card-1', owner)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.share('card-1', stranger)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.shareLink.upsert).not.toHaveBeenCalled();
    });

    it('reuses a live link instead of issuing a new one', async () => {
      const createdAt = new Date();
      prisma.digitalCard.findUnique.mockResolvedValue({
        userId: 'user-1',
        ownershipVerifiedAt: new Date(),
        shareLink: { slug: 'abc', createdAt, revokedAt: null },
      });

      await expect(service.share('card-1', owner)).resolves.toEqual({
        slug: 'abc',
        createdAt,
      });
      expect(prisma.shareLink.upsert).not.toHaveBeenCalled();
    });

    it('issues a fresh slug after a revoke, so the old link stays dead', async () => {
      prisma.digitalCard.findUnique.mockResolvedValue({
        userId: 'user-1',
        ownershipVerifiedAt: new Date(),
        shareLink: {
          slug: 'old',
          createdAt: new Date(),
          revokedAt: new Date(),
        },
      });
      prisma.shareLink.upsert.mockImplementation(
        ({ update }: { update: { slug: string } }) =>
          Promise.resolve({ slug: update.slug, createdAt: new Date() }),
      );

      const link = await service.share('card-1', owner);

      expect(link.slug).not.toBe('old');
      expect(link.slug).toMatch(/^[A-Za-z0-9]{12}$/);
    });
  });

  describe('publicTag', () => {
    const product = {
      id: 'p1',
      gtin: '00614141000418',
      sku: 'S',
      name: 'Tee',
      description: null,
      imageUrl: null,
      brandId: 'b',
      createdAt: new Date(),
      updatedAt: new Date(),
      brand: {
        id: 'b',
        name: 'Brand',
        description: null,
        logoUrl: null,
        createdAt: new Date(),
      },
      sustainabilityInfo: null,
    };
    const link = (overrides: Record<string, unknown> = {}) => ({
      slug: 'abc',
      revokedAt: null,
      createdAt: new Date(),
      card: {
        userId: 'user-1',
        productId: 'p1',
        ownershipVerifiedAt: new Date(),
        product,
        user: { name: 'Demo User', deletedAt: null },
      },
      ...overrides,
    });

    it('shows only the first name of the owner', async () => {
      prisma.shareLink.findUnique.mockResolvedValue(link());
      prisma.ownershipClaim.findFirst.mockResolvedValue({ method: 'RECEIPT' });

      const tag = await service.publicTag('abc');

      expect(tag.ownerFirstName).toBe('Demo');
      expect(JSON.stringify(tag)).not.toContain('User');
      expect(tag.verifiedBy).toBe('RECEIPT');
    });

    it('is gone once revoked', async () => {
      prisma.shareLink.findUnique.mockResolvedValue(
        link({ revokedAt: new Date() }),
      );
      await expect(service.publicTag('abc')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('is gone for an unknown slug', async () => {
      prisma.shareLink.findUnique.mockResolvedValue(null);
      await expect(service.publicTag('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('slugs are random and use unambiguous characters', () => {
    const slugs = new Set(Array.from({ length: 200 }, newSlug));
    expect(slugs.size).toBe(200);
    for (const slug of slugs) expect(slug).not.toMatch(/[0O1lI]/);
  });
});
