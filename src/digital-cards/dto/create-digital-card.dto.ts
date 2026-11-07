import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class CreateDigitalCardDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId: string;

  @ApiProperty({
    example: '0000614166626',
    description: 'GTIN from scanned barcode',
  })
  @IsString()
  gtin!: string;
}
