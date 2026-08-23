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
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DeliveryChargeService } from './delivery-charge.service';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';
import {
  CreateFreeDeliveryRuleDto,
  FreeDeliveryRuleQueryDto,
  UpdateFreeDeliveryRuleDto,
} from './dto/free-delivery-rule.dto';
import {
  DeliveryZoneResponseDto,
  FreeDeliveryRuleResponseDto,
} from './dto/delivery-zone-response.dto';
import { FreeDeliveryThresholdDto } from './dto/delivery-quote-response.dto';
import {
  NationwideFlatRateDto,
  SetNationwideFlatRateDto,
} from './dto/nationwide-flat-rate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { Public } from '../../common/decorators/auth/public.decorator';
import { UserRole } from '../../generated/prisma/enums';
import {
  ApiPaginatedResponse,
  PaginationQueryDto,
} from '../../shared/pagination';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';

/**
 * The merchant's own delivery rate card and its free-delivery rules.
 *
 * Every write here is a pricing decision, so the whole admin surface is behind
 * `JwtAuthGuard + RolesGuard` and limited to ADMIN and MANAGER — the same pair
 * that owns the courier directory on the Set Up page. MARKETING is
 * deliberately *not* included even though free delivery is a promotion: unlike
 * a promo code, a free-delivery rule can be scoped to a destination zone, and
 * a badly-scoped one loses money on every order to that zone silently rather
 * than being redeemed a countable number of times.
 *
 * The one public route is the storefront's "free delivery over X" banner,
 * which reveals nothing an unauthenticated customer could not read off the
 * checkout page anyway.
 *
 * NOTE: the checkout quote itself is **not** here — it lives at
 * `POST /order/delivery-quote`. Quoting needs live catalog prices to work out
 * the basket total a threshold rule is measured against, and that resolution
 * belongs to the order module; putting the route here would mean either
 * duplicating it or a circular module dependency. Delivery-charge owns the
 * *rules*, order owns the *basket*.
 */
@ApiTags('Delivery Charge')
@Controller('delivery-charge')
export class DeliveryChargeController {
  constructor(private readonly deliveryChargeService: DeliveryChargeService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // Storefront
  // ══════════════════════════════════════════════════════════════════════════

  @Get('free-delivery-threshold')
  @Public()
  @ApiOperation({
    summary: 'The site-wide "free delivery over X" promise, if one is live',
    description:
      'Backs the storefront banner and the cart-page nudge. Answers only the site-wide question — zone-scoped rules are excluded, because the homepage does not know where the parcel is going and advertising one would be a promise broken at checkout. Returns available: false when no such rule is running.',
  })
  @ApiOkResponse({
    description: 'Free-delivery threshold retrieved.',
    type: FreeDeliveryThresholdDto,
  })
  @ResponseMessage('Free delivery threshold retrieved successfully')
  async getFreeDeliveryThreshold(): Promise<FreeDeliveryThresholdDto> {
    const rule =
      await this.deliveryChargeService.getPublicFreeDeliveryThreshold();
    return new FreeDeliveryThresholdDto(rule);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Admin — nationwide flat rate (one charge, everywhere)
  // ══════════════════════════════════════════════════════════════════════════

  @Get('nationwide-flat-rate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Read the one-charge-everywhere rate, and what overrides it',
    description:
      'Returns configured: false when no nationwide rate has been set up. overridingZones names the active zones that take precedence wherever they match — a nationwide rate is the catch-all, so it only reaches addresses no other zone claims, and an empty list is what makes "everywhere" literally true.',
  })
  @ApiOkResponse({
    description: 'Nationwide flat rate retrieved.',
    type: NationwideFlatRateDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ResponseMessage('Nationwide delivery charge retrieved successfully')
  async getNationwideFlatRate() {
    return this.deliveryChargeService.getNationwideFlatRate();
  }

  @Put('set-nationwide-flat-rate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set one delivery charge for the whole country',
    description:
      'The simplest rate card there is, and for most shops the only one they need: one fee, one delivery-time promise, no zones to design. ' +
      'Idempotent — creates the zone the first time and updates it after, so the screen needs a single save button. ' +
      'Underneath it builds an ordinary zone (flat basis, no coverage rules, catch-all, one open-ended band), so a shop can start here and later add a REMOTE zone beside it without migrating anything. ' +
      'Pass exclusive: true to deactivate every other zone and make this the only rate in effect; zones are set INACTIVE, never deleted, so it is reversible.',
  })
  @ApiOkResponse({
    description: 'Nationwide flat rate saved.',
    type: NationwideFlatRateDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ResponseMessage('Nationwide delivery charge saved successfully')
  async setNationwideFlatRate(
    @Body() dto: SetNationwideFlatRateDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.deliveryChargeService.setNationwideFlatRate(req.user.id, dto);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Admin — zones (the rate card)
  // ══════════════════════════════════════════════════════════════════════════

  @Post('create-zone')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a delivery zone with its coverage rules and rate card',
    description:
      'One call creates the zone, its area rules and its rate bands together — a zone with no areas matches nothing and one with no rates prices nothing, so a split write would leave a half-built zone visible to the calculator. The rate card is checked for a usable shape (one open-ended top band, no bands with an inverted range) and the database additionally rejects any two active bands that overlap.',
  })
  @ApiCreatedResponse({
    description: 'Delivery zone created.',
    type: DeliveryZoneResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid input, or a rate card that cannot price every basket.',
  })
  @ApiConflictResponse({ description: 'A zone with this code already exists.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ResponseMessage('Delivery zone created successfully')
  async createZone(
    @Body() dto: CreateDeliveryZoneDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.deliveryChargeService.createZone(req.user.id, dto);
  }

  @Get('all-zones')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List delivery zones with their rules (paginated)',
    description:
      'Each row carries its full coverage set and rate card, because the admin screen edits a zone as one form. search matches the zone code and both names. Sorted by priority by default, which is the order the calculator breaks ties in.',
  })
  @ApiPaginatedResponse(
    DeliveryZoneResponseDto,
    'Delivery zones retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ResponseMessage('Delivery zones retrieved successfully')
  async getAllZones(@Query() query: PaginationQueryDto) {
    return this.deliveryChargeService.getAllZones(query);
  }

  @Get('zone/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get one delivery zone with its full rule set' })
  @ApiOkResponse({
    description: 'Delivery zone retrieved.',
    type: DeliveryZoneResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ApiNotFoundResponse({ description: 'Delivery zone not found.' })
  @ResponseMessage('Delivery zone retrieved successfully')
  async getZoneById(@Param('id', ParseIntPipe) id: number) {
    return this.deliveryChargeService.getZoneById(id);
  }

  @Patch('update-zone/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a delivery zone',
    description:
      'Scalar fields merge. areas and rates replace wholesale when present and are left untouched when omitted — they are sets an admin edits as a grid, and replacing the whole set in one transaction is what keeps the rate card from ever being half-migrated. Setting isDefault stands down whichever zone currently holds it.',
  })
  @ApiOkResponse({
    description: 'Delivery zone updated.',
    type: DeliveryZoneResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid input, or a rate card that cannot price every basket.',
  })
  @ApiConflictResponse({
    description: 'The new code collides with another zone.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ApiNotFoundResponse({ description: 'Delivery zone not found.' })
  @ResponseMessage('Delivery zone updated successfully')
  async updateZone(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDeliveryZoneDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.deliveryChargeService.updateZone(id, req.user.id, dto);
  }

  @Delete('delete-zone/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a delivery zone',
    description:
      'Its area rules, rate bands and zone-scoped free-delivery rules go with it. The fallback zone cannot be deleted while it holds that role — hand the default to another zone first, or every address no other zone covers would be refused at checkout.',
  })
  @ApiConflictResponse({
    description: 'This zone is the fallback for uncovered addresses.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ApiNotFoundResponse({ description: 'Delivery zone not found.' })
  @ResponseMessage('Delivery zone deleted successfully')
  async deleteZone(@Param('id', ParseIntPipe) id: number) {
    return this.deliveryChargeService.deleteZone(id);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Admin — free-delivery rules
  // ══════════════════════════════════════════════════════════════════════════

  @Post('create-free-delivery-rule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a free-delivery rule',
    description:
      "The waiver layer — it never changes what delivery costs, only how much of it the merchant absorbs, so an order can always show both the fee and the waiver. Each trigger requires its own input (MIN_ORDER_AMOUNT needs a threshold, PROMO_CODE a coupon) and refuses the others'. Rules are evaluated by priority and the first match wins; they never stack.",
  })
  @ApiCreatedResponse({
    description: 'Free-delivery rule created.',
    type: FreeDeliveryRuleResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid input, or a trigger missing the input it needs to fire.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ResponseMessage('Free delivery rule created successfully')
  async createFreeDeliveryRule(
    @Body() dto: CreateFreeDeliveryRuleDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.deliveryChargeService.createRule(req.user.id, dto);
  }

  @Get('all-free-delivery-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List free-delivery rules (paginated)',
    description:
      'Sorted by priority by default — the order the calculator actually evaluates them in, so the list reads the way the rules run. search matches name and description.',
  })
  @ApiPaginatedResponse(
    FreeDeliveryRuleResponseDto,
    'Free delivery rules retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ResponseMessage('Free delivery rules retrieved successfully')
  async getAllFreeDeliveryRules(@Query() query: FreeDeliveryRuleQueryDto) {
    return this.deliveryChargeService.getAllRules(query);
  }

  @Patch('update-free-delivery-rule/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a free-delivery rule',
    description:
      'Partial. The trigger/input pairing is re-checked against the merged row, not the patch, and changing the trigger clears the input the old one used — so a rule can never end up carrying a condition that is never evaluated.',
  })
  @ApiOkResponse({
    description: 'Free-delivery rule updated.',
    type: FreeDeliveryRuleResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid input, or a trigger missing the input it needs to fire.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ApiNotFoundResponse({ description: 'Free-delivery rule not found.' })
  @ResponseMessage('Free delivery rule updated successfully')
  async updateFreeDeliveryRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFreeDeliveryRuleDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.deliveryChargeService.updateRule(id, req.user.id, dto);
  }

  @Delete('delete-free-delivery-rule/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a free-delivery rule',
    description:
      "A hard delete. Orders snapshot the rule's customer-facing name, not its id, so past receipts still explain why their delivery was free. To stop a rule without losing its history in the admin list, set isActive to false instead.",
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ApiNotFoundResponse({ description: 'Free-delivery rule not found.' })
  @ResponseMessage('Free delivery rule deleted successfully')
  async deleteFreeDeliveryRule(@Param('id', ParseIntPipe) id: number) {
    return this.deliveryChargeService.deleteRule(id);
  }
}
