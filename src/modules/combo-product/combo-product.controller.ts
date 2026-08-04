import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ComboProductService } from './combo-product.service';
import { CreateComboProductDto } from './dto/create-combo-product.dto';
import { UpdateComboProductDto } from './dto/update-combo-product.dto';
import { AllCombosQueryDto } from './dto/all-combos-query.dto';
import { PublishedCombosQueryDto } from './dto/published-combos-query.dto';
import {
  ComboProductResponseDto,
  ComboProductResponsePublicDto,
} from './dto/combo-product-response.dto';
import { ApiPaginatedResponse } from '../../shared/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';
import { UserRole } from '../../generated/prisma/enums';

//* ROUTE PREFIX IS `combo`, NOT `combo-product` — IT MATCHES THE ADMIN
//* CLIENT'S COMBO_API CONSTANTS AND THE PUBLIC-FACING VOCABULARY. THE MODULE
//* AND FILE NAMES KEEP THE `combo-product` PREFIX BECAUSE THEY MIRROR THE
//* PRISMA MODEL (ComboProduct), WHICH IS A DIFFERENT NAMING AXIS.
@ApiTags('Combo Product')
@Controller('combo')
export class ComboProductController {
  constructor(private readonly comboProductService: ComboProductService) {}

  @Get('all-combo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all combos (paginated)',
    description:
      'Admin combo table. Returns every combo regardless of visibility — drafts, inactive, archived and hidden rows all appear — except soft-deleted ones. Searchable by title / Thai title / slug / SKU / barcode, filterable by status, stock status and featured flag, and sortable by any whitelisted column. Admin only.',
  })
  @ApiPaginatedResponse(
    ComboProductResponseDto,
    'Combos retrieved successfully.',
  )
  @ApiBadRequestResponse({
    description: 'Invalid pagination, filter or sort parameter.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ResponseMessage('Combos retrieved successfully')
  async getAllCombos(@Query() query: AllCombosQueryDto) {
    return this.comboProductService.getAllCombos(query);
  }

  @Get('published-combos')
  @ApiOperation({
    summary: 'Get published combos (paginated, Public)',
    description:
      'Storefront combo listing — every ACTIVE, published combo, optionally narrowed to featured-only and sorted by createdAt / comboPrice / title. Backs the `/product` page\'s "Combo" filter and the home page\'s "Combo Deals" → "View all".',
  })
  @ApiPaginatedResponse(
    ComboProductResponsePublicDto,
    'Combos retrieved successfully.',
  )
  @ApiBadRequestResponse({
    description: 'Invalid pagination or sort parameter.',
  })
  @ResponseMessage('Combos retrieved successfully')
  async getPublishedCombos(@Query() query: PublishedCombosQueryDto) {
    return await this.comboProductService.getPublishedCombos(query);
  }

  @Get('slug/:slug')
  @ApiOperation({
    summary: 'Get combo details by slug (Public)',
    description:
      'Storefront combo details page. Looks up a single combo by its URL-friendly slug, visible only once it is ACTIVE and published (`publishedAt <= now()`).',
  })
  @ApiOkResponse({
    description: 'Combo retrieved successfully.',
    type: ComboProductResponsePublicDto,
  })
  @ApiNotFoundResponse({ description: 'Combo not found.' })
  @ResponseMessage('Combo retrieved successfully')
  async getComboBySlug(@Param('slug') slug: string) {
    return await this.comboProductService.getComboBySlug(slug);
  }

  @Post('create-combo')
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor('images', 10))
  @ApiOperation({
    summary: 'Create a new combo product',
    description:
      'Bundles existing products/variants into a time-boxed combo offer at a special price, with an optional gallery of up to 10 images. Admin only.',
  })
  @ApiBody({ type: CreateComboProductDto })
  @ApiCreatedResponse({
    description: 'Combo created successfully.',
    type: ComboProductResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid input data, a variant that does not belong to the given product, or a combo price greater than the sum of its bundled items.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({
    description: 'A bundled product or variant does not exist.',
  })
  @ApiConflictResponse({
    description: 'A combo with this title (or resulting slug) already exists.',
  })
  @ResponseMessage('Combo created successfully')
  async createCombo(
    @Body() createComboProductDto: CreateComboProductDto,
    @UploadedFiles() images: Express.Multer.File[],
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }

    return this.comboProductService.createComboProduct(
      req.user.id,
      createComboProductDto,
      images ?? [],
    );
  }

  @Patch('update/:id')
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor('images', 10))
  @ApiOperation({
    summary: 'Update an existing combo product',
    description:
      'Partial update — only the fields present in the payload are written. Sending `items` REPLACES the whole bundle and recomputes the sum-of-parts price and availability; omitting it leaves the bundle untouched. `deleteImageIds` removes existing gallery images before any newly uploaded files are appended. Admin only.',
  })
  @ApiBody({ type: UpdateComboProductDto })
  @ApiOkResponse({
    description: 'Combo updated successfully.',
    type: ComboProductResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid input, an image ID that does not belong to this combo, a combo price greater than the sum of its bundled items, or a combo quantity higher than current stock can assemble.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({
    description: 'Combo, or a bundled product/variant, does not exist.',
  })
  @ApiConflictResponse({
    description: 'Another combo already uses this title, slug, SKU or barcode.',
  })
  @ResponseMessage('Combo updated successfully')
  async updateCombo(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateComboProductDto: UpdateComboProductDto,
    @UploadedFiles() images: Express.Multer.File[],
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }

    return this.comboProductService.updateComboProduct(
      id,
      req.user.id,
      updateComboProductDto,
      images ?? [],
    );
  }

  @Delete('delete/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Permanently delete a combo',
    description:
      "Irreversibly removes the combo along with its bundled items and gallery images (DB rows via cascade, files via cleanup). Does not adjust the stock of any bundled product/variant — a combo's quantity is derived from live stock, never reserved from it. Admin only.",
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Combo not found.' })
  @ResponseMessage('Combo deleted successfully')
  async deleteCombo(@Param('id', ParseIntPipe) id: number) {
    return await this.comboProductService.hardDeleteComboProduct(id);
  }
}
