import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { isAdmin, RequestUser } from '../auth/request-user';
import { ClaimFacts, summarizeOwnership } from '../ownership/ownership-summary';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeGtin } from '../products/gtin';
import { presentProduct, productInclude } from '../products/product.presenter';
import { DigitalCardDto } from './dto/digital-card.dto';

const claimFactsSelect = {
  productId: true,
  method: true,
  status: true,
  rejectionReason: true,
  reviewedAt: true,
  createdAt: true,
} satisfies Prisma.OwnershipClaimSelect;

const cardInclude = {
  product: { include: productInclude },
  user: { select: { id: true, name: true } },
  shareLink: { select: { slug: true, createdAt: true, revokedAt: true } },
} satisfies Prisma.DigitalCardInclude;

type CardWithRelations = Prisma.DigitalCardGetPayload<{
  include: typeof cardInclude;
}>;

@Injectable()
export class DigitalCardsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the signed-in user's card for a scanned product. Scanning the same
   * product again returns the existing card (`created: false`) instead of a
   * duplicate.
   */
  async create(
    userId: string,
    rawGtin: string,
  ): Promise<{ card: DigitalCardDto; created: boolean }> {
    const normalized = normalizeGtin(rawGtin);
    if (!normalized.ok) throw new BadRequestException(normalized.reason);

    const product = await this.prisma.product.findUnique({
      where: { gtin: normalized.gtin },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException(
        `No product found for GTIN ${normalized.gtin}`,
      );
    }

    const existing = await this.findExisting(userId, product.id);
    if (existing) {
      return { card: await this.presentOne(existing), created: false };
    }

    try {
      const card = await this.prisma.digitalCard.create({
        data: { productId: product.id, userId },
        include: cardInclude,
      });
      return { card: this.present(card, []), created: true };
    } catch (error) {
      // Two scans racing each other: the loser returns the winner's card.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.findExisting(userId, product.id);
        if (winner) {
          return { card: await this.presentOne(winner), created: false };
        }
      }
      throw error;
    }
  }

  async findByUser(userId: string) {
    const cards = await this.prisma.digitalCard.findMany({
      where: { userId },
      include: cardInclude,
      orderBy: { createdAt: 'desc' },
    });
    // All of the user's claims in one query, grouped per product.
    const claims = await this.prisma.ownershipClaim.findMany({
      where: { userId },
      select: claimFactsSelect,
    });
    const byProduct = new Map<string, ClaimFacts[]>();
    for (const claim of claims) {
      byProduct.set(claim.productId, [
        ...(byProduct.get(claim.productId) ?? []),
        claim,
      ]);
    }
    return cards.map((card) =>
      this.present(card, byProduct.get(card.productId) ?? []),
    );
  }

  /** Owners and admins can read a card; anyone else gets a 404, not a 403, so ids can't be probed. */
  async findOne(id: string, requester: RequestUser) {
    const card = await this.prisma.digitalCard.findUnique({
      where: { id },
      include: cardInclude,
    });
    if (!card || (card.userId !== requester.id && !isAdmin(requester))) {
      throw new NotFoundException(`Digital card ${id} not found`);
    }
    return this.presentOne(card);
  }

  private findExisting(userId: string, productId: string) {
    return this.prisma.digitalCard.findUnique({
      where: { userId_productId: { userId, productId } },
      include: cardInclude,
    });
  }

  private async presentOne(card: CardWithRelations): Promise<DigitalCardDto> {
    const claims = await this.prisma.ownershipClaim.findMany({
      where: { userId: card.userId, productId: card.productId },
      select: claimFactsSelect,
    });
    return this.present(card, claims);
  }

  private present(
    card: CardWithRelations,
    claims: ClaimFacts[],
  ): DigitalCardDto {
    return {
      id: card.id,
      createdAt: card.createdAt,
      user: { id: card.user.id, name: card.user.name },
      product: presentProduct(card.product),
      ownership: summarizeOwnership(claims, card.ownershipVerifiedAt),
      share:
        card.shareLink && !card.shareLink.revokedAt
          ? { slug: card.shareLink.slug, createdAt: card.shareLink.createdAt }
          : undefined,
    };
  }
}
