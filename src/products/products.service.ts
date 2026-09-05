import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductDto, BrandDto, SustainabilityInfoDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
    constructor(private readonly prisma: PrismaService) { }

    async findByGtin(gtin: string): Promise<ProductDto> {
        const product = await this.prisma.product.findUnique({
            where: { gtin },
            include: {
                brand: true,
                sustainabilityInfo: true,
            },
        });
        if (!product) {
            throw new NotFoundException(`Product with gtin ${gtin} not found`);
        }
        return this.present(product);
    }

    async findBySku(sku: string): Promise<ProductDto> {
        const product = await this.prisma.product.findUnique({
            where: { sku },
            include: {
                brand: true,
                sustainabilityInfo: true,
            },
        });
        if (!product) {
            throw new NotFoundException(`Product with sku ${sku} not found`);
        }
        return this.present(product);
    }
    private present(product: {
        id: string;
        gtin: string;
        sku: string;
        name: string;
        imageUrl: string | null;
        brand: {
            id: string;
            name: string;
            logoUrl: string | null;
        };
        sustainabilityInfo: {
            carbonScoreGrams: number;
            recyclabilityPercent: number;
            verified: boolean;
            verifiedAt: Date | null;
        } | null;
    }): ProductDto {
        return {
            id: product.id,
            gtin: product.gtin,
            sku: product.sku,
            name: product.name,
            imageUrl: product.imageUrl ?? undefined,
            brand: {
                id: product.brand.id,
                name: product.brand.name,
                logoUrl: product.brand.logoUrl ?? undefined,
            },
            sustainabilityInfo: product.sustainabilityInfo
                ? {
                    carbonScoreGrams: product.sustainabilityInfo.carbonScoreGrams,
                    recyclabilityPercent:
                        product.sustainabilityInfo.recyclabilityPercent,
                    verified: product.sustainabilityInfo.verified,
                    verifiedAt: product.sustainabilityInfo.verifiedAt ?? undefined,
                }
                : undefined,
        };
    }
}