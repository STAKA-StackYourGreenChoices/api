import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ClaimMethod, ClaimStatus, Role } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from './ownership.service';
import { ReceiptStorageService } from './receipt-storage.service';

describe('OwnershipService (unit)', () => {
  const prisma = {
    digitalCard: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    order: { findFirst: jest.fn() },
    ownershipClaim: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  // The transaction client is the same mock, so writes inside it are visible.
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => unknown) => callback(prisma),
  );
  const receipts = {
    save: jest.fn(),
    remove: jest.fn(),
    open: jest.fn(),
  };
  const shopper = { id: 'user-1', role: Role.USER };
  const stranger = { id: 'user-2', role: Role.USER };
  const admin = { id: 'admin-1', role: Role.ADMIN };
  const card = {
    id: 'card-1',
    userId: 'user-1',
    productId: 'prod-1',
    ownershipVerifiedAt: null,
    product: { sku: 'SKU-1' },
  };
  let service: OwnershipService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    prisma.digitalCard.findUnique.mockResolvedValue(card);
    prisma.digitalCard.findUniqueOrThrow.mockResolvedValue({
      ownershipVerifiedAt: null,
    });
    prisma.ownershipClaim.findMany.mockResolvedValue([]);
    receipts.save.mockResolvedValue({
      path: 'receipts/r.jpg',
      mimeType: 'image/jpeg',
    });
    service = new OwnershipService(
      prisma as unknown as PrismaService,
      receipts as unknown as ReceiptStorageService,
    );
  });

  const receiptClaims = (
    count: number,
    status: ClaimStatus = ClaimStatus.REJECTED,
  ) =>
    Array.from({ length: count }, (_, i) => ({
      method: ClaimMethod.RECEIPT,
      status,
      rejectionReason: null,
      reviewedAt: null,
      createdAt: new Date(2026, 0, i + 1),
    }));

  describe('claimByOrder', () => {
    it('verifies instantly from a paid order with the product SKU', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 'order-1' });

      await service.claimByOrder('card-1', shopper);

      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            status: 'PAID',
            items: { some: { sku: 'SKU-1' } },
          },
        }),
      );
      expect(prisma.ownershipClaim.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          method: ClaimMethod.ORDER_MATCH,
          status: ClaimStatus.APPROVED,
          orderId: 'order-1',
        }),
      });
      expect(prisma.digitalCard.update).toHaveBeenCalledWith({
        where: { id: 'card-1' },
        data: { ownershipVerifiedAt: expect.any(Date) },
      });
    });

    it('records nothing when no paid order matches', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.claimByOrder('card-1', shopper),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.ownershipClaim.create).not.toHaveBeenCalled();
    });

    it("hides another shopper's card behind a 404", async () => {
      await expect(
        service.claimByOrder('card-1', stranger),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.order.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('claimByReceipt', () => {
    it('stores the file and opens a pending claim', async () => {
      prisma.ownershipClaim.findMany.mockResolvedValue(receiptClaims(2));

      await service.claimByReceipt('card-1', shopper, Buffer.from('x'));

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.ownershipClaim.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          method: ClaimMethod.RECEIPT,
          receiptPath: 'receipts/r.jpg',
          receiptMimeType: 'image/jpeg',
        }),
      });
    });

    it('refuses a 6th upload after 5 in total, and deletes the file', async () => {
      prisma.ownershipClaim.findMany.mockResolvedValue(receiptClaims(5));

      await expect(
        service.claimByReceipt('card-1', shopper, Buffer.from('x')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.ownershipClaim.create).not.toHaveBeenCalled();
      expect(receipts.remove).toHaveBeenCalledWith('receipts/r.jpg');
    });

    it('allows the 5th upload when 4 were rejected', async () => {
      prisma.ownershipClaim.findMany.mockResolvedValue(receiptClaims(4));

      await service.claimByReceipt('card-1', shopper, Buffer.from('x'));

      expect(prisma.ownershipClaim.create).toHaveBeenCalled();
    });

    it('refuses while another receipt is under review', async () => {
      prisma.ownershipClaim.findMany.mockResolvedValue(
        receiptClaims(1, ClaimStatus.PENDING),
      );

      await expect(
        service.claimByReceipt('card-1', shopper, Buffer.from('x')),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(receipts.remove).toHaveBeenCalled();
    });

    it('refuses once ownership is already verified', async () => {
      prisma.digitalCard.findUniqueOrThrow.mockResolvedValue({
        ownershipVerifiedAt: new Date(),
      });

      await expect(
        service.claimByReceipt('card-1', shopper, Buffer.from('x')),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('review', () => {
    const pending = {
      userId: 'user-1',
      productId: 'prod-1',
      status: 'APPROVED',
    };

    beforeEach(() => {
      prisma.ownershipClaim.findUnique.mockResolvedValue(pending);
      // detail() re-reads the claim; stub enough for it to present.
      jest.spyOn(service, 'detail').mockResolvedValue({} as never);
    });

    it('approving verifies the shopper card', async () => {
      prisma.ownershipClaim.updateMany.mockResolvedValue({ count: 1 });

      await service.approve('claim-1', admin);

      expect(prisma.ownershipClaim.updateMany).toHaveBeenCalledWith({
        where: { id: 'claim-1', status: ClaimStatus.PENDING },
        data: expect.objectContaining({
          status: ClaimStatus.APPROVED,
          reviewedById: 'admin-1',
        }),
      });
      expect(prisma.digitalCard.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          productId: 'prod-1',
          ownershipVerifiedAt: null,
        },
        data: { ownershipVerifiedAt: expect.any(Date) },
      });
    });

    it('a claim can only be decided once', async () => {
      prisma.ownershipClaim.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve('claim-1', admin)).rejects.toThrow(
        'This claim was already approved',
      );
      expect(prisma.digitalCard.updateMany).not.toHaveBeenCalled();
    });

    it('rejecting stores the trimmed reason for the shopper', async () => {
      prisma.ownershipClaim.updateMany.mockResolvedValue({ count: 1 });

      await service.reject('claim-1', admin, '  Receipt is for another shop  ');

      expect(prisma.ownershipClaim.updateMany).toHaveBeenCalledWith({
        where: { id: 'claim-1', status: ClaimStatus.PENDING },
        data: expect.objectContaining({
          status: ClaimStatus.REJECTED,
          rejectionReason: 'Receipt is for another shop',
        }),
      });
    });
  });

  describe('receiptFile', () => {
    beforeEach(() => {
      prisma.ownershipClaim.findUnique.mockResolvedValue({
        userId: 'user-1',
        receiptPath: 'receipts/r.jpg',
        receiptMimeType: 'image/jpeg',
      });
      receipts.open.mockResolvedValue({ stream: 'stream', size: 3 });
    });

    it('is readable by its uploader and admins only', async () => {
      await expect(service.receiptFile('c', shopper)).resolves.toMatchObject({
        mimeType: 'image/jpeg',
      });
      await expect(service.receiptFile('c', admin)).resolves.toBeDefined();
      await expect(service.receiptFile('c', stranger)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
