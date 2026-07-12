import { SupportService } from './support.service';
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
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { CreateSupportDto } from './dto/create-support.dto';
import { UpdateSupportDto } from './dto/update-support.dto';
import { SupportQueryDto } from './dto/support-query.dto';
import {
  SupportResponseDto,
  SupportResponsePublicDto,
} from './dto/support-response.dto';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole, SupportType } from '../../generated/prisma/enums';
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
  Param,
  ParseEnumPipe,
  Patch,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';

@ApiTags('Support')
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('create-support-page')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING, UserRole.SUPPORT)
  @ApiBearerAuth()
  //* multipart/form-data (VIA AnyFilesInterceptor, EVEN THOUGH NO FILE FIELD
  //* EXISTS YET) SO SWAGGER UI RENDERS ONE INPUT BOX PER FIELD INSTEAD OF A
  //* SINGLE RAW JSON TEXTAREA — MATCHES THE HOME/CATEGORY ADMIN-FORM UX
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create a new support/policy page',
    description:
      'Creates a Delivery Policy, Terms & Conditions, Privacy Policy, Cancellation Policy, Return Policy, or an ad-hoc OTHERS page.',
  })
  @ApiBody({ type: CreateSupportDto })
  @ApiCreatedResponse({
    description: 'Support page created successfully.',
    type: SupportResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiConflictResponse({
    description: 'A support page with the resulting slug already exists.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({
    description: 'Admin, Marketing, or Support role required.',
  })
  @ResponseMessage('Support page created successfully')
  async createSupport(
    @Body() createSupportDto: CreateSupportDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }

    return this.supportService.createSupport(req.user.id, createSupportDto);
  }

  @Get('all-support-pages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING, UserRole.SUPPORT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all support pages (paginated)',
    description:
      'Returns every support page with pagination support, optionally filtered to a single type — matches the admin dashboard tabs (Delivery Policy / Terms & Conditions / ...).',
  })
  @ApiPaginatedResponse(
    SupportResponseDto,
    'Support pages retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({
    description: 'Admin, Marketing, or Support role required.',
  })
  @ResponseMessage('Support pages retrieved successfully')
  async getAllSupports(@Query() queryParams: SupportQueryDto) {
    return this.supportService.getAllSupports(queryParams);
  }

  @Get('active-tabs')
  @ApiOperation({
    summary: 'Get every active support page (Public)',
    description:
      'Returns every ACTIVE support page across all types — used to render the storefront support tab list (Delivery Policy, Terms & Conditions, ...).',
  })
  @ApiOkResponse({
    description: 'Active support pages retrieved successfully.',
    type: [SupportResponsePublicDto],
  })
  @ResponseMessage('Active support pages retrieved successfully')
  async getActiveTabs() {
    return this.supportService.getActiveTabs();
  }

  @Get('active-page/:type')
  @ApiOperation({
    summary: 'Get the active page for a support type (Public)',
    description:
      'Returns the ACTIVE row for the given type. Intended for the five named policy types, which are singleton pages by convention; OTHERS may have multiple rows — look those up by slug instead.',
  })
  @ApiOkResponse({
    description: 'Active support page retrieved successfully.',
    type: SupportResponsePublicDto,
  })
  @ApiNotFoundResponse({
    description: 'No active support page found for this type.',
  })
  @ResponseMessage('Active support page retrieved successfully')
  async getActiveSupportByType(
    @Param('type', new ParseEnumPipe(SupportType)) type: SupportType,
  ) {
    return this.supportService.getActiveSupportByType(type);
  }

  @Get('page/:slug')
  @ApiOperation({
    summary: 'Get an active support page by slug (Public)',
    description:
      'Returns the ACTIVE row matching the given slug — the general-purpose lookup, needed for OTHERS pages which may not have a fixed type-based route.',
  })
  @ApiOkResponse({
    description: 'Support page retrieved successfully.',
    type: SupportResponsePublicDto,
  })
  @ApiNotFoundResponse({ description: 'Support page not found.' })
  @ResponseMessage('Support page retrieved successfully')
  async getActiveSupportBySlug(@Param('slug') slug: string) {
    return this.supportService.getActiveSupportBySlug(slug);
  }

  @Patch('update-support-page/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING, UserRole.SUPPORT)
  @ApiBearerAuth()
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update a support page',
    description: 'Partially updates an existing support/policy page.',
  })
  @ApiBody({ type: UpdateSupportDto })
  @ApiOkResponse({
    description: 'Support page updated successfully.',
    type: SupportResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiConflictResponse({
    description: 'New title results in a duplicate support page.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({
    description: 'Admin, Marketing, or Support role required.',
  })
  @ApiNotFoundResponse({ description: 'Support page not found.' })
  @ResponseMessage('Support page updated successfully')
  async updateSupport(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSupportDto: UpdateSupportDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }

    return this.supportService.updateSupport(id, req.user.id, updateSupportDto);
  }

  @Delete('delete-support-page/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a support page',
    description: 'Permanently deletes a support/policy page. Admin only.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Support page not found.' })
  @ResponseMessage('Support page deleted successfully')
  async deleteSupport(@Param('id', ParseIntPipe) id: number) {
    return this.supportService.deleteSupport(id);
  }
}
