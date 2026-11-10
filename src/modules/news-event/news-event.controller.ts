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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { NewsEventService } from './news-event.service';
import { CreateNewsEventDto } from './dto/create-news-event.dto';
import { UpdateNewsEventDto } from './dto/update-news-event.dto';
import {
  NewsEventAdminQueryDto,
  NewsEventPublicQueryDto,
  RelatedNewsEventsQueryDto,
} from './dto/news-event-query.dto';
import {
  NewsEventCardDto,
  NewsEventPublicDto,
  NewsEventResponseDto,
} from './dto/news-event-response.dto';
import {
  NEWS_EVENT_IMAGE_UPLOAD_OPTIONS,
  NEWS_EVENT_MAX_IMAGES,
} from './news-event.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { ApiPaginatedResponse } from '../../shared/pagination';

type AuthedRequest = Request & { user?: { id: number } };

@ApiTags('News & Event')
@Controller('news-event')
export class NewsEventController {
  constructor(private readonly newsEventService: NewsEventService) {}

  // ═══════════════════════════════════════════════════════════════════════
  // ADMIN
  // ═══════════════════════════════════════════════════════════════════════

  @Post('create-news-event')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @UseInterceptors(
    FilesInterceptor(
      'images',
      NEWS_EVENT_MAX_IMAGES,
      NEWS_EVENT_IMAGE_UPLOAD_OPTIONS,
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create a news & event post',
    description:
      'Creates a post with 1–10 images (first = cover). The logged-in user becomes the author.',
  })
  @ApiBody({ type: CreateNewsEventDto })
  @ApiCreatedResponse({ type: NewsEventResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid input, unknown type, or missing image.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('News & event created successfully')
  async createNewsEvent(
    @Body() dto: CreateNewsEventDto,
    @UploadedFiles() images: Express.Multer.File[],
    @Req() req: AuthedRequest,
  ) {
    return this.newsEventService.createNewsEvent(
      this.userId(req),
      dto,
      images ?? [],
    );
  }

  @Get('all-news-events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all news & event posts (paginated)',
    description:
      'Admin table: every post, archived (soft-deleted) ones included. Filter by status (status=ARCHIVED for deleted posts), type or featured.',
  })
  @ApiPaginatedResponse(
    NewsEventResponseDto,
    'News & events retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('News & events retrieved successfully')
  async getAllNewsEvents(@Query() query: NewsEventAdminQueryDto) {
    return this.newsEventService.getAllNewsEvents(query);
  }

  @Get('news-event-by-id/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get a news & event post by ID',
    description:
      'Full admin detail (edit form / view). Includes soft-deleted posts.',
  })
  @ApiOkResponse({ type: NewsEventResponseDto })
  @ApiNotFoundResponse({ description: 'Post not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('News & event retrieved successfully')
  async getNewsEventById(@Param('id', ParseIntPipe) id: number) {
    return this.newsEventService.getNewsEventById(id);
  }

  @Patch('update-news-event/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @UseInterceptors(
    FilesInterceptor(
      'images',
      NEWS_EVENT_MAX_IMAGES,
      NEWS_EVENT_IMAGE_UPLOAD_OPTIONS,
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update a news & event post',
    description:
      'Partial update. `images` adds files, `deleteImageIds` removes, `coverImage` picks the cover. Send "" to clear an optional field. The slug only changes while the post has never been published.',
  })
  @ApiBody({ type: UpdateNewsEventDto })
  @ApiOkResponse({ type: NewsEventResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input or image operation.' })
  @ApiConflictResponse({
    description: 'Post is archived — archived posts are read-only.',
  })
  @ApiNotFoundResponse({ description: 'Post not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('News & event updated successfully')
  async updateNewsEvent(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNewsEventDto,
    @UploadedFiles() images: Express.Multer.File[],
  ) {
    return this.newsEventService.updateNewsEvent(id, dto, images ?? []);
  }

  @Delete('soft-delete-news-event/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a news & event post',
    description:
      'Archives the post: status becomes ARCHIVED and deletedAt is set. It disappears from the storefront; images are kept. One-way: archived posts cannot be restored or edited. Admin only.',
  })
  @ApiNotFoundResponse({ description: 'Post not found.' })
  @ApiConflictResponse({ description: 'Post is already deleted.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ResponseMessage('News & event deleted successfully')
  async softDeleteNewsEvent(@Param('id', ParseIntPipe) id: number) {
    return this.newsEventService.softDeleteNewsEvent(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC (STOREFRONT) — only ACTIVE, published, non-deleted posts
  // ═══════════════════════════════════════════════════════════════════════

  @Get('active-news-events')
  @ApiOperation({
    summary: 'List published news & events (Public)',
    description:
      'Paginated cards for the listing page. Filter by type slug, featured, upcoming/past. "Sort by A to Z" = sortBy=title&sortOrder=asc.',
  })
  @ApiPaginatedResponse(
    NewsEventCardDto,
    'News & events retrieved successfully.',
  )
  @ResponseMessage('News & events retrieved successfully')
  async getPublicNewsEvents(@Query() query: NewsEventPublicQueryDto) {
    return this.newsEventService.getPublicNewsEvents(query);
  }

  @Get('news-event-by-slug/:slug')
  @ApiOperation({ summary: 'Get a published news & event by slug (Public)' })
  @ApiOkResponse({ type: NewsEventPublicDto })
  @ApiNotFoundResponse({ description: 'Post not found or not published.' })
  @ResponseMessage('News & event retrieved successfully')
  async getPublicNewsEventBySlug(@Param('slug') slug: string) {
    return this.newsEventService.getPublicNewsEventBySlug(slug);
  }

  @Get('related-news-events/:slug')
  @ApiOperation({
    summary: '"You May Also Like" for a post (Public)',
    description:
      'Latest posts of the same type, topped up with the latest of other types.',
  })
  @ApiOkResponse({ type: [NewsEventCardDto] })
  @ApiNotFoundResponse({ description: 'Post not found or not published.' })
  @ResponseMessage('Related news & events retrieved successfully')
  async getRelatedNewsEvents(
    @Param('slug') slug: string,
    @Query() query: RelatedNewsEventsQueryDto,
  ) {
    return this.newsEventService.getRelatedNewsEvents(slug, query.limit);
  }

  private userId(req: AuthedRequest): number {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return req.user.id;
  }
}
