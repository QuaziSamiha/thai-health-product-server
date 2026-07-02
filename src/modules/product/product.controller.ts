import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { ProductService } from './product.service';
import { ProductResponsePublicDto } from './dto/product-response.dto';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';

@ApiTags('Product')
@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('product-by-slug/:slug')
  @ApiOperation({
    summary: 'Get product by slug (Public)',
    description: 'Looks up a single product by its URL-friendly slug.',
  })
  @ApiOkResponse({
    description: 'Product retrieved successfully.',
    type: ProductResponsePublicDto,
  })
  @ApiNotFoundResponse({ description: 'Product not found.' })
  @ResponseMessage('Product retrieved successfully')
  async getProductBySlug(@Param('slug') slug: string) {
    return this.productService.getProductBySlug(slug);
  }
}
