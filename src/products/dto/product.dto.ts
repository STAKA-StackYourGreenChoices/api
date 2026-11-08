import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BrandDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() logoUrl?: string;
}

export class SustainabilityInfoDto {
  @ApiProperty({ description: 'Estimated carbon footprint in grams of CO2e' })
  carbonScoreGrams!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  recyclabilityPercent!: number;

  @ApiProperty({
    description:
      'True when a third party has verified the claims; false means the figures are stated by the brand',
  })
  verified!: boolean;

  @ApiPropertyOptional() verifiedAt?: Date;

  @ApiPropertyOptional({ example: 'Global Recycled Standard' })
  certifierName?: string;
}

export class ProductDto {
  @ApiProperty() id!: string;

  @ApiProperty({ description: 'Always the 14-digit GTIN form' })
  gtin!: string;

  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() imageUrl?: string;
  @ApiProperty({ type: () => BrandDto }) brand!: BrandDto;

  @ApiPropertyOptional({ type: () => SustainabilityInfoDto })
  sustainabilityInfo?: SustainabilityInfoDto;

  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ProductPageDto {
  @ApiProperty({ type: [ProductDto] }) items!: ProductDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
