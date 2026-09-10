import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ProductDto } from './dto/product.dto';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('gtin/:gtin')
  @ApiOkResponse({ type: ProductDto })
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
}
