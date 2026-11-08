import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/** The card owner is always the signed-in user, never a field in the body. */
export class CreateDigitalCardDto {
  @ApiProperty({
    example: '0614141000418',
    description:
      'GTIN from the scanned barcode: 8, 12, 13 or 14 digits with a valid check digit',
  })
  @IsString()
  @Length(1, 32)
  gtin!: string;
}
