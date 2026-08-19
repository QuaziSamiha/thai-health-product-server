import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../../common/utils/json-transform.util';

//* code/discountType ARE DELIBERATELY NOT EDITABLE HERE — CHANGING EITHER
//* AFTER THE CODE HAS BEEN SHARED WITH CUSTOMERS OR REDEEMED WOULD MAKE THE
//* PromoCodeRedemption LEDGER'S discountApplied SNAPSHOTS HARD TO REASON
//* ABOUT. RETIRE A CODE VIA isActive: false AND CREATE A NEW ONE INSTEAD.
export class UpdatePromoCodeDto {
  @ApiPropertyOptional({
    description: 'Internal/admin-facing description of this promotion',
    maxLength: 500,
  })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString({ message: 'Description must be a valid text string' })
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @ApiPropertyOptional({
    description:
      'Discount amount — a flat currency value for FIXED, or a percentage (0-100) for PERCENTAGE',
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({}, { message: 'Discount value must be a number' })
  @IsPositive({ message: 'Discount value must be greater than zero' })
  discountValue?: number;

  @ApiPropertyOptional({
    description:
      'Order subtotal must reach this amount before the code applies',
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({}, { message: 'Minimum order amount must be a number' })
  @IsPositive({ message: 'Minimum order amount must be greater than zero' })
  minOrderAmount?: number;

  @ApiPropertyOptional({
    description: 'Caps the payout for a PERCENTAGE code',
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({}, { message: 'Maximum discount amount must be a number' })
  @IsPositive({ message: 'Maximum discount amount must be greater than zero' })
  maxDiscountAmount?: number;

  @ApiPropertyOptional({
    description:
      'Total redemptions allowed across all customers. Cannot be set below the current used count.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Usage limit must be an integer' })
  @IsPositive({ message: 'Usage limit must be greater than zero' })
  usageLimit?: number;

  @ApiPropertyOptional({ description: 'Redemptions allowed per customer' })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Usage limit per user must be an integer' })
  @IsPositive({ message: 'Usage limit per user must be greater than zero' })
  usageLimitPerUser?: number;

  @ApiPropertyOptional({
    description: 'Activate or deactivate the code',
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Publish or unpublish this code on the storefront coupon list. Unpublishing ' +
      'only hides it — anyone already holding the code can still redeem it while ' +
      'isActive stays true.',
  })
  @IsOptional()
  @IsBoolean({ message: 'isPublic must be a boolean' })
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'When the code becomes valid' })
  @IsOptional()
  @IsDateString({}, { message: 'Start date must be a valid ISO date string' })
  startsAt?: string;

  @ApiPropertyOptional({ description: 'When the code stops being valid' })
  @IsOptional()
  @IsDateString({}, { message: 'End date must be a valid ISO date string' })
  endsAt?: string;
}
