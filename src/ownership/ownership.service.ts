import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClaimMethod,
  ClaimStatus,
  OrderStatus,
  Prisma,
} from '../../generated/prisma';
import { isAdmin, RequestUser } from '../auth/request-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  ClaimDetailDto,
  ClaimDto,
  ClaimPageDto,
  ClaimQueryDto,
  OwnershipDto,
} from './dto/ownership.dto';
import { MAX_RECEIPT_ATTEMPTS, summarizeOwnership } from './ownership-summary';
import { ReceiptStorageService } from './receipt-storage.service';

const claimInclude = {
  user: { select: { id: true, name: true, email: true } },
  product: {
    select: {
      id: true,
      name: true,
      gtin: true,
      sku: true,
      imageUrl: true,
      brand: { select: { name: true } },
    },
  },
  reviewedBy: { select: { name: true } },
} satisfies Prisma.OwnershipClaimInclude;

type ClaimRow = Prisma.OwnershipClaimGetPayload<{
  include: typeof claimInclude;
}>;

@Injectable()
export class OwnershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ReceiptStorageService,
  ) {}

  /* ---------- Shopper side ---------- */

  async ownershipForCard(
    cardId: string,
    user: RequestUser,
  ): Promise<OwnershipDto> {
    const card = await this.ownCard(cardId, user);
    return this.summary(card.userId, card.productId, card.ownershipVerifiedAt);
  }

  /**
   * Verifies instantly when one of the shopper's own PAID orders contains the
   * product's SKU. A miss creates no claim and uses up no receipt attempts.
   */
  async claimByOrder(cardId: string, user: RequestUser): Promise<OwnershipDto> {
    const card = await this.ownCard(cardId, user);
    if (card.ownershipVerifiedAt) {
      return this.summary(
        card.userId,
        card.productId,
        card.ownershipVerifiedAt,
      );
    }

    const order = await this.prisma.order.findFirst({
      where: {
        userId: card.userId,
        status: OrderStatus.PAID,
        items: { some: { sku: card.product.sku } },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!order) {
      throw new NotFoundException(
        "We couldn't find a paid order on your account that includes this product",
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.ownershipClaim.create({
        data: {
          userId: card.userId,
          productId: card.productId,
          method: ClaimMethod.ORDER_MATCH,
          status: ClaimStatus.APPROVED,
          orderId: order.id,
          reviewedAt: now,
        },
      });
      // A receipt still waiting for review is no longer needed.
      await tx.ownershipClaim.updateMany({
        where: {
          userId: card.userId,
          productId: card.productId,
          status: ClaimStatus.PENDING,
        },
        data: {
          status: ClaimStatus.REJECTED,
          rejectionReason: 'Not needed: verified by a matching order',
          reviewedAt: now,
        },
      });
      await tx.digitalCard.update({
        where: { id: card.id },
        data: { ownershipVerifiedAt: now },
      });
    });
    return this.summary(card.userId, card.productId, now);
  }

  /**
   * Stores a receipt for an admin to review. One may be under review at a
   * time, and a shopper gets MAX_RECEIPT_ATTEMPTS uploads per product in total.
   */
  async claimByReceipt(
    cardId: string,
    user: RequestUser,
    file: Buffer,
  ): Promise<OwnershipDto> {
    const card = await this.ownCard(cardId, user);
    const stored = await this.receipts.save(file);

    try {
      await this.prisma.$transaction(async (tx) => {
        // Lock the card row so two uploads can't both pass the checks below.
        await tx.$queryRaw`SELECT id FROM "DigitalCard" WHERE id = ${card.id} FOR UPDATE`;
        const fresh = await tx.digitalCard.findUniqueOrThrow({
          where: { id: card.id },
          select: { ownershipVerifiedAt: true },
        });
        const claims = await tx.ownershipClaim.findMany({
          where: { userId: card.userId, productId: card.productId },
          select: { method: true, status: true },
        });

        if (
          fresh.ownershipVerifiedAt ||
          claims.some((c) => c.status === ClaimStatus.APPROVED)
        ) {
          throw new ConflictException('You already own this piece on record');
        }
        if (claims.some((c) => c.status === ClaimStatus.PENDING)) {
          throw new ConflictException(
            'A receipt for this piece is already waiting for review',
          );
        }
        const used = claims.filter(
          (c) => c.method === ClaimMethod.RECEIPT,
        ).length;
        if (used >= MAX_RECEIPT_ATTEMPTS) {
          throw new ForbiddenException(
            `All ${MAX_RECEIPT_ATTEMPTS} receipt uploads for this piece have been used`,
          );
        }

        await tx.ownershipClaim.create({
          data: {
            userId: card.userId,
            productId: card.productId,
            method: ClaimMethod.RECEIPT,
            receiptPath: stored.path,
            receiptMimeType: stored.mimeType,
          },
        });
      });
    } catch (error) {
      await this.receipts.remove(stored.path);
      throw error;
    }

    return this.summary(card.userId, card.productId, null);
  }

  /** The receipt file, for its uploader or an admin. */
  async receiptFile(claimId: string, requester: RequestUser) {
    const claim = await this.prisma.ownershipClaim.findUnique({
      where: { id: claimId },
      select: { userId: true, receiptPath: true, receiptMimeType: true },
    });
    if (
      !claim ||
      !claim.receiptPath ||
      (claim.userId !== requester.id && !isAdmin(requester))
    ) {
      throw new NotFoundException('Receipt not found');
    }
    const file = await this.receipts.open(claim.receiptPath);
    return {
      ...file,
      mimeType: claim.receiptMimeType ?? 'application/octet-stream',
    };
  }

  /* ---------- Admin review ---------- */

  async list(query: ClaimQueryDto): Promise<ClaimPageDto> {
    const where: Prisma.OwnershipClaimWhereInput = { status: query.status };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ownershipClaim.findMany({
        where,
        include: claimInclude,
        // Oldest first for the queue; newest first for finished reviews.
        orderBy: {
          createdAt: query.status === ClaimStatus.PENDING ? 'asc' : 'desc',
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.ownershipClaim.count({ where }),
    ]);

    const attempts = await this.receiptAttemptNumbers(rows);
    return {
      items: rows.map((row) => this.present(row, attempts.get(row.id))),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async detail(id: string): Promise<ClaimDetailDto> {
    const claim = await this.prisma.ownershipClaim.findUnique({
      where: { id },
      include: claimInclude,
    });
    if (!claim) throw new NotFoundException(`Claim ${id} not found`);

    const history = await this.prisma.ownershipClaim.findMany({
      where: { userId: claim.userId, productId: claim.productId },
      include: claimInclude,
      orderBy: { createdAt: 'asc' },
    });
    const attempts = this.numberReceipts(history);
    return {
      ...this.present(claim, attempts.get(claim.id)),
      history: history.map((row) => this.present(row, attempts.get(row.id))),
    };
  }

  async approve(id: string, admin: RequestUser): Promise<ClaimDetailDto> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claim = await this.decide(tx, id, {
        status: ClaimStatus.APPROVED,
        reviewedById: admin.id,
        reviewedAt: now,
      });
      await tx.digitalCard.updateMany({
        where: {
          userId: claim.userId,
          productId: claim.productId,
          ownershipVerifiedAt: null,
        },
        data: { ownershipVerifiedAt: now },
      });
    });
    return this.detail(id);
  }

  async reject(
    id: string,
    admin: RequestUser,
    reason: string,
  ): Promise<ClaimDetailDto> {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      throw new BadRequestException(
        'Give the shopper a reason they can act on',
      );
    }
    await this.prisma.$transaction((tx) =>
      this.decide(tx, id, {
        status: ClaimStatus.REJECTED,
        rejectionReason: trimmed,
        reviewedById: admin.id,
        reviewedAt: new Date(),
      }),
    );
    return this.detail(id);
  }

  /* ---------- Helpers ---------- */

  /** Moves a PENDING claim to its decision exactly once, even if two admins click together. */
  private async decide(
    tx: Prisma.TransactionClient,
    id: string,
    data: Prisma.OwnershipClaimUncheckedUpdateManyInput,
  ) {
    const updated = await tx.ownershipClaim.updateMany({
      where: { id, status: ClaimStatus.PENDING },
      data,
    });
    const claim = await tx.ownershipClaim.findUnique({
      where: { id },
      select: { userId: true, productId: true, status: true },
    });
    if (!claim) throw new NotFoundException(`Claim ${id} not found`);
    if (updated.count === 0) {
      throw new ConflictException(
        `This claim was already ${claim.status.toLowerCase()}`,
      );
    }
    return claim;
  }

  /** The signed-in shopper's own card; anyone else's is a 404 so ids can't be probed. */
  private async ownCard(cardId: string, user: RequestUser) {
    const card = await this.prisma.digitalCard.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        userId: true,
        productId: true,
        ownershipVerifiedAt: true,
        product: { select: { sku: true } },
      },
    });
    if (!card || card.userId !== user.id) {
      throw new NotFoundException(`Digital card ${cardId} not found`);
    }
    return card;
  }

  private async summary(
    userId: string,
    productId: string,
    verifiedAt: Date | null,
  ): Promise<OwnershipDto> {
    const claims = await this.prisma.ownershipClaim.findMany({
      where: { userId, productId },
      select: {
        method: true,
        status: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
      },
    });
    return summarizeOwnership(claims, verifiedAt);
  }

  /** Attempt numbers (1–5) for the receipt claims on a page, in one query. */
  private async receiptAttemptNumbers(rows: ClaimRow[]) {
    const pairs = rows
      .filter((row) => row.method === ClaimMethod.RECEIPT)
      .map((row) => ({ userId: row.userId, productId: row.productId }));
    if (pairs.length === 0) return new Map<string, number>();
    const related = await this.prisma.ownershipClaim.findMany({
      where: { method: ClaimMethod.RECEIPT, OR: pairs },
      select: {
        id: true,
        userId: true,
        productId: true,
        method: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return this.numberReceipts(related);
  }

  private numberReceipts(
    claims: {
      id: string;
      userId: string;
      productId: string;
      method: ClaimMethod;
    }[],
  ) {
    const counters = new Map<string, number>();
    const numbers = new Map<string, number>();
    for (const claim of claims) {
      if (claim.method !== ClaimMethod.RECEIPT) continue;
      const key = `${claim.userId}:${claim.productId}`;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      numbers.set(claim.id, next);
    }
    return numbers;
  }

  private present(row: ClaimRow, receiptAttempt?: number): ClaimDto {
    return {
      id: row.id,
      method: row.method,
      status: row.status,
      createdAt: row.createdAt,
      reviewedAt: row.reviewedAt ?? undefined,
      rejectionReason: row.rejectionReason ?? undefined,
      reviewedByName: row.reviewedBy?.name,
      orderId: row.orderId ?? undefined,
      hasReceipt: Boolean(row.receiptPath),
      receiptMimeType: row.receiptMimeType ?? undefined,
      receiptAttempt,
      user: row.user,
      product: {
        id: row.product.id,
        name: row.product.name,
        gtin: row.product.gtin,
        sku: row.product.sku,
        brandName: row.product.brand.name,
        imageUrl: row.product.imageUrl ?? undefined,
      },
    };
  }
}
