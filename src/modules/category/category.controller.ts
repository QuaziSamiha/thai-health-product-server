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
import { sendResponse } from '../../common/responses/send-response';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { PaginationParamsDto } from '../../shared/pagination/dto/pagination-params.dto';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Param,
  Patch,
  ParseIntPipe,
} from '@nestjs/common';
import { UpdateCategoryDto } from './dto/update-category.dto';

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
  async createCategory(
    @Body() createCategoryDto: CreateCategoryDto,
    @UploadedFiles()
    files: {
      iconImage?: Express.Multer.File[];
      thumbnailImage?: Express.Multer.File[];
      bannerImage?: Express.Multer.File[];
    },
    @Req() req: Request & { user?: { id: number } },
    @Res() res: Response,
  ) {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedException('User identity missing from request');
      }

      const result = await this.categoryService.createCategory(
        req.user.id,
        createCategoryDto,
        {
          iconImage: files?.iconImage?.[0],
          thumbnailImage: files?.thumbnailImage?.[0],
          bannerImage: files?.bannerImage?.[0],
        },
      );

      sendResponse(res, {
        statusCode: HttpStatus.CREATED,
        success: true,
        message: 'Category created successfully',
        data: result,
      });
    } catch (error) {
      const statusCode =
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create category';
      sendResponse(res, {
        statusCode,
        success: false,
        message: errorMessage,
      });
    }
  }

  @Get('all-categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all categories (paginated)',
    description: 'Returns all categories with pagination support. Admin only.',
  })
  @ApiOkResponse({
    description: 'Categories retrieved successfully.',
    type: [CategoryResponseDto],
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  async getAllCategories(
    @Query() paginationParams: PaginationParamsDto,
    @Res() res: Response,
  ) {
    try {
      const result =
        await this.categoryService.getAllCategories(paginationParams);
      return sendResponse(res, {
        statusCode: HttpStatus.OK,
        success: true,
        message: 'Categories retrieved successfully',
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      const statusCode =
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to retrieve categories';
      return sendResponse(res, {
        statusCode,
        success: false,
        message: errorMessage,
      });
    }
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
  async getAllActiveCategories(@Res() res: Response) {
    try {
      const result = await this.categoryService.getAllActiveCategories();
      return sendResponse(res, {
        statusCode: HttpStatus.OK,
        success: true,
        message: 'Active categories retrieved successfully',
        data: result,
      });
    } catch (error) {
      const statusCode =
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to retrieve active categories';
      return sendResponse(res, {
        statusCode,
        success: false,
        message: errorMessage,
      });
    }
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
  async getRootCategories(@Res() res: Response) {
    try {
      const result = await this.categoryService.getActiveRootCategories();
      return sendResponse(res, {
        statusCode: HttpStatus.OK,
        success: true,
        message: 'Active root categories retrieved successfully',
        data: result,
      });
    } catch (error) {
      const statusCode =
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to retrieve active root categories';
      return sendResponse(res, {
        statusCode,
        success: false,
        message: errorMessage,
      });
    }
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
  async getCategoryBySlug(@Res() res: Response, @Param('slug') slug: string) {
    try {
      const result = await this.categoryService.getCategoryBySlug(slug);
      return sendResponse(res, {
        statusCode: HttpStatus.OK,
        success: true,
        message: 'Category retrieved successfully',
        data: result,
      });
    } catch (error) {
      const statusCode =
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to retrieve category';
      return sendResponse(res, {
        statusCode,
        success: false,
        message: errorMessage,
      });
    }
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
    @Res() res: Response,
  ) {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedException('User identity missing from request');
      }

      const result = await this.categoryService.updateCategory(
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

      sendResponse(res, {
        statusCode: HttpStatus.OK,
        success: true,
        message: 'Category updated successfully',
        data: result,
      });
    } catch (error) {
      const statusCode =
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update category';
      sendResponse(res, {
        statusCode,
        success: false,
        message: errorMessage,
      });
    }
  }
}
