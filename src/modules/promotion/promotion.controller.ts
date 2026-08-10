import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { PromotionService } from './promotion.service';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';
import { PromoCodeQueryDto } from './dto/promo-code-query.dto';
import { ValidatePromoCodeDto } from './dto/validate-promo-code.dto';
import { PromoCodeResponseDto } from './dto/promo-code-response.dto';
import { PromoCodeValidationResponseDto } from './dto/promo-code-validation-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { Public } from '../../common/decorators/auth/public.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';
import { ApiPaginatedResponse } from '../../shared/pagination';

type AuthedRequest = Request & { user?: { id: number } };

@ApiTags('Promotion')
@Controller('promotion/promo-codes')
export class PromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  @Post('create-promo-code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a new promo/coupon code',
    description:
      'Creates a FIXED or PERCENTAGE discount code. Admin/Marketing only.',
  })
  @ApiBody({ type: CreatePromoCodeDto })
  @ApiCreatedResponse({
    description: 'Promo code created successfully.',
    type: PromoCodeResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiConflictResponse({
    description: 'A promo code with this code already exists.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('Promo code created successfully')
  async createPromoCode(@Body() dto: CreatePromoCodeDto) {
    return this.promotionService.createPromoCode(dto);
  }

  @Get('all-promo-codes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all promo codes (paginated)',
    description:
      'Returns every promo code with pagination, search (code/description), and discountType/isActive filters. Admin/Marketing only.',
  })
  @ApiPaginatedResponse(
    PromoCodeResponseDto,
    'Promo codes retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ResponseMessage('Promo codes retrieved successfully')
  async getAllPromoCodes(@Query() query: PromoCodeQueryDto) {
    return this.promotionService.listPromoCodes(query);
  }

  @Post('validate')
  @Public()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Validate a promo code and preview its discount (guest or logged-in)',
    description:
      'Works with or without a Bearer token, for the cart/checkout "Apply Coupon" button. ' +
      'Read-only — does not reserve or redeem the code. Placing the order re-validates it.',
  })
  @ApiBody({ type: ValidatePromoCodeDto })
  @ApiOkResponse({
    description: 'Promo code is valid — discount preview returned.',
    type: PromoCodeValidationResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid, inactive, expired, not-yet-started code; subtotal below minOrderAmount; usage limit reached.',
  })
  @ResponseMessage('Promo code validated successfully')
  async validatePromoCode(
    @Body() dto: ValidatePromoCodeDto,
    @Req() req: AuthedRequest,
  ) {
    return this.promotionService.previewDiscount(dto, req.user?.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a promo code by ID (Admin/Marketing only)' })
  @ApiOkResponse({
    description: 'Promo code retrieved successfully.',
    type: PromoCodeResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ApiNotFoundResponse({ description: 'Promo code not found.' })
  @ResponseMessage('Promo code retrieved successfully')
  async getPromoCodeById(@Param('id', ParseIntPipe) id: number) {
    return this.promotionService.getPromoCodeById(id);
  }

  @Patch('update-promo-code/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MARKETING)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a promo code',
    description:
      'Partially updates a promo code. code/discountType are immutable — retire a code via isActive: false and create a new one instead. Admin/Marketing only.',
  })
  @ApiBody({ type: UpdatePromoCodeDto })
  @ApiOkResponse({
    description: 'Promo code updated successfully.',
    type: PromoCodeResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid input, an inactive code being edited without reactivating it, or an illegal usage-limit/date change.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Marketing role required.' })
  @ApiNotFoundResponse({ description: 'Promo code not found.' })
  @ResponseMessage('Promo code updated successfully')
  async updatePromoCode(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePromoCodeDto,
  ) {
    return this.promotionService.updatePromoCode(id, dto);
  }
}
