import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Role } from '../../generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestUser } from '../auth/request-user';
import {
  ClaimDetailDto,
  ClaimPageDto,
  ClaimQueryDto,
  OwnershipDto,
  RejectClaimDto,
} from './dto/ownership.dto';
import { OwnershipService } from './ownership.service';
import { MAX_RECEIPT_BYTES } from './receipt-storage.service';

/** Proof of ownership for the signed-in shopper's own cards. */
@ApiTags('ownership')
@Controller('digital-cards/:cardId/ownership')
export class CardOwnershipController {
  constructor(private readonly ownership: OwnershipService) {}

  @Get()
  @ApiOkResponse({ type: OwnershipDto })
  @ApiNotFoundResponse()
  status(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ownership.ownershipForCard(cardId, user);
  }

  @Post('order-match')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: OwnershipDto,
    description: 'Verified by a paid order',
  })
  @ApiNotFoundResponse({ description: 'No paid order includes this product' })
  matchOrder(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ownership.claimByOrder(cardId, user);
  }

  @Post('receipt')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      // One byte over the limit so the storage layer reports a friendly size error.
      limits: { fileSize: MAX_RECEIPT_BYTES + 1, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({
    type: OwnershipDto,
    description: 'Receipt waiting for review',
  })
  @ApiConflictResponse({
    description: 'Already verified, or a receipt is under review',
  })
  @ApiForbiddenResponse({ description: 'All 5 receipt uploads are used' })
  uploadReceipt(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Attach the receipt in the "file" field');
    }
    return this.ownership.claimByReceipt(cardId, user, file.buffer);
  }
}

/** The admin review queue, plus receipt viewing for the uploader. */
@ApiTags('ownership')
@Controller('claims')
export class ClaimsController {
  constructor(private readonly ownership: OwnershipService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOkResponse({ type: ClaimPageDto })
  list(@Query() query: ClaimQueryDto) {
    return this.ownership.list(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOkResponse({ type: ClaimDetailDto })
  @ApiNotFoundResponse()
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.ownership.detail(id);
  }

  @Get(':id/receipt')
  @ApiOkResponse({ description: 'The receipt image or PDF' })
  @ApiNotFoundResponse()
  async receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.ownership.receiptFile(id, user);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // Uploaded content must never run script, even a crafted PDF.
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'",
    });
    return new StreamableFile(file.stream);
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ClaimDetailDto })
  @ApiConflictResponse({ description: 'Already reviewed' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: RequestUser,
  ) {
    return this.ownership.approve(id, admin);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ClaimDetailDto })
  @ApiConflictResponse({ description: 'Already reviewed' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: RequestUser,
    @Body() dto: RejectClaimDto,
  ) {
    return this.ownership.reject(id, admin, dto.reason);
  }
}
