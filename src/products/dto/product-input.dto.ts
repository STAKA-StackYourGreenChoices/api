import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SustainabilityInput {
  @ApiProperty({ example: 120, description: 'Grams of CO2e', minimum: 0 })
  @IsInt()
  @Min(0)
  carbonScoreGrams!: number;

  @ApiProperty({ example: 95, minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  recyclabilityPercent!: number;

  @ApiProperty({
    description: 'True only when a third party has verified the figures',
  })
  @IsBoolean()
  verified!: boolean;

  @ApiPropertyOptional({
    description: 'Defaults to now when verified is true; cleared when false',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  verifiedAt?: Date;

  @ApiPropertyOptional({ example: 'Global Recycled Standard', maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  certifierName?: string;
}

export class CreateProductDto {
  @ApiProperty({
    example: '0614141000418',
    description: '8, 12, 13 or 14 digits; stored as 14 digits',
  })
  @IsString()
  @Length(1, 32)
  gtin!: string;

  @ApiProperty({ example: 'SKU-ECO-01', maxLength: 64 })
  @IsString()
  @Length(1, 64)
  sku!: string;

  @ApiProperty({ example: 'Organic Cotton Tee', maxLength: 200 })
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/tee.jpg' })
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  imageUrl?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  brandId!: string;

  @ApiPropertyOptional({ type: () => SustainabilityInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => SustainabilityInput)
  sustainabilityInfo?: SustainabilityInput;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ProductQueryDto {
  @ApiPropertyOptional({ description: 'Matches name, SKU, GTIN or brand name' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
