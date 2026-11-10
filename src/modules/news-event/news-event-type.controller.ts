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
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { NewsEventTypeService } from './news-event-type.service';
import { CreateNewsEventTypeDto } from './dto/create-news-event-type.dto';
import { UpdateNewsEventTypeDto } from './dto/update-news-event-type.dto';
import { NewsEventTypeQueryDto } from './dto/news-event-type-query.dto';
import {
  NewsEventTypeOptionDto,
  NewsEventTypePublicDto,
  NewsEventTypeResponseDto,
} from './dto/news-event-type-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { ApiPaginatedResponse } from '../../shared/pagination';

type AuthedRequest = Request & { user?: { id: number } };

@ApiTags('News & Event Type')
@Controller('news-event-type')
export class NewsEventTypeController {
  constructor(private readonly typeService: NewsEventTypeService) {}

  // ─── Admin ───────────────────────────────────────────────────────────────────

  @Post('create-news-event-type')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  //* multipart SO SWAGGER UI RENDERS ONE INPUT PER FIELD — MATCHES OTHER ADMIN FORMS
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Create a news & event type' })
  @ApiBody({ type: CreateNewsEventTypeDto })
  @ApiCreatedResponse({ type: NewsEventTypeResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiConflictResponse({ description: 'A type with this name already exists.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('News & event type created successfully')
  async createType(
    @Body() dto: CreateNewsEventTypeDto,
    @Req() req: AuthedRequest,
  ) {
    return this.typeService.createType(this.userId(req), dto);
  }

  @Get('all-news-event-types')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all news & event types (paginated)',
    description: 'Admin list incl. inactive types and per-type post counts.',
  })
  @ApiPaginatedResponse(
    NewsEventTypeResponseDto,
    'Types retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('News & event types retrieved successfully')
  async getAllTypes(@Query() query: NewsEventTypeQueryDto) {
    return this.typeService.getAllTypes(query);
  }

  @Get('active-news-event-type-options')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get active types for the post form dropdown',
    description:
      'Every ACTIVE type as { id, name, nameTh }, ordered by displayOrder then name. Not paginated. Inactive types are left out so new or edited posts cannot be filed under a hidden type.',
  })
  @ApiOkResponse({ type: [NewsEventTypeOptionDto] })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('Active news & event type options retrieved successfully')
  async getActiveTypeOptions() {
    return this.typeService.getActiveTypeOptions();
  }

  @Get('news-event-type-by-id/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a news & event type by ID' })
  @ApiOkResponse({ type: NewsEventTypeResponseDto })
  @ApiNotFoundResponse({ description: 'Type not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('News & event type retrieved successfully')
  async getTypeById(@Param('id', ParseIntPipe) id: number) {
    return this.typeService.getTypeById(id);
  }

  @Patch('update-news-event-type/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Update a news & event type',
    description: 'Partial update. Changing the name re-derives the slug.',
  })
  @ApiBody({ type: UpdateNewsEventTypeDto })
  @ApiOkResponse({ type: NewsEventTypeResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiConflictResponse({ description: 'A type with this name already exists.' })
  @ApiNotFoundResponse({ description: 'Type not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('News & event type updated successfully')
  async updateType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNewsEventTypeDto,
    @Req() req: AuthedRequest,
  ) {
    return this.typeService.updateType(id, this.userId(req), dto);
  }

  @Delete('delete-news-event-type/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a news & event type',
    description:
      'Permanently deletes an unused type. A type used by any post (deleted posts included) cannot be deleted — deactivate it instead. Admin only.',
  })
  @ApiNotFoundResponse({ description: 'Type not found.' })
  @ApiConflictResponse({ description: 'Type is still used by posts.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ResponseMessage('News & event type deleted successfully')
  async deleteType(@Param('id', ParseIntPipe) id: number) {
    return this.typeService.deleteType(id);
  }

  // ─── Public ──────────────────────────────────────────────────────────────────

  @Get('active-news-event-types')
  @ApiOperation({
    summary: 'Get active news & event types (Public)',
    description:
      'Ordered list for the storefront filter. Use `slug` as the `type` filter.',
  })
  @ApiOkResponse({ type: [NewsEventTypePublicDto] })
  @ResponseMessage('Active news & event types retrieved successfully')
  async getActiveTypes() {
    return this.typeService.getActiveTypes();
  }

  private userId(req: AuthedRequest): number {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return req.user.id;
  }
}
