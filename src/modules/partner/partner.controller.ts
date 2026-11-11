import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';
import { THROTTLER_SHORT } from '../../common/throttler/throttler.constants';
import { UserRole } from '../../generated/prisma/enums';
import { ApiPaginatedResponse } from '../../shared/pagination';
import { PartnerService } from './partner.service';
import { PARTNER_REQUEST_THROTTLE } from './partner.constants';
import {
  CreatePartnerOptionDto,
  PartnerOptionQueryDto,
  UpdatePartnerOptionDto,
} from './dto/partner-option.dto';
import {
  CreatePartnerRequestDto,
  PartnerRequestQueryDto,
  UpdatePartnerRequestStatusDto,
} from './dto/partner-request.dto';
import {
  PartnerOptionMinifiedResponseDto,
  PartnerOptionResponseDto,
  PartnerRequestResponseDto,
} from './dto/partner-response.dto';

type AuthedRequest = Request & { user?: { id: number } };

function requireUserId(req: AuthedRequest): number {
  if (!req.user?.id) {
    throw new UnauthorizedException('User identity missing from request');
  }
  return req.user.id;
}

@ApiTags('Partner')
@Controller('partner')
export class PartnerController {
  constructor(private readonly partnerService: PartnerService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTNER TYPE
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('create-type')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a partner type',
    description:
      'Adds an option to the "Type" dropdown. Re-adding the name of an archived type restores it. Admin only.',
  })
  @ApiBody({ type: CreatePartnerOptionDto })
  @ApiCreatedResponse({ type: PartnerOptionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiConflictResponse({ description: 'A type with this name already exists.' })
  @ResponseMessage('Partner type created successfully')
  async createType(
    @Body() dto: CreatePartnerOptionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.partnerService.createType(requireUserId(req), dto);
  }

  @Get('all-types')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all partner types (paginated)',
    description:
      'Includes archived types (read-only). Filter with `?status=`. Admin only.',
  })
  @ApiPaginatedResponse(
    PartnerOptionResponseDto,
    'Partner types retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ResponseMessage('Partner types retrieved successfully')
  async getAllTypes(@Query() query: PartnerOptionQueryDto) {
    return this.partnerService.getAllTypes(query);
  }

  @Get('active-types')
  @ApiOperation({
    summary: 'Get active partner types (Public)',
    description:
      'Options for the "Type" dropdown on the Become a Partner form.',
  })
  @ApiOkResponse({ type: [PartnerOptionMinifiedResponseDto] })
  @ResponseMessage('Active partner types retrieved successfully')
  async getActiveTypes() {
    return this.partnerService.getActiveTypes();
  }

  @Get('type/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a partner type by ID. Admin only.' })
  @ApiOkResponse({ type: PartnerOptionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Partner type not found.' })
  @ResponseMessage('Partner type retrieved successfully')
  async getTypeById(@Param('id', ParseIntPipe) id: number) {
    return this.partnerService.getTypeById(id);
  }

  @Patch('update-type/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a partner type',
    description:
      'Change its name or ACTIVE/INACTIVE status. Archived rows cannot be edited. Admin only.',
  })
  @ApiBody({ type: UpdatePartnerOptionDto })
  @ApiOkResponse({ type: PartnerOptionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Partner type not found.' })
  @ApiConflictResponse({ description: 'A type with this name already exists.' })
  @ResponseMessage('Partner type updated successfully')
  async updateType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePartnerOptionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.partnerService.updateType(id, requireUserId(req), dto);
  }

  @Delete('delete-type/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Archive (soft delete) a partner type',
    description:
      'Sets status to ARCHIVED. The row is kept so existing partner requests still show their type. Archived rows are read-only. Admin only.',
  })
  @ApiOkResponse({ type: PartnerOptionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Partner type not found.' })
  @ApiConflictResponse({ description: 'Partner type is already archived.' })
  @ResponseMessage('Partner type deleted successfully')
  async deleteType(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.partnerService.archiveType(id, requireUserId(req));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTNER COUNTRY
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('create-country')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a partner country',
    description:
      'Adds an option to the "Country" dropdown. Re-adding the name of an archived country restores it. Admin only.',
  })
  @ApiBody({ type: CreatePartnerOptionDto })
  @ApiCreatedResponse({ type: PartnerOptionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiConflictResponse({
    description: 'A country with this name already exists.',
  })
  @ResponseMessage('Country created successfully')
  async createCountry(
    @Body() dto: CreatePartnerOptionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.partnerService.createCountry(requireUserId(req), dto);
  }

  @Get('all-countries')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all partner countries (paginated)',
    description:
      'Includes archived countries (read-only). Filter with `?status=`. Admin only.',
  })
  @ApiPaginatedResponse(
    PartnerOptionResponseDto,
    'Countries retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ResponseMessage('Countries retrieved successfully')
  async getAllCountries(@Query() query: PartnerOptionQueryDto) {
    return this.partnerService.getAllCountries(query);
  }

  @Get('active-countries')
  @ApiOperation({
    summary: 'Get active partner countries (Public)',
    description:
      'Options for the "Country" dropdown on the Become a Partner form.',
  })
  @ApiOkResponse({ type: [PartnerOptionMinifiedResponseDto] })
  @ResponseMessage('Active countries retrieved successfully')
  async getActiveCountries() {
    return this.partnerService.getActiveCountries();
  }

  @Get('country/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a partner country by ID. Admin only.' })
  @ApiOkResponse({ type: PartnerOptionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Country not found.' })
  @ResponseMessage('Country retrieved successfully')
  async getCountryById(@Param('id', ParseIntPipe) id: number) {
    return this.partnerService.getCountryById(id);
  }

  @Patch('update-country/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a partner country',
    description:
      'Change its name or ACTIVE/INACTIVE status. Archived rows cannot be edited. Admin only.',
  })
  @ApiBody({ type: UpdatePartnerOptionDto })
  @ApiOkResponse({ type: PartnerOptionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Country not found.' })
  @ApiConflictResponse({
    description: 'A country with this name already exists.',
  })
  @ResponseMessage('Country updated successfully')
  async updateCountry(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePartnerOptionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.partnerService.updateCountry(id, requireUserId(req), dto);
  }

  @Delete('delete-country/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Archive (soft delete) a partner country',
    description:
      'Sets status to ARCHIVED. The row is kept so existing partner requests still show their country. Archived rows are read-only. Admin only.',
  })
  @ApiOkResponse({ type: PartnerOptionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Country not found.' })
  @ApiConflictResponse({ description: 'Country is already archived.' })
  @ResponseMessage('Country deleted successfully')
  async deleteCountry(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.partnerService.archiveCountry(id, requireUserId(req));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTNER REQUEST
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('submit-request')
  @Throttle({ [THROTTLER_SHORT]: PARTNER_REQUEST_THROTTLE })
  @ApiOperation({
    summary: 'Submit a Become a Partner request (Public)',
    description:
      'Public form submission. `partnerTypeId` and `partnerCountryId` must reference ACTIVE options. Rate-limited per IP.',
  })
  @ApiBody({ type: CreatePartnerRequestDto })
  @ApiCreatedResponse({ type: PartnerRequestResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid input, or the selected type/country is not active.',
  })
  @ApiTooManyRequestsResponse({ description: 'Too many submissions.' })
  @ResponseMessage('Your partner request has been submitted successfully')
  async submitRequest(@Body() dto: CreatePartnerRequestDto) {
    return this.partnerService.createRequest(dto);
  }

  @Get('all-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all partner requests (paginated)',
    description:
      'Searchable by name / company name; filterable by status, type and country. Admin only.',
  })
  @ApiPaginatedResponse(
    PartnerRequestResponseDto,
    'Partner requests retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ResponseMessage('Partner requests retrieved successfully')
  async getAllRequests(@Query() query: PartnerRequestQueryDto) {
    return this.partnerService.getAllRequests(query);
  }

  @Get('request/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a partner request by ID. Admin only.' })
  @ApiOkResponse({ type: PartnerRequestResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Partner request not found.' })
  @ResponseMessage('Partner request retrieved successfully')
  async getRequestById(@Param('id', ParseIntPipe) id: number) {
    return this.partnerService.getRequestById(id);
  }

  @Patch('update-request-status/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a partner request status',
    description:
      'Move a request to PENDING / CONTACTED / APPROVED / REJECTED. Archived requests cannot be changed. Admin only.',
  })
  @ApiBody({ type: UpdatePartnerRequestStatusDto })
  @ApiOkResponse({ type: PartnerRequestResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid status.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Partner request not found.' })
  @ResponseMessage('Partner request status updated successfully')
  async updateRequestStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePartnerRequestStatusDto,
  ) {
    return this.partnerService.updateRequestStatus(id, dto.status);
  }

  @Delete('delete-request/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Archive (soft delete) a partner request',
    description:
      'Sets status to ARCHIVED. The request stays in the admin list but becomes read-only. Admin only.',
  })
  @ApiOkResponse({ type: PartnerRequestResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Partner request not found.' })
  @ApiConflictResponse({ description: 'Partner request is already archived.' })
  @ResponseMessage('Partner request deleted successfully')
  async deleteRequest(@Param('id', ParseIntPipe) id: number) {
    return this.partnerService.archiveRequest(id);
  }
}
