import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CardUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
}
export class CardBrandDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() logoUrl?: string;
}
export class CardSustainabilityDto {
  @ApiProperty() carbonScoreGrams!: number;
  @ApiProperty() recyclabilityPercent!: number;
  @ApiProperty() verified!: boolean;
  @ApiPropertyOptional() verifiedAt?: Date;
}
export class CardProductDto {
  @ApiProperty() id!: string;
  @ApiProperty() gtin!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() imageUrl?: string;
  @ApiProperty({ type: () => CardBrandDto }) brand!: CardBrandDto;
  @ApiPropertyOptional({ type: () => CardSustainabilityDto })
  sustainabilityInfo?: CardSustainabilityDto;
}
export class DigitalCardDto {
  @ApiProperty() id!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: () => CardUserDto }) user!: CardUserDto;
  @ApiProperty({ type: () => CardProductDto }) product!: CardProductDto;
}
