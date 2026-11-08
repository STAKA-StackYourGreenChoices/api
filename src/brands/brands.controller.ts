import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma';
import { Roles } from '../auth/decorators/roles.decorator';
import { BrandsService } from './brands.service';
import {
  BrandSummaryDto,
  CreateBrandDto,
  UpdateBrandDto,
} from './dto/brand.dto';

@ApiTags('brands')
@Controller('brands')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  @ApiOkResponse({ type: [BrandSummaryDto] })
  findAll() {
    return this.brands.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ type: BrandSummaryDto })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.brands.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiCreatedResponse({ type: BrandSummaryDto })
  @ApiConflictResponse({ description: 'Brand name already exists' })
  create(@Body() dto: CreateBrandDto) {
    return this.brands.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOkResponse({ type: BrandSummaryDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Brand name already exists' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBrandDto) {
    return this.brands.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Brand still has products' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.brands.remove(id);
  }
}
