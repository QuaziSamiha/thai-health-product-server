import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  blankNumberToUndefined,
  emptyStringToUndefined,
  parseBooleanInput,
  trimString,
} from '../../../common/utils/json-transform.util';
import { IsGteField } from '../../../common/decorators/validation/is-gte-field.decorator';
import { DELIVERY_CURRENCY } from '../delivery-charge.constants';
import { DeliveryZoneResponseDto } from './delivery-zone-response.dto';

/**
 * One charge, everywhere in the country.
 *
 * This is the simplest rate card that exists and, for most shops, the only one
 * they will ever want: a single fee, one delivery-time promise, no zones to
 * design. It is deliberately its own endpoint rather than a documented way to
 * hand-assemble `create-zone`, because "set one price for the whole country"
 * should not require an admin to understand zones, coverage rules, rate bands,
 * or which of those must be left empty to make the catch-all work.
 *
 * Underneath it is still a `DeliveryChargeZone` — the reserved `NATIONWIDE`
 * code, `isDefault` (so it catches every address no other zone claims), a FLAT
 * basis, no area rules, and exactly one open-ended band. Nothing about the
 * calculator is special-cased for it, which is what lets a shop start here and
 * later add a REMOTE zone without migrating anything.
 */
export class SetNationwideFlatRateDto {
  @ApiProperty({
    description:
      'The delivery charge applied everywhere, in THB. 0 means delivery is free for every order — which is different from a free-delivery rule, since it is unconditional.',
    example: 50,
    minimum: 0,
  })
  @Transform(blankNumberToUndefined)
  @Type(() => Number)
  @IsNumber({}, { message: 'Delivery charge must be a valid number' })
  @Min(0, { message: 'Delivery charge cannot be negative' })
  charge!: number;

  @ApiProperty({
    description: 'Fastest-case delivery time, in days.',
    example: 2,
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
    example: 4,
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
    description: 'Display name. Defaults to "Nationwide".',
    example: 'Nationwide',
    maxLength: 150,
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Name must be a valid text string' })
  @MaxLength(150, { message: 'Name cannot exceed 150 characters' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Thai display name.',
    example: 'ทั่วประเทศ',
    maxLength: 150,
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Thai name must be a valid text string' })
  @MaxLength(150, { message: 'Thai name cannot exceed 150 characters' })
  nameTh?: string;

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
    description: 'Whether Cash on Delivery is offered.',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'codAvailable must be true or false' })
  codAvailable?: boolean;

  @ApiPropertyOptional({
    description:
      'Cash-handling fee as a percentage of the amount collected at the door (goods + delivery). Leave blank to charge nothing for COD.',
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
    description:
      'Refuse baskets heavier than this, in kg. Leave blank for no ceiling.',
    example: 30,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Maximum weight must be a valid number' })
  @Min(0.001, { message: 'Maximum weight must be greater than zero' })
  maxWeightKg?: number;

  @ApiPropertyOptional({
    description:
      'Make this the ONLY rate in effect by deactivating every other zone. Without it, an existing zone still overrides this rate for the addresses it covers — this flag is what makes "nationwide" literally true. Zones are set INACTIVE, never deleted, so the change is reversible.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'exclusive must be true or false' })
  exclusive?: boolean;
}

/**
 * The nationwide rate as the admin screen sees it.
 *
 * `overridingZones` is the honest half. A nationwide rate only reaches an
 * address no *other* zone claims, so a shop that seeded a four-zone Thailand
 * card and then set a flat ฿50 would have that ฿50 apply almost nowhere. The
 * screen has to be able to say so, by name, rather than let the admin believe
 * a price is in effect that mostly is not.
 */
export class NationwideFlatRateDto {
  @ApiProperty({
    description: 'Whether a nationwide flat rate is currently configured.',
    example: true,
  })
  configured!: boolean;

  @ApiProperty({ example: DELIVERY_CURRENCY })
  currency!: string;

  @ApiPropertyOptional({
    description: 'The charge applied everywhere, in THB.',
    example: 50,
  })
  charge?: number;

  @ApiPropertyOptional({ example: 2 })
  minDeliveryDays?: number;

  @ApiPropertyOptional({ example: 4 })
  maxDeliveryDays?: number;

  @ApiPropertyOptional({
    description: 'Pre-formatted delivery promise, e.g. "2-4 days".',
    example: '2-4 days',
  })
  deliveryTime?: string;

  @ApiPropertyOptional({
    description: 'The underlying zone, for the full editor.',
    type: DeliveryZoneResponseDto,
  })
  zone?: DeliveryZoneResponseDto;

  @ApiProperty({
    description:
      'Active zones with their own coverage rules, which take precedence over this rate wherever they match. Empty means the nationwide rate really does apply everywhere.',
    type: [String],
    example: ['Bangkok Metropolitan', 'Remote & Islands'],
  })
  overridingZones!: string[];

  constructor(zone: DeliveryZoneResponseDto | null, overridingZones: string[]) {
    this.currency = DELIVERY_CURRENCY;
    this.overridingZones = overridingZones;
    this.configured = zone !== null;
    if (!zone) return;

    this.zone = zone;
    this.minDeliveryDays = zone.minDeliveryDays;
    this.maxDeliveryDays = zone.maxDeliveryDays;
    this.deliveryTime = zone.deliveryTime;
    //* THE FLAT CHARGE IS THE ONE BAND'S FEE PLUS THE FIXED ADD-ONS, SO THE
    //* NUMBER SHOWN HERE IS WHAT A CUSTOMER ACTUALLY PAYS — NOT A COMPONENT OF
    //* IT. A ZONE SET UP THROUGH THIS ENDPOINT HAS NO SURCHARGES, BUT ONE
    //* HAND-EDITED IN THE FULL ZONE EDITOR MIGHT.
    const band = zone.rates.find((rate) => rate.status === 'ACTIVE');
    this.charge =
      (band?.baseFee ?? 0) + zone.handlingFee + zone.remoteSurcharge;
  }
}
