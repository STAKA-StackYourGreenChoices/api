import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import {
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiTags,
} from '@nestjs/swagger';
import { DigitalCardsService } from './digital-cards.service';
import { CreateDigitalCardDto } from './dto/create-digital-card.dto';
import { DigitalCardDto } from './dto/digital-card.dto';

@ApiTags('digital-cards')
@Controller('digital-cards')
export class DigitalCardsController {
    constructor(private readonly digitalCards: DigitalCardsService) { }
    @Post()
    @ApiCreatedResponse({ type: DigitalCardDto })
    @ApiNotFoundResponse({ description: 'Unknown GTIN or user not found' })
    create(@Body() dto: CreateDigitalCardDto) {
        return this.digitalCards.create(dto);
    }
    @Get('user/:userId')
    @ApiOkResponse({ type: [DigitalCardDto] })
    findByUser(@Param('userId', ParseUUIDPipe) userId: string) {
        return this.digitalCards.findByUser(userId);
    }
    @Get(':id')
    @ApiOkResponse({ type: DigitalCardDto })
    @ApiNotFoundResponse()
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.digitalCards.findOne(id);
    }
}