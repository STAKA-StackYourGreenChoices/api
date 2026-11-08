import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../generated/prisma';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProductDto, ProductPageDto } from './dto/product.dto';
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/product-input.dto';
import {
  IMPORT_TEMPLATE,
  ImportReportDto,
  ProductImportService,
} from './product-import.service';
import { ProductsService } from './products.service';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly importer: ProductImportService,
  ) {}

  @Get()
  @ApiOkResponse({ type: ProductPageDto })
  findAll(@Query() query: ProductQueryDto) {
    return this.products.findAll(query);
  }

  @Get('gtin/:gtin')
  @ApiOkResponse({ type: ProductDto })
  @ApiBadRequestResponse({ description: 'Not a valid GTIN' })
  @ApiNotFoundResponse({ description: 'No product found for this GTIN' })
  findByGtin(@Param('gtin') gtin: string) {
    return this.products.findByGtin(gtin);
  }

  @Get('sku/:sku')
  @ApiOkResponse({ type: ProductDto })
  @ApiNotFoundResponse({ description: 'No product found for this SKU' })
  findBySku(@Param('sku') sku: string) {
    return this.products.findBySku(sku);
  }

  @Get('import/template')
  @Roles(Role.ADMIN)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="staka-products-template.csv"',
  )
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV header plus one example row' })
  importTemplate() {
    return IMPORT_TEMPLATE;
  }

  @Post('import')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
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
  @ApiQuery({
    name: 'dryRun',
    required: false,
    type: Boolean,
    description: 'Validate and report without saving',
  })
  @ApiOkResponse({ type: ImportReportDto })
  @ApiBadRequestResponse({
    description: 'Missing, oversized or unreadable CSV',
  })
  importCsv(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('dryRun', new ParseBoolPipe({ optional: true })) dryRun = false,
  ) {
    if (!file)
      throw new BadRequestException('Attach a CSV file in the "file" field');
    if (!/\.csv$/i.test(file.originalname)) {
      throw new BadRequestException('Only .csv files can be imported');
    }
    return this.importer.import(file.buffer, dryRun);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductDto })
  @ApiNotFoundResponse()
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiCreatedResponse({ type: ProductDto })
  @ApiBadRequestResponse({ description: 'Invalid GTIN or unknown brand' })
  @ApiConflictResponse({ description: 'GTIN or SKU already in use' })
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOkResponse({ type: ProductDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'GTIN or SKU already in use' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Users hold cards for this product' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(id);
  }
}
