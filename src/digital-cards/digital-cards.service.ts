import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDigitalCardDto } from './dto/create-digital-card.dto';

@Injectable()
export class DigitalCardsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDigitalCardDto) {
    const product = await this.prisma.product.findUnique({
      where: { gtin: dto.gtin },
      include: { brand: true, sustainabilityInfo: true },
    });
    if (!product) {
      throw new NotFoundException(`No product found for GTIN ${dto.gtin}`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException(`User ${dto.userId} not found`);
    }

    const card = await this.prisma.digitalCard.create({
      data: { productId: product.id, userId: user.id },
      include: {
        product: { include: { brand: true, sustainabilityInfo: true } },
        user: true,
      },
    });

    return this.present(card);
  }

  async findByUser(userId: string) {
    const cards = await this.prisma.digitalCard.findMany({
      where: { userId },
      include: {
        product: { include: { brand: true, sustainabilityInfo: true } },
        user: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return cards.map((card) => this.present(card));
  }

  async findOne(id: string) {
    const card = await this.prisma.digitalCard.findUnique({
      where: { id },
      include: {
        product: { include: { brand: true, sustainabilityInfo: true } },
        user: true,
      },
    });
    if (!card) throw new NotFoundException(`Digital card ${id} not found`);
    return this.present(card);
  }

  private present(card: {
    id: string;
    createdAt: Date;
    user: { id: string; name: string; email: string };
    product: {
      id: string;
      gtin: string;
      sku: string;
      name: string;
      imageUrl: string | null;
      brand: { id: string; name: string; logoUrl: string | null };
      sustainabilityInfo: {
        carbonScoreGrams: number;
        recyclabilityPercent: number;
        verified: boolean;
        verifiedAt: Date | null;
      } | null;
    };
  }) {
    return {
      id: card.id,
      createdAt: card.createdAt,
      user: {
        id: card.user.id,
        name: card.user.name,
        email: card.user.email,
      },
      product: {
        id: card.product.id,
        gtin: card.product.gtin,
        sku: card.product.sku,
        name: card.product.name,
        imageUrl: card.product.imageUrl ?? undefined,
        brand: {
          id: card.product.brand.id,
          name: card.product.brand.name,
          logoUrl: card.product.brand.logoUrl ?? undefined,
        },
        sustainabilityInfo: card.product.sustainabilityInfo
          ? {
              carbonScoreGrams:
                card.product.sustainabilityInfo.carbonScoreGrams,
              recyclabilityPercent:
                card.product.sustainabilityInfo.recyclabilityPercent,
              verified: card.product.sustainabilityInfo.verified,
              verifiedAt:
                card.product.sustainabilityInfo.verifiedAt ?? undefined,
            }
          : undefined,
      },
    };
  }
}
