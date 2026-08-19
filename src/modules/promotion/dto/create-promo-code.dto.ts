import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DiscountType } from '../../../generated/prisma/enums';
import { IsAfter } from '../../../common/decorators/validation/is-after.decorator';
import { IsEmptyWhen } from '../../../common/decorators/validation/is-empty-when.decorator';
import { trimString } from '../../../common/utils/json-transform.util';

//* CUSTOMER-FACING CODE, STORED UPPERCASE BY APP-LAYER CONVENTION (SEE
//* promotion.prisma) — UPPERCASING HERE MEANS EVERY DOWNSTREAM LOOKUP
//* (ORDER PLACEMENT, THE PUBLIC validate ENDPOINT) CAN DO A PLAIN EXACT
//* MATCH ON `code` INSTEAD OF A CASE-INSENSITIVE QUERY.
export class CreatePromoCodeDto {
  @ApiProperty({
    description:
      'Customer-facing coupon code, e.g. "WELCOME10". Normalized to uppercase.',
    example: 'WELCOME10',
    minLength: 3,
    maxLength: 50,
  })
  @Transform(({ value }) => trimString(value)?.toString().toUpperCase())
  @IsNotEmpty({ message: 'Code is required' })
  @IsString({ message: 'Code must be a valid text string' })
  @MinLength(3, { message: 'Code must be at least 3 characters long' })
  @MaxLength(50, { message: 'Code cannot exceed 50 characters' })
  @Matches(/^(?=.*[A-Z])[A-Z0-9_-]+$/, {
    message:
      'Code must contain at least one letter and only letters, numbers, hyphens, or underscores',
  })
  code!: string;

  @ApiPropertyOptional({
    description: 'Internal/admin-facing description of this promotion',
    example: 'Welcome discount for first-time customers',
    maxLength: 500,
  })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString({ message: 'Description must be a valid text string' })
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @ApiProperty({
    enum: DiscountType,
    description: 'FIXED (flat amount off) or PERCENTAGE (% off subtotal)',
    example: DiscountType.PERCENTAGE,
  })
  @IsEnum(DiscountType, {
    message: 'Discount type must be either FIXED or PERCENTAGE',
  })
  discountType!: DiscountType;

  @ApiProperty({
    description:
      'Discount amount — a flat currency value for FIXED, or a percentage (0-100) for PERCENTAGE',
    example: 10,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Discount value must be a number' })
  @IsPositive({ message: 'Discount value must be greater than zero' })
  discountValue!: number;

  @ApiPropertyOptional({
    description:
      'Order subtotal must reach this amount before the code applies',
    example: 500,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({}, { message: 'Minimum order amount must be a number' })
  @IsPositive({ message: 'Minimum order amount must be greater than zero' })
  minOrderAmount?: number;

  @ApiPropertyOptional({
    description:
      'Caps the payout for a PERCENTAGE code. Not allowed for FIXED, which is already a hard cap on its own.',
    example: 200,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({}, { message: 'Maximum discount amount must be a number' })
  @IsPositive({ message: 'Maximum discount amount must be greater than zero' })
  @IsEmptyWhen('discountType', DiscountType.FIXED, {
    message:
      'Maximum discount amount is not applicable to a FIXED discount code',
  })
  maxDiscountAmount?: number;

  @ApiPropertyOptional({
    description:
      'Total redemptions allowed across all customers. Omit for unlimited.',
    example: 100,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Usage limit must be an integer' })
  @IsPositive({ message: 'Usage limit must be greater than zero' })
  usageLimit?: number;

  @ApiPropertyOptional({
    description: 'Redemptions allowed per customer. Omit for unlimited.',
    example: 1,
    default: 1,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Usage limit per user must be an integer' })
  @IsPositive({ message: 'Usage limit per user must be greater than zero' })
  usageLimitPerUser?: number;

  @ApiPropertyOptional({
    description: 'Whether the code is active. Defaults to true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Whether this code is listed on the storefront for customers to browse. ' +
      'Independent of isActive: a code can work perfectly and still be unlisted, ' +
      'which is the default and the right choice for any code handed out ' +
      'deliberately (email campaign, influencer, win-back).',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isPublic must be a boolean' })
  isPublic?: boolean;

  @ApiPropertyOptional({
    description: 'When the code becomes valid. Omit for immediately valid.',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Start date must be a valid ISO date string' })
  startsAt?: string;

  @ApiPropertyOptional({
    description: 'When the code stops being valid. Omit for no expiry.',
    example: '2026-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'End date must be a valid ISO date string' })
  @IsAfter('startsAt', { message: 'End date must be after the start date' })
  endsAt?: string;
}
