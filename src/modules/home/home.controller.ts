import { HomeService } from './home.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { CreateHomeDto } from './dto/create-home.dto';
import { UpdateHomeDto } from './dto/update-home.dto';
import { HomeQueryDto } from './dto/home-query.dto';
import {
  HomeResponseDto,
  FeaturedHomeContentsResponseDto,
} from './dto/home-response.dto';
import {
  PromotionalProductDto,
  PromotionalProductOptionDto,
} from '../product/dto/promotional-product.dto';
import { ProductResponseDto } from '../product/dto/product-response.dto';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiPaginatedResponse } from '../../shared/pagination';
import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Param,
  Patch,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';

@ApiTags('Home')
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Post('create-home-content')
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'image', maxCount: 1 }]))
  @ApiOperation({
    summary: 'Create a new home/landing-page content row',
    description:
      'Creates a hero slide, promotion banner, or OVC row for the storefront homepage.',
  })
  @ApiBody({ type: CreateHomeDto })
  @ApiCreatedResponse({
    description: 'Home content created successfully.',
    type: HomeResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data, or missing image.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('Home content created successfully')
  async createHome(
    @Body() createHomeDto: CreateHomeDto,
    @UploadedFiles() files: { image?: Express.Multer.File[] },
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }

    return this.homeService.createHome(
      req.user.id,
      createHomeDto,
      files?.image?.[0],
    );
  }

  @Get('all-home-contents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all home content rows (paginated)',
    description:
      'Returns every home content row with pagination support, optionally filtered to a single content type — matches the admin dashboard tabs (Hero Slider / Promotional Banner).',
  })
  @ApiPaginatedResponse(
    HomeResponseDto,
    'Home contents retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('Home contents retrieved successfully')
  async getAllHomeContents(@Query() queryParams: HomeQueryDto) {
    return this.homeService.getAllHomeContents(queryParams);
  }

  @Get('featured-home-contents')
  @ApiOperation({
    summary: 'Get featured home page content (Public)',
    description:
      'Everything the public storefront homepage needs in one call: the single ACTIVE hero slider and single ACTIVE promotion banner with the lowest displayOrder each (either null if that type has no ACTIVE row), every ACTIVE root category, the (at most two) ACTIVE promotional products (isPromotional=true), the combo section, and three product sections — featured (isFeatured=true), best (isBest=true), and general (isFeatured=false). Categories/products are sourced from CategoryService/ProductService, not queried directly by this module.',
  })
  @ApiOkResponse({
    description: 'Featured home contents retrieved successfully.',
    type: FeaturedHomeContentsResponseDto,
  })
  @ResponseMessage('Featured home contents retrieved successfully')
  async getFeaturedHomeContents() {
    return this.homeService.getFeaturedHomeContents();
  }

  @Get('promotional-products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the promotional products',
    description:
      'Every non-deleted product currently flagged isPromotional (at most two) — the rows of the "Promotional Product" admin tab.',
  })
  @ApiOkResponse({
    description: 'Promotional products retrieved successfully.',
    type: [ProductResponseDto],
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('Promotional products retrieved successfully')
  async getPromotionalProducts() {
    return this.homeService.getPromotionalProducts();
  }

  @Get('promotional-product-options')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get products that can be made promotional',
    description:
      'Every ACTIVE, non-deleted product that is not already promotional — the options of the add/replace product select.',
  })
  @ApiOkResponse({
    description: 'Promotional product options retrieved successfully.',
    type: [PromotionalProductOptionDto],
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('Promotional product options retrieved successfully')
  async getPromotionalProductOptions() {
    return this.homeService.getPromotionalProductOptions();
  }

  @Post('add-promotional-product')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Make a product promotional',
    description:
      'Sets isPromotional = true on an ACTIVE product. At most two products can be promotional at a time — rejected with 409 once both slots are taken (replace one instead).',
  })
  @ApiBody({ type: PromotionalProductDto })
  @ApiCreatedResponse({
    description: 'Promotional product added successfully.',
    type: ProductResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The product is not active.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ApiNotFoundResponse({ description: 'Product not found.' })
  @ApiConflictResponse({
    description:
      'Both promotional slots are taken, or the product is already promotional.',
  })
  @ResponseMessage('Promotional product added successfully')
  async addPromotionalProduct(
    @Body() dto: PromotionalProductDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.homeService.addPromotionalProduct(dto.productId, req.user.id);
  }

  @Patch('replace-promotional-product/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Replace a promotional product',
    description:
      'Atomically hands the promotional slot held by product :id to the ACTIVE product in the body — :id becomes isPromotional = false (and can then be deactivated), the new product becomes isPromotional = true.',
  })
  @ApiBody({ type: PromotionalProductDto })
  @ApiOkResponse({
    description: 'Promotional product replaced successfully.',
    type: ProductResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The new product is not active, or is the same product.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ApiNotFoundResponse({ description: 'Product not found.' })
  @ApiConflictResponse({
    description: ':id is not promotional, or the new product already is.',
  })
  @ResponseMessage('Promotional product replaced successfully')
  async replacePromotionalProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PromotionalProductDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.homeService.replacePromotionalProduct(
      id,
      dto.productId,
      req.user.id,
    );
  }

  @Patch('remove-promotional-product/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a product from promotion',
    description:
      'Sets isPromotional = false on product :id, freeing its slot. Nothing else about the product changes.',
  })
  @ApiOkResponse({
    description: 'Product removed from promotion successfully.',
    type: ProductResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ApiNotFoundResponse({ description: 'Product not found.' })
  @ApiConflictResponse({ description: 'The product is not promotional.' })
  @ResponseMessage('Product removed from promotion successfully')
  async removePromotionalProduct(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.homeService.removePromotionalProduct(id, req.user.id);
  }

  @Patch('update-home-content/:id')
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'image', maxCount: 1 }]))
  @ApiOperation({
    summary: 'Update a home content row',
    description: 'Partially updates an existing hero slide/banner/OVC row.',
  })
  @ApiBody({ type: UpdateHomeDto })
  @ApiOkResponse({
    description: 'Home content updated successfully.',
    type: HomeResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ApiNotFoundResponse({ description: 'Home content not found.' })
  @ResponseMessage('Home content updated successfully')
  async updateHome(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateHomeDto: UpdateHomeDto,
    @UploadedFiles() files: { image?: Express.Multer.File[] },
  ) {
    return this.homeService.updateHome(id, updateHomeDto, files?.image?.[0]);
  }

  @Delete('delete-home-content/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a home content row',
    description: 'Permanently deletes a hero slide/banner/OVC row. Admin only.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Home content not found.' })
  @ResponseMessage('Home content deleted successfully')
  async deleteHome(@Param('id', ParseIntPipe) id: number) {
    return this.homeService.deleteHome(id);
  }
}
