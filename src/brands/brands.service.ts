import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import {
  BrandSummaryDto,
  CreateBrandDto,
  UpdateBrandDto,
} from './dto/brand.dto';

const brandSelect = {
  id: true,
  name: true,
  description: true,
  logoUrl: true,
  createdAt: true,
  _count: { select: { products: true } },
} satisfies Prisma.BrandSelect;

type BrandRow = Prisma.BrandGetPayload<{ select: typeof brandSelect }>;

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<BrandSummaryDto[]> {
    const brands = await this.prisma.brand.findMany({
      select: brandSelect,
      orderBy: { name: 'asc' },
    });
    return brands.map((brand) => this.present(brand));
  }

  async findOne(id: string): Promise<BrandSummaryDto> {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      select: brandSelect,
    });
    if (!brand) throw new NotFoundException(`Brand ${id} not found`);
    return this.present(brand);
  }

  async create(dto: CreateBrandDto): Promise<BrandSummaryDto> {
    try {
      const brand = await this.prisma.brand.create({
        data: { ...dto, name: dto.name.trim() },
        select: brandSelect,
      });
      return this.present(brand);
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  async update(id: string, dto: UpdateBrandDto): Promise<BrandSummaryDto> {
    await this.findOne(id);
    try {
      const brand = await this.prisma.brand.update({
        where: { id },
        data: { ...dto, name: dto.name?.trim() },
        select: brandSelect,
      });
      return this.present(brand);
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  /** A brand that still has products can't be deleted; move or delete them first. */
  async remove(id: string): Promise<void> {
    const brand = await this.findOne(id);
    if (brand.productCount > 0) {
      throw new ConflictException(
        `Brand still has ${brand.productCount} product(s); delete or move them first`,
      );
    }
    await this.prisma.brand.delete({ where: { id } });
  }

  private mapConflict(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('A brand with this name already exists');
    }
    return error;
  }

  private present(brand: BrandRow): BrandSummaryDto {
    return {
      id: brand.id,
      name: brand.name,
      description: brand.description ?? undefined,
      logoUrl: brand.logoUrl ?? undefined,
      productCount: brand._count.products,
      createdAt: brand.createdAt,
    };
  }
}
