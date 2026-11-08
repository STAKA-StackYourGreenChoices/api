import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ClaimMethod, ClaimStatus } from '../../../generated/prisma';

export enum OwnershipStatus {
  /** No proof submitted yet. */
  UNVERIFIED = 'UNVERIFIED',
  /** A receipt is waiting for an admin. */
  PENDING = 'PENDING',
  /** The last receipt was rejected; another may be uploaded. */
  REJECTED = 'REJECTED',
  /** All receipt attempts are used up; this product can't be verified. */
  BLOCKED = 'BLOCKED',
  VERIFIED = 'VERIFIED',
}

export class OwnershipDto {
  @ApiProperty({ enum: OwnershipStatus }) status!: OwnershipStatus;

  @ApiPropertyOptional({
    enum: ClaimMethod,
    description: 'How it was verified',
  })
  method?: ClaimMethod;

  @ApiPropertyOptional() verifiedAt?: Date;
  @ApiPropertyOptional() pendingSince?: Date;
  @ApiPropertyOptional() lastRejectionReason?: string;
  @ApiProperty() receiptAttemptsUsed!: number;
  @ApiProperty() receiptAttemptsLeft!: number;
}

export class RejectClaimDto {
  @ApiProperty({
    example: 'The receipt does not show this product',
    description: 'Shown to the shopper so they know what to fix',
  })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ClaimQueryDto {
  @ApiPropertyOptional({ enum: ClaimStatus, default: ClaimStatus.PENDING })
  @IsOptional()
  @IsEnum(ClaimStatus)
  status: ClaimStatus = ClaimStatus.PENDING;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class ClaimUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
}

export class ClaimProductDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() gtin!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() brandName!: string;
  @ApiPropertyOptional() imageUrl?: string;
}

export class ClaimDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ClaimMethod }) method!: ClaimMethod;
  @ApiProperty({ enum: ClaimStatus }) status!: ClaimStatus;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional() reviewedAt?: Date;
  @ApiPropertyOptional() rejectionReason?: string;
  @ApiPropertyOptional() reviewedByName?: string;
  @ApiPropertyOptional() orderId?: string;
  @ApiProperty({ description: 'True when a receipt file can be fetched' })
  hasReceipt!: boolean;
  @ApiPropertyOptional({ example: 'image/jpeg' })
  receiptMimeType?: string;
  @ApiPropertyOptional({ description: 'Receipt attempt number, 1 to 5' })
  receiptAttempt?: number;
  @ApiProperty({ type: () => ClaimUserDto }) user!: ClaimUserDto;
  @ApiProperty({ type: () => ClaimProductDto }) product!: ClaimProductDto;
}

export class ClaimPageDto {
  @ApiProperty({ type: [ClaimDto] }) items!: ClaimDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

export class ClaimDetailDto extends ClaimDto {
  @ApiProperty({
    type: [ClaimDto],
    description: "All of this shopper's claims for this product, oldest first",
  })
  history!: ClaimDto[];
}
