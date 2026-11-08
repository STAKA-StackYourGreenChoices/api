import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { RequestUser } from '../auth/request-user';
import { PublicTagDto, ShareLinkDto } from './sharing.dto';
import { SharingService } from './sharing.service';

@ApiTags('sharing')
@Controller('digital-cards/:cardId/share')
export class CardShareController {
  constructor(private readonly sharing: SharingService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ShareLinkDto })
  @ApiConflictResponse({ description: 'Ownership is not verified yet' })
  @ApiNotFoundResponse()
  share(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sharing.share(cardId, user);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  revoke(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sharing.revoke(cardId, user);
  }
}

@ApiTags('sharing')
@Controller('public/tags')
export class PublicTagsController {
  constructor(private readonly sharing: SharingService) {}

  @Public()
  @Get(':slug')
  @ApiOkResponse({ type: PublicTagDto })
  @ApiNotFoundResponse({ description: 'Not shared, or sharing was turned off' })
  findOne(@Param('slug') slug: string) {
    return this.sharing.publicTag(slug);
  }
}
