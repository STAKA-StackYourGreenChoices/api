import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ClaimStatus } from '../../generated/prisma';
import { RequestUser } from '../auth/request-user';
import { PrismaService } from '../prisma/prisma.service';
import { presentProduct, productInclude } from '../products/product.presenter';
import { PublicTagDto, ShareLinkDto } from './sharing.dto';

const SLUG_ALPHABET =
  'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 12 characters from a 57-symbol alphabet: about 70 bits, not guessable. */
export function newSlug(): string {
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join(
    '',
  );
}

/**
 * Public links for verified cards. Proof of purchase gates sharing, so
 * anything shared publicly is a piece someone has shown they own.
 */
@Injectable()
export class SharingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the card's live link, creating one (or a fresh slug after a revoke). */
  async share(cardId: string, user: RequestUser): Promise<ShareLinkDto> {
    const card = await this.prisma.digitalCard.findUnique({
      where: { id: cardId },
      select: { userId: true, ownershipVerifiedAt: true, shareLink: true },
    });
    if (!card || card.userId !== user.id) {
      throw new NotFoundException(`Digital card ${cardId} not found`);
    }
    if (!card.ownershipVerifiedAt) {
      throw new ConflictException('Prove you own this piece before sharing it');
    }
    if (card.shareLink && !card.shareLink.revokedAt) {
      return { slug: card.shareLink.slug, createdAt: card.shareLink.createdAt };
    }

    const link = await this.prisma.shareLink.upsert({
      where: { cardId },
      create: { cardId, slug: newSlug() },
      update: { slug: newSlug(), revokedAt: null, createdAt: new Date() },
    });
    return { slug: link.slug, createdAt: link.createdAt };
  }

  /** Turns the link off. Anyone opening it afterwards sees "not available". */
  async revoke(cardId: string, user: RequestUser): Promise<void> {
    const card = await this.prisma.digitalCard.findUnique({
      where: { id: cardId },
      select: { userId: true },
    });
    if (!card || card.userId !== user.id) {
      throw new NotFoundException(`Digital card ${cardId} not found`);
    }
    await this.prisma.shareLink.updateMany({
      where: { cardId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async publicTag(slug: string): Promise<PublicTagDto> {
    const link = await this.prisma.shareLink.findUnique({
      where: { slug },
      include: {
        card: {
          include: {
            product: { include: productInclude },
            user: { select: { name: true, deletedAt: true } },
          },
        },
      },
    });
    const card = link?.card;
    if (
      !link ||
      link.revokedAt ||
      !card ||
      !card.ownershipVerifiedAt ||
      card.user.deletedAt
    ) {
      throw new NotFoundException('This tag is not shared');
    }

    const approved = await this.prisma.ownershipClaim.findFirst({
      where: {
        userId: card.userId,
        productId: card.productId,
        status: ClaimStatus.APPROVED,
      },
      select: { method: true },
    });

    return {
      slug: link.slug,
      product: presentProduct(card.product),
      ownerFirstName: card.user.name.trim().split(/\s+/)[0] || 'A STAKA member',
      verifiedAt: card.ownershipVerifiedAt,
      verifiedBy: approved?.method,
      sharedAt: link.createdAt,
    };
  }
}
