import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OwnershipDto } from '../../ownership/dto/ownership.dto';
import { ProductDto } from '../../products/dto/product.dto';
import { ShareLinkDto } from '../../sharing/sharing.dto';

/** Only what is safe to show on a card; never email or contact details. */
export class CardUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class DigitalCardDto {
  @ApiProperty() id!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: () => CardUserDto }) user!: CardUserDto;
  @ApiProperty({ type: () => ProductDto }) product!: ProductDto;
  @ApiProperty({ type: () => OwnershipDto }) ownership!: OwnershipDto;
  @ApiPropertyOptional({
    type: () => ShareLinkDto,
    description: 'Present while the card is publicly shared',
  })
  share?: ShareLinkDto;
}
