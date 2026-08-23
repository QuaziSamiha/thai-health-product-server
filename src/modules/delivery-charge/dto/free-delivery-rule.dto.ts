import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  blankNumberToUndefined,
  emptyStringToUndefined,
  parseBooleanInput,
  trimString,
} from '../../../common/utils/json-transform.util';
import { IsAfter } from '../../../common/decorators/validation/is-after.decorator';
import { IsOffsetDateString } from '../../../common/decorators/validation/is-offset-date-string.decorator';
import { FreeDeliveryTrigger } from '../../../generated/prisma/enums';
import { PaginationQueryDto } from '../../../shared/pagination';

/**
 * Creates a free-delivery rule.
 *
 * `trigger` decides which of the trigger-specific fields is required, and the
 * service rejects the combinations that could never fire before the database's
 * own CHECK constraint would. Both layers exist deliberately: the DTO gives the
 * admin a field-level message, the constraint protects the table from seeds
 * and psql sessions that never see a DTO.
 */
export class CreateFreeDeliveryRuleDto {
  @ApiProperty({
    description:
      'Customer-facing reason, snapshotted onto every order this waives. Write it for a receipt.',
    example: 'Free delivery over ฿1,000',
    maxLength: 150,
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Rule name is required' })
  @IsString({ message: 'Rule name must be a valid text string' })
  @MinLength(2, { message: 'Rule name must be at least 2 characters long' })
  @MaxLength(150, { message: 'Rule name cannot exceed 150 characters' })
  name!: string;

  @ApiPropertyOptional({ description: 'Internal note for admins.' })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Description must be a valid text string' })
  @MaxLength(2000, { message: 'Description cannot exceed 2000 characters' })
  description?: string;

  @ApiProperty({
    enum: FreeDeliveryTrigger,
    description:
      'What makes this rule fire, on top of its window, zone scope and usage cap.',
    example: FreeDeliveryTrigger.MIN_ORDER_AMOUNT,
  })
  @IsEnum(FreeDeliveryTrigger, { message: 'Trigger is not recognised' })
  trigger!: FreeDeliveryTrigger;

  @ApiPropertyOptional({
    description:
      'Basket threshold in THB. Required for — and only valid on — MIN_ORDER_AMOUNT.',
    example: 1000,
    minimum: 0,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Minimum order amount must be a valid number' })
  @Min(0, { message: 'Minimum order amount cannot be negative' })
  minOrderAmount?: number;

  @ApiPropertyOptional({
    description:
      'Coupon that carries this perk. Required for — and only valid on — PROMO_CODE.',
    example: 1,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Promo code ID must be an integer' })
  @Min(1, { message: 'Promo code ID must be greater than zero' })
  promoCodeId?: number;

  @ApiPropertyOptional({
    description:
      'Limit the rule to one destination zone. Omit to apply it everywhere.',
    example: 1,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Zone ID must be an integer' })
  @Min(1, { message: 'Zone ID must be greater than zero' })
  zoneId?: number;

  @ApiPropertyOptional({
    description:
      'Cap on what the merchant absorbs, in THB. Omit to absorb the whole fee; the customer pays any remainder.',
    example: 60,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Maximum subsidy must be a valid number' })
  @Min(0.01, { message: 'Maximum subsidy must be greater than zero' })
  maxSubsidyAmount?: number;

  @ApiPropertyOptional({
    description:
      'Also waive the cash-on-delivery handling fee. Off by default — COD is a cash-handling charge, not delivery.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'waivesCodFee must be true or false' })
  waivesCodFee?: boolean;

  @ApiPropertyOptional({
    description: 'When the rule becomes valid. Omit for "already live".',
    example: '2026-09-01T00:00:00+07:00',
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsDateString({}, { message: 'Starts at must be a valid ISO date string' })
  @IsOffsetDateString()
  startsAt?: string;

  @ApiPropertyOptional({
    description: 'When the rule expires. Omit for "never".',
    example: '2026-09-30T23:59:59+07:00',
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsDateString({}, { message: 'Ends at must be a valid ISO date string' })
  @IsOffsetDateString()
  @IsAfter('startsAt', { message: 'Ends at must be after starts at' })
  endsAt?: string;

  @ApiPropertyOptional({
    description:
      'Total number of orders this rule may waive. Omit for unlimited.',
    example: 500,
    minimum: 1,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Usage limit must be a whole number' })
  @Min(1, { message: 'Usage limit must be at least 1' })
  usageLimit?: number;

  @ApiPropertyOptional({
    description:
      'Evaluation order. Lower is checked first and the first match wins — rules never stack.',
    example: 100,
    default: 100,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Priority must be a whole number' })
  @Min(0, { message: 'Priority cannot be negative' })
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}

//* PartialType IS SAFE HERE, UNLIKE ON THE ZONE DTO: EVERY CROSS-FIELD RULE
//* THIS DTO CARRIES (endsAt AFTER startsAt) COMPARES TWO FIELDS OF THE
//* *SUBMITTED* PAYLOAD, NOT ONE SUBMITTED FIELD AGAINST A STORED ONE. THE
//* TRIGGER/INPUT PAIRING IS RE-CHECKED IN THE SERVICE AGAINST THE MERGED ROW,
//* WHICH IS THE ONLY PLACE THE EXISTING trigger IS KNOWN.
export class UpdateFreeDeliveryRuleDto extends PartialType(
  CreateFreeDeliveryRuleDto,
) {}

//* NO EXTRA FILTERS BEYOND THE SHARED PAGE/LIMIT/SORT-ORDER/SEARCH CONTRACT —
//* search MATCHES THE RULE NAME, SEE DeliveryChargeRepository.findAllRules.
export class FreeDeliveryRuleQueryDto extends PaginationQueryDto {}
