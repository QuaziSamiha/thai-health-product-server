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
} from '@nestjs/swagger';
import { CreateHomeDto } from './dto/create-home.dto';
import { UpdateHomeDto } from './dto/update-home.dto';
import { HomeQueryDto } from './dto/home-query.dto';
import {
  HomeResponseDto,
  HomeResponsePublicDto,
} from './dto/home-response.dto';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole, HomeContentType } from '../../generated/prisma/enums';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiPaginatedResponse,
  PaginationQueryDto,
} from '../../shared/pagination';
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
  ParseEnumPipe,
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

  @Get('hero-slider-contents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get hero slider content rows (paginated)',
    description:
      'Returns paginated hero slider rows only — backs the admin dashboard Hero Slider tab.',
  })
  @ApiPaginatedResponse(
    HomeResponseDto,
    'Hero slider contents retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('Hero slider contents retrieved successfully')
  async getHeroSliderContents(@Query() queryParams: PaginationQueryDto) {
    return this.homeService.getHeroSliderContents(queryParams);
  }

  @Get('promotion-banner-contents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get promotion banner content rows (paginated)',
    description:
      'Returns paginated promotion banner rows only — backs the admin dashboard Promotional Banner tab.',
  })
  @ApiPaginatedResponse(
    HomeResponseDto,
    'Promotion banner contents retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('Promotion banner contents retrieved successfully')
  async getPromotionBannerContents(@Query() queryParams: PaginationQueryDto) {
    return this.homeService.getPromotionBannerContents(queryParams);
  }

  @Get('active-home-contents/:type')
  @ApiOperation({
    summary: 'Get active home content rows by type (Public)',
    description:
      'Returns every ACTIVE row of the given type, ordered by displayOrder — used to render a single storefront section (hero carousel, promo banners, OVC).',
  })
  @ApiOkResponse({
    description: 'Active home contents retrieved successfully.',
    type: [HomeResponsePublicDto],
  })
  @ResponseMessage('Active home contents retrieved successfully')
  async getActiveHomeContentsByType(
    @Param('type', new ParseEnumPipe(HomeContentType)) type: HomeContentType,
  ) {
    return this.homeService.getActiveHomeContentsByType(type);
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
