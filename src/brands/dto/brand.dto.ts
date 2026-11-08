import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, Length } from 'class-validator';

export class CreateBrandDto {
  @ApiProperty({ example: 'GreenCo', minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  logoUrl?: string;
}

export class UpdateBrandDto extends PartialType(CreateBrandDto) {}

export class BrandSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() logoUrl?: string;
  @ApiProperty() productCount!: number;
  @ApiProperty() createdAt!: Date;
}
