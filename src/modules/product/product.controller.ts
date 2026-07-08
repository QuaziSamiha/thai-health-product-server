import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PublishedProductsQueryDto } from './dto/published-products-query.dto';
import {
  ProductResponseDto,
  ProductResponsePublicDto,
} from './dto/product-response.dto';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import {
  ApiPaginatedResponse,
  PaginationQueryDto,
} from '../../shared/pagination';

@ApiTags('Product')
@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post('create-product')
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor('images', 10))
  @ApiOperation({
    summary: 'Create a new product',
    description:
      'Creates a product (SIMPLE or VARIABLE) with optional gallery images and variants. Admin only.',
  })
  @ApiBody({ type: CreateProductDto })
  @ApiCreatedResponse({
    description: 'Product created successfully.',
    type: ProductResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiConflictResponse({
    description: 'A product with this name already exists.',
  })
  @ResponseMessage('Product created successfully')
  async createProduct(
    @Body() createProductDto: CreateProductDto,
    @UploadedFiles() images: Express.Multer.File[],
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.productService.createProduct(
      req.user.id,
      createProductDto,
      images ?? [],
    );
  }

  @Get('all-product')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all products (paginated)',
    description:
      'Returns every product regardless of visibility — including drafts, archived, hidden, and soft-deleted rows. Admin only.',
  })
  @ApiPaginatedResponse(ProductResponseDto, 'Products retrieved successfully.')
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ResponseMessage('Products retrieved successfully')
  async getAllProducts(@Query() query: PaginationQueryDto) {
    return this.productService.getAllProducts(query);
  }

  @Get('published-products')
  @ApiOperation({
    summary: 'Get published products (Public)',
    description:
      'Paginated storefront listing — only products that are ACTIVE, not soft-deleted, and whose `publishedAt` has passed. Filterable by search term, category IDs (CSV), and product type.',
  })
  @ApiPaginatedResponse(
    ProductResponsePublicDto,
    'Published products retrieved successfully.',
  )
  @ResponseMessage('Published products retrieved successfully')
  async getPublishedProducts(@Query() query: PublishedProductsQueryDto) {
    return this.productService.getPublishedProducts(query);
  }

  @Get('product-by-id/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get product by ID',
    description:
      'Returns the full admin detail for a single product — variants, images, pricing, stock, and audit fields. No visibility filter: drafts, archived, hidden, and soft-deleted rows are all retrievable. Admin only.',
  })
  @ApiOkResponse({
    description: 'Product retrieved successfully.',
    type: ProductResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Product not found.' })
  @ResponseMessage('Product retrieved successfully')
  async getProductById(@Param('id', ParseIntPipe) id: number) {
    return await this.productService.getProductById(id);
  }

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

  @Patch('update-product/:id')
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor('images', 10))
  @ApiOperation({
    summary: 'Update a product',
    description:
      'Partially updates an existing product. New images are appended to the gallery (never replaced). `variants` is reconciled by id: entries with an `id` update that variant, entries without one are added, and existing variants missing from the list are removed — at least one variant must remain. Omitting `variants` leaves them untouched. Admin only.',
  })
  @ApiBody({ type: UpdateProductDto })
  @ApiOkResponse({
    description: 'Product updated successfully.',
    type: ProductResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Product not found.' })
  @ApiConflictResponse({
    description: 'New name results in a duplicate name or slug.',
  })
  @ResponseMessage('Product updated successfully')
  async updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
    @UploadedFiles() images: Express.Multer.File[],
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.productService.updateProduct(
      id,
      req.user.id,
      updateProductDto,
      images ?? [],
    );
  }

  @Delete('soft-delete-product/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a product',
    description:
      'Retires a product without destroying it: sets status to ARCHIVED, records deletedAt/deletedBy, and hides its gallery images. Reversible. Admin only.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Product not found.' })
  @ApiConflictResponse({ description: 'Product is already deleted.' })
  @ResponseMessage('Product deleted successfully')
  async softDeleteProduct(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.productService.softDeleteProduct(id, req.user.id);
  }

  @Delete('permanently-delete-product/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Permanently delete a product',
    description:
      'Irreversibly removes the product along with all its variants and images (DB rows via cascade, files via cleanup). Prefer soft-delete for anything that has shipped or been ordered. Admin only.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Product not found.' })
  @ResponseMessage('Product permanently deleted')
  async permanentlyDeleteProduct(@Param('id', ParseIntPipe) id: number) {
    return this.productService.hardDeleteProduct(id);
  }
}
