import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BrandDto {
    @ApiProperty() id!: string;

    @ApiProperty() name!: string;

    @ApiPropertyOptional() logoUrl?: string;
}

export class SustainabilityInfoDto {
    @ApiProperty() carbonScoreGrams!: number;
    @ApiProperty() recyclabilityPercent!: number;
    @ApiProperty() verified!: boolean;
    @ApiPropertyOptional() verifiedAt?: Date;
}

export class ProductDto {
    @ApiProperty() id!: string;
    @ApiProperty() gtin!: string;
    @ApiProperty() sku!: string;
    @ApiProperty() name!: string;
    @ApiPropertyOptional() imageUrl?: string;
    @ApiProperty({ type: () => BrandDto }) brand!: BrandDto;
    @ApiPropertyOptional({ type: () => SustainabilityInfoDto }) sustainabilityInfo?: SustainabilityInfoDto;
}
