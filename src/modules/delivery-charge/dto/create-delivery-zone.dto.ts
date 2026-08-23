import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  blankNumberToUndefined,
  emptyStringToUndefined,
  parseBooleanInput,
  trimString,
} from '../../../common/utils/json-transform.util';
import { IsGteField } from '../../../common/decorators/validation/is-gte-field.decorator';
import {
  DeliveryChargeStatus,
  DeliveryRateBasis,
} from '../../../generated/prisma/enums';

//* ONE COVERAGE RULE. EVERY FIELD BUT country IS OPTIONAL BECAUSE OMITTING IT
//* IS THE WILDCARD — SEE THE DeliveryChargeArea COMMENT IN
//* delivery-charge.prisma FOR THE FIVE SHAPES THIS CAN TAKE.
export class DeliveryAreaInputDto {
  @ApiPropertyOptional({
    description: 'Country this rule covers.',
    default: 'Thailand',
    example: 'Thailand',
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Country must be a valid text string' })
  @MaxLength(100, { message: 'Country cannot exceed 100 characters' })
  country?: string;

  @ApiPropertyOptional({
    description: 'Province. Omit to cover every province in the country.',
    example: 'Bangkok',
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'State must be a valid text string' })
  @MaxLength(100, { message: 'State cannot exceed 100 characters' })
  state?: string;

  @ApiPropertyOptional({
    description:
      'District. Requires state — a district on its own would match every province that happens to contain one by that name.',
    example: 'Watthana',
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Region must be a valid text string' })
  @MaxLength(100, { message: 'Region cannot exceed 100 characters' })
  region?: string;

  @ApiPropertyOptional({
    description:
      'Exact postal code — the most specific rule there is. Cannot be combined with postalPrefix.',
    example: '10110',
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @Matches(/^\d{5}$/, {
    message: 'Postal code must be a valid 5-digit Thai postal code, e.g. 10110',
  })
  postalCode?: string;

  @ApiPropertyOptional({
    description:
      'Leading digits of a postal code, e.g. "10" for all of Bangkok. Cannot be combined with postalCode.',
    example: '10',
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @Matches(/^\d{1,5}$/, {
    message: 'Postal prefix must be 1 to 5 digits',
  })
  postalPrefix?: string;
}

//* ONE BAND ON THE ZONE'S AXIS. THE AXIS ITSELF IS THE ZONE'S rateBasis — A
//* TIER NEVER DECLARES ITS OWN UNIT, WHICH IS WHAT KEEPS "WHICH TIER APPLIES"
//* ANSWERABLE. SEE THE DeliveryChargeRate COMMENT IN delivery-charge.prisma.
export class DeliveryRateInputDto {
  @ApiPropertyOptional({
    description: 'Display label for the admin table, e.g. "1-3 kg".',
    example: '1-3 kg',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Label must be a valid text string' })
  @MaxLength(100, { message: 'Label cannot exceed 100 characters' })
  label?: string;

  @ApiPropertyOptional({
    description: "Inclusive lower bound of the band, in the zone's unit.",
    example: 1,
    minimum: 0,
    default: 0,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Minimum value must be a valid number' })
  @Min(0, { message: 'Minimum value cannot be negative' })
  minValue?: number;

  @ApiPropertyOptional({
    description:
      'Exclusive upper bound. Omit for the open-ended top band — every zone needs exactly one, or a heavy basket has no price.',
    example: 3,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Maximum value must be a valid number' })
  @Min(0, { message: 'Maximum value cannot be negative' })
  maxValue?: number;

  @ApiProperty({
    description: 'Fee charged for landing anywhere in this band, in THB.',
    example: 60,
    minimum: 0,
  })
  @Transform(blankNumberToUndefined)
  @Type(() => Number)
  @IsNumber({}, { message: 'Base fee must be a valid number' })
  @Min(0, { message: 'Base fee cannot be negative' })
  baseFee!: number;

  @ApiPropertyOptional({
    description:
      'Size of one overage step above minValue, e.g. 1 (kg). Required whenever stepFee is set.',
    example: 1,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Step unit must be a valid number' })
  @Min(0.001, { message: 'Step unit must be greater than zero' })
  stepUnit?: number;

  @ApiPropertyOptional({
    description:
      'Charge per started step above minValue. Each started unit costs a whole fee, which is how couriers round.',
    example: 20,
    minimum: 0,
    default: 0,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Step fee must be a valid number' })
  @Min(0, { message: 'Step fee cannot be negative' })
  stepFee?: number;

  @ApiPropertyOptional({
    enum: DeliveryChargeStatus,
    description:
      'INACTIVE stages a band without letting it price anything — it is also exempt from the no-overlap rule, so a replacement can sit next to the band it will supersede.',
    default: DeliveryChargeStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(DeliveryChargeStatus, { message: 'Status is not recognised' })
  status?: DeliveryChargeStatus;
}

/**
 * Creates a delivery zone together with its coverage rules and rate card in
 * one call.
 *
 * Nested rather than three separate endpoints because a zone is not usable
 * until it has both: one with no areas matches nothing, one with no rates
 * prices nothing. Splitting the write would leave a half-built zone visible to
 * the calculator between the two calls.
 */
export class CreateDeliveryZoneDto {
  @ApiProperty({
    description:
      'Stable lookup key. Uppercased and underscored on the way in, so "bkk metro" and "BKK_METRO" are the same zone.',
    example: 'BKK_METRO',
    maxLength: 50,
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .trim()
          .toUpperCase()
          .replace(/[\s-]+/g, '_')
      : value,
  )
  @IsNotEmpty({ message: 'Zone code is required' })
  @IsString({ message: 'Zone code must be a valid text string' })
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Zone code may only contain letters, numbers and underscores',
  })
  @MaxLength(50, { message: 'Zone code cannot exceed 50 characters' })
  code!: string;

  @ApiProperty({
    description: 'Display name.',
    example: 'Bangkok Metropolitan',
    maxLength: 150,
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Zone name is required' })
  @IsString({ message: 'Zone name must be a valid text string' })
  @MinLength(2, { message: 'Zone name must be at least 2 characters long' })
  @MaxLength(150, { message: 'Zone name cannot exceed 150 characters' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Thai display name.',
    example: 'กรุงเทพและปริมณฑล',
    maxLength: 150,
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Thai name must be a valid text string' })
  @MaxLength(150, { message: 'Thai name cannot exceed 150 characters' })
  nameTh?: string;

  @ApiPropertyOptional({ description: 'Internal note for admins.' })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Description must be a valid text string' })
  @MaxLength(2000, { message: 'Description cannot exceed 2000 characters' })
  description?: string;

  @ApiPropertyOptional({
    description:
      'Make this the catch-all for addresses no area rule matches. At most one active zone may hold it — an existing default is stood down automatically.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isDefault must be true or false' })
  isDefault?: boolean;

  @ApiPropertyOptional({
    description: 'Tie-break when two zones match equally well. Lower wins.',
    example: 100,
    default: 100,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Priority must be a whole number' })
  @Min(0, { message: 'Priority cannot be negative' })
  priority?: number;

  @ApiProperty({
    description: 'Fastest-case delivery time, in days.',
    example: 1,
    minimum: 0,
  })
  @Transform(blankNumberToUndefined)
  @Type(() => Number)
  @IsInt({ message: 'Minimum delivery days must be a whole number' })
  @Min(0, { message: 'Minimum delivery days cannot be negative' })
  minDeliveryDays!: number;

  @ApiProperty({
    description:
      'Slowest-case delivery time, in days. Must be greater than or equal to minDeliveryDays.',
    example: 2,
    minimum: 0,
  })
  @Transform(blankNumberToUndefined)
  @Type(() => Number)
  @IsInt({ message: 'Maximum delivery days must be a whole number' })
  @Min(0, { message: 'Maximum delivery days cannot be negative' })
  @IsGteField('minDeliveryDays', {
    message:
      'Maximum delivery days must be greater than or equal to minimum delivery days',
  })
  maxDeliveryDays!: number;

  @ApiPropertyOptional({
    description:
      'Same-day dispatch cut-off, in minutes past midnight Asia/Bangkok (960 = 16:00). Orders after it start counting from the next day.',
    example: 960,
    minimum: 0,
    maximum: 1439,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Cut-off must be a whole number of minutes' })
  @Min(0, { message: 'Cut-off cannot be negative' })
  @Max(1439, { message: 'Cut-off must be under 1440 (24 hours)' })
  cutOffMinutes?: number;

  @ApiPropertyOptional({
    description:
      'Skip Sundays when counting delivery days. Thai couriers work Saturdays, so Sunday is the only non-working day modelled.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'businessDaysOnly must be true or false' })
  businessDaysOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Flat packaging/fulfilment fee added on every order here.',
    example: 0,
    minimum: 0,
    default: 0,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Handling fee must be a valid number' })
  @Min(0, { message: 'Handling fee cannot be negative' })
  handlingFee?: number;

  @ApiPropertyOptional({
    description:
      'Remote-area surcharge for deep-south provinces and islands, added on top of the rate tier.',
    example: 0,
    minimum: 0,
    default: 0,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Remote surcharge must be a valid number' })
  @Min(0, { message: 'Remote surcharge cannot be negative' })
  remoteSurcharge?: number;

  @ApiPropertyOptional({
    description:
      'Refuse baskets heavier than this, in kg, rather than pricing them off the top tier and failing at the counter.',
    example: 20,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Maximum weight must be a valid number' })
  @Min(0.001, { message: 'Maximum weight must be greater than zero' })
  maxWeightKg?: number;

  @ApiPropertyOptional({
    description: 'Whether Cash on Delivery is offered for this destination.',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'codAvailable must be true or false' })
  codAvailable?: boolean;

  @ApiPropertyOptional({
    description:
      'Cash-handling fee as a percentage of the amount collected at the door (goods + delivery).',
    example: 3,
    minimum: 0,
    maximum: 100,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'COD fee percent must be a valid number' })
  @Min(0, { message: 'COD fee percent cannot be negative' })
  @Max(100, { message: 'COD fee percent cannot exceed 100' })
  codFeePercent?: number;

  @ApiPropertyOptional({
    description: 'Floor on the COD fee, in THB.',
    example: 15,
    minimum: 0,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'COD fee minimum must be a valid number' })
  @Min(0, { message: 'COD fee minimum cannot be negative' })
  codFeeMin?: number;

  @ApiPropertyOptional({
    description: 'Ceiling on the COD fee, in THB.',
    example: 300,
    minimum: 0,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'COD fee maximum must be a valid number' })
  @Min(0, { message: 'COD fee maximum cannot be negative' })
  @IsGteField('codFeeMin', {
    message:
      'COD fee maximum must be greater than or equal to the COD fee minimum',
  })
  codFeeMax?: number;

  @ApiPropertyOptional({
    enum: DeliveryRateBasis,
    description:
      "Which cart metric this zone's tiers measure. WEIGHT is the Thai courier default.",
    default: DeliveryRateBasis.FLAT,
    example: DeliveryRateBasis.WEIGHT,
  })
  @IsOptional()
  @IsEnum(DeliveryRateBasis, { message: 'Rate basis is not recognised' })
  rateBasis?: DeliveryRateBasis;

  @ApiPropertyOptional({
    enum: DeliveryChargeStatus,
    default: DeliveryChargeStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(DeliveryChargeStatus, { message: 'Status is not recognised' })
  status?: DeliveryChargeStatus;

  @ApiProperty({
    description:
      'Coverage rules. A zone with none matches no address and can only ever be reached as the catch-all.',
    type: [DeliveryAreaInputDto],
  })
  @IsArray({ message: 'Areas must be an array' })
  @ArrayMaxSize(500, {
    message: 'A zone cannot carry more than 500 area rules',
  })
  @ValidateNested({ each: true })
  @Type(() => DeliveryAreaInputDto)
  areas!: DeliveryAreaInputDto[];

  @ApiProperty({
    description:
      'The rate card. At least one band is required, and exactly one of them must be open-ended (no maxValue).',
    type: [DeliveryRateInputDto],
  })
  @IsArray({ message: 'Rates must be an array' })
  @ArrayMinSize(1, { message: 'At least one rate band is required' })
  @ArrayMaxSize(50, { message: 'A zone cannot carry more than 50 rate bands' })
  @ValidateNested({ each: true })
  @Type(() => DeliveryRateInputDto)
  rates!: DeliveryRateInputDto[];
}
