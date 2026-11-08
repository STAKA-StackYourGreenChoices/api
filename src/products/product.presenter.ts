import { Prisma } from '../../generated/prisma';
import { ProductDto } from './dto/product.dto';

/** The relations every product response needs. */
export const productInclude = {
  brand: true,
  sustainabilityInfo: true,
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

/** Maps a product row to its public shape (nulls become absent fields). */
export function presentProduct(product: ProductWithRelations): ProductDto {
  const info = product.sustainabilityInfo;
  return {
    id: product.id,
    gtin: product.gtin,
    sku: product.sku,
    name: product.name,
    description: product.description ?? undefined,
    imageUrl: product.imageUrl ?? undefined,
    brand: {
      id: product.brand.id,
      name: product.brand.name,
      description: product.brand.description ?? undefined,
      logoUrl: product.brand.logoUrl ?? undefined,
    },
    sustainabilityInfo: info
      ? {
          carbonScoreGrams: info.carbonScoreGrams,
          recyclabilityPercent: info.recyclabilityPercent,
          verified: info.verified,
          verifiedAt: info.verifiedAt ?? undefined,
          certifierName: info.certifierName ?? undefined,
        }
      : undefined,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
