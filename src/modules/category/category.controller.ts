import { CategoryService } from './category.service';
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
  ApiConflictResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { CreateCategoryDto } from './dto/create-category.dto';
import {
  CategoryResponseDto,
  RootActiveCategoryResponseDto,
} from './dto/category-response.dto';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  PaginationQueryDto,
  ApiPaginatedResponse,
} from '../../shared/pagination';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Param,
  Patch,
  ParseIntPipe,
} from '@nestjs/common';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';

@ApiTags('Category')
@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post('create-category')
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'iconImage', maxCount: 1 },
      { name: 'thumbnailImage', maxCount: 1 },
      { name: 'bannerImage', maxCount: 1 },
    ]),
  )
  @ApiOperation({
    summary: 'Create a new category',
    description:
      'Creates a root or child category with optional icon, thumbnail and banner images. Admin only.',
  })
  @ApiBody({ type: CreateCategoryDto })
  @ApiCreatedResponse({
    description: 'Category created successfully.',
    type: CategoryResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Parent category not found.' })
  @ApiConflictResponse({
    description: 'A category with this name already exists.',
  })
  @ResponseMessage('Category created successfully')
  async createCategory(
    @Body() createCategoryDto: CreateCategoryDto,
    @UploadedFiles()
    files: {
      iconImage?: Express.Multer.File[];
      thumbnailImage?: Express.Multer.File[];
      bannerImage?: Express.Multer.File[];
    },
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }

    return this.categoryService.createCategory(req.user.id, createCategoryDto, {
      iconImage: files?.iconImage?.[0],
      thumbnailImage: files?.thumbnailImage?.[0],
      bannerImage: files?.bannerImage?.[0],
    });
  }

  @Get('all-categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all categories (paginated)',
    description: 'Returns all categories with pagination support. Admin only.',
  })
  @ApiPaginatedResponse(
    CategoryResponseDto,
    'Categories retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ResponseMessage('Categories retrieved successfully')
  async getAllCategories(@Query() paginationParams: PaginationQueryDto) {
    return this.categoryService.getAllCategories(paginationParams);
  }

  @Get('all-active-categories')
  @ApiOperation({
    summary: 'Get all active categories (Public)',
    description: 'Returns every category whose status is ACTIVE.',
  })
  @ApiOkResponse({
    description: 'Active categories retrieved successfully.',
    type: [CategoryResponseDto],
  })
  @ResponseMessage('Active categories retrieved successfully')
  async getAllActiveCategories() {
    return this.categoryService.getAllActiveCategories();
  }

  @Get('active-root-categories')
  @ApiOperation({
    summary: 'Get all active root categories (Public)',
    description:
      'Returns top-level (parentId = null) categories whose status is ACTIVE.',
  })
  @ApiOkResponse({
    description: 'Active root categories retrieved successfully.',
    type: [RootActiveCategoryResponseDto],
  })
  @ResponseMessage('Active root categories retrieved successfully')
  async getRootCategories() {
    return this.categoryService.getActiveRootCategories();
  }

  @Get('category-by-slug/:slug')
  @ApiOperation({
    summary: 'Get category by slug (Public)',
    description: 'Looks up a single category by its URL-friendly slug.',
  })
  @ApiOkResponse({
    description: 'Category retrieved successfully.',
    type: CategoryResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Category not found.' })
  @ResponseMessage('Category retrieved successfully')
  async getCategoryBySlug(@Param('slug') slug: string) {
    return this.categoryService.getCategoryBySlug(slug);
  }

  @Patch('update-category/:id')
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'image', maxCount: 1 },
      { name: 'iconImage', maxCount: 1 },
      { name: 'thumbnailImage', maxCount: 1 },
      { name: 'bannerImage', maxCount: 1 },
    ]),
  )
  @ApiOperation({
    summary: 'Update a category',
    description:
      'Partially updates an existing category. Uploading a new image replaces the old one. Admin only.',
  })
  @ApiBody({ type: UpdateCategoryDto })
  @ApiOkResponse({
    description: 'Category updated successfully.',
    type: CategoryResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data or self-parent assignment.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({
    description: 'Category or parent category not found.',
  })
  @ApiConflictResponse({
    description: 'New name results in a duplicate slug.',
  })
  @ResponseMessage('Category updated successfully')
  async updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @UploadedFiles()
    files: {
      image?: Express.Multer.File[];
      iconImage?: Express.Multer.File[];
      thumbnailImage?: Express.Multer.File[];
      bannerImage?: Express.Multer.File[];
    },
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }

    return this.categoryService.updateCategory(
      id,
      req.user.id,
      updateCategoryDto,
      {
        image: files?.image?.[0],
        iconImage: files?.iconImage?.[0],
        thumbnailImage: files?.thumbnailImage?.[0],
        bannerImage: files?.bannerImage?.[0],
      },
    );
  }
}
