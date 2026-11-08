import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Role } from '../../generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestUser } from '../auth/request-user';
import { DigitalCardsService } from './digital-cards.service';
import { CreateDigitalCardDto } from './dto/create-digital-card.dto';
import { DigitalCardDto } from './dto/digital-card.dto';

@ApiTags('digital-cards')
@Controller('digital-cards')
export class DigitalCardsController {
  constructor(private readonly digitalCards: DigitalCardsService) {}

  @Post()
  @ApiCreatedResponse({ type: DigitalCardDto, description: 'Card created' })
  @ApiOkResponse({
    type: DigitalCardDto,
    description: 'You already have a card for this product; it is returned',
  })
  @ApiBadRequestResponse({ description: 'Not a valid GTIN' })
  @ApiNotFoundResponse({ description: 'No product for this GTIN' })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateDigitalCardDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { card, created } = await this.digitalCards.create(user.id, dto.gtin);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return card;
  }

  @Get('mine')
  @ApiOkResponse({ type: [DigitalCardDto] })
  findMine(@CurrentUser() user: RequestUser) {
    return this.digitalCards.findByUser(user.id);
  }

  @Get('user/:userId')
  @Roles(Role.ADMIN)
  @ApiOkResponse({ type: [DigitalCardDto] })
  findByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.digitalCards.findByUser(userId);
  }

  @Get(':id')
  @ApiOkResponse({ type: DigitalCardDto })
  @ApiNotFoundResponse()
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.digitalCards.findOne(id, user);
  }
}
