import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { ProductDto, ProductPageDto } from './dto/product.dto';
import {
  CreateProductDto,
  ProductQueryDto,
  SustainabilityInput,
  UpdateProductDto,
} from './dto/product-input.dto';
import { normalizeGtin } from './gtin';
import { presentProduct, productInclude } from './product.presenter';

/**
 * Normalises sustainability input so the stored record is always consistent:
 * verified figures carry a date, unverified ones carry no date or certifier.
 */
export function sustainabilityData(input: SustainabilityInput) {
  return {
    carbonScoreGrams: input.carbonScoreGrams,
    recyclabilityPercent: input.recyclabilityPercent,
    verified: input.verified,
    verifiedAt: input.verified ? (input.verifiedAt ?? new Date()) : null,
    certifierName: input.verified ? (input.certifierName ?? null) : null,
  };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ProductQueryDto): Promise<ProductPageDto> {
    const search = query.search?.trim();
    const gtinSearch = search ? normalizeGtin(search) : undefined;
    const where: Prisma.ProductWhereInput = {
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { gtin: { contains: search } },
              ...(gtinSearch?.ok ? [{ gtin: gtinSearch.gtin }] : []),
              { brand: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: items.map(presentProduct),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findById(id: string): Promise<ProductDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return presentProduct(product);
  }

  async findByGtin(rawGtin: string): Promise<ProductDto> {
    const gtin = this.requireGtin(rawGtin);
    const product = await this.prisma.product.findUnique({
      where: { gtin },
      include: productInclude,
    });
    if (!product) {
      throw new NotFoundException(`Product with gtin ${gtin} not found`);
    }
    return presentProduct(product);
  }

  async findBySku(sku: string): Promise<ProductDto> {
    const product = await this.prisma.product.findUnique({
      where: { sku },
      include: productInclude,
    });
    if (!product) {
      throw new NotFoundException(`Product with sku ${sku} not found`);
    }
    return presentProduct(product);
  }

  async create(dto: CreateProductDto): Promise<ProductDto> {
    const gtin = this.requireGtin(dto.gtin);
    await this.requireBrand(dto.brandId);

    try {
      const product = await this.prisma.product.create({
        data: {
          gtin,
          sku: dto.sku.trim(),
          name: dto.name.trim(),
          description: dto.description,
          imageUrl: dto.imageUrl,
          brandId: dto.brandId,
          ...(dto.sustainabilityInfo
            ? {
                sustainabilityInfo: {
                  create: sustainabilityData(dto.sustainabilityInfo),
                },
              }
            : {}),
        },
        include: productInclude,
      });
      return presentProduct(product);
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDto> {
    await this.findById(id);
    const gtin =
      dto.gtin !== undefined ? this.requireGtin(dto.gtin) : undefined;
    if (dto.brandId) await this.requireBrand(dto.brandId);

    const info = dto.sustainabilityInfo
      ? sustainabilityData(dto.sustainabilityInfo)
      : undefined;

    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          gtin,
          sku: dto.sku?.trim(),
          name: dto.name?.trim(),
          description: dto.description,
          imageUrl: dto.imageUrl,
          brandId: dto.brandId,
          ...(info
            ? { sustainabilityInfo: { upsert: { create: info, update: info } } }
            : {}),
        },
        include: productInclude,
      });
      return presentProduct(product);
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  /** Products that users already hold cards for can't be deleted. */
  async remove(id: string): Promise<void> {
    await this.findById(id);
    const cards = await this.prisma.digitalCard.count({
      where: { productId: id },
    });
    if (cards > 0) {
      throw new ConflictException(
        `${cards} user card(s) reference this product, so it can't be deleted`,
      );
    }
    await this.prisma.product.delete({ where: { id } });
  }

  private requireGtin(raw: string): string {
    const result = normalizeGtin(raw);
    if (!result.ok) throw new BadRequestException(result.reason);
    return result.gtin;
  }

  private async requireBrand(brandId: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true },
    });
    if (!brand)
      throw new BadRequestException(`Brand ${brandId} does not exist`);
  }

  private mapConflict(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = JSON.stringify(error.meta?.target ?? '');
      return new ConflictException(
        target.includes('sku')
          ? 'Another product already uses this SKU'
          : 'Another product already uses this GTIN',
      );
    }
    return error;
  }
}
