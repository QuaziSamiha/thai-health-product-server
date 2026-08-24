import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DeliveryChargeStatus,
  DeliveryRateBasis,
  FreeDeliveryTrigger,
} from '../../../generated/prisma/enums';

//* Decimal COLUMNS ARRIVE AS Prisma.Decimal (OR AS A STRING OVER SOME
//* DRIVERS). EVERY DTO IN THIS FILE COERCES WITH Number() AT THE BOUNDARY,
//* THE SAME CONVENTION OrderResponseDto USES — NOTHING DOWNSTREAM SHOULD HAVE
//* TO KNOW A FIELD WAS EVER A Decimal.
function num(value: unknown): number {
  return Number(value);
}

function optionalNum(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

export class DeliveryAreaResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Thailand' })
  country!: string;

  @ApiPropertyOptional({
    description: 'Province. Absent means "any province in the country".',
    example: 'Bangkok',
  })
  province?: string;

  @ApiPropertyOptional({
    description: 'District. Absent means "any district in the province".',
    example: 'Watthana',
  })
  district?: string;

  @ApiPropertyOptional({
    description: 'Subdistrict. Absent means "any subdistrict in the district".',
    example: 'Ang Thong',
  })
  subdistrict?: string;

  @ApiPropertyOptional({ example: '10110' })
  postalCode?: string;

  @ApiPropertyOptional({ example: '10' })
  postalPrefix?: string;
}

export class DeliveryRateResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  sid!: string;

  @ApiPropertyOptional({ example: '1-3 kg' })
  label?: string;

  @ApiProperty({ example: 1 })
  minValue!: number;

  @ApiPropertyOptional({
    description: 'Absent on the open-ended top band.',
    example: 3,
  })
  maxValue?: number;

  @ApiProperty({ example: 60 })
  baseFee!: number;

  @ApiPropertyOptional({ example: 1 })
  stepUnit?: number;

  @ApiProperty({ example: 0 })
  stepFee!: number;

  @ApiProperty({ enum: DeliveryChargeStatus })
  status!: DeliveryChargeStatus;
}

/** One zone with its complete rule set — what the admin Set Up screen edits. */
export class DeliveryZoneResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  sid!: string;

  @ApiProperty({ example: 'BKK_METRO' })
  code!: string;

  @ApiProperty({ example: 'Bangkok Metropolitan' })
  name!: string;

  @ApiPropertyOptional({ example: 'กรุงเทพและปริมณฑล' })
  nameTh?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({
    description: 'Catch-all for addresses no area rule matches.',
    example: false,
  })
  isDefault!: boolean;

  @ApiProperty({ example: 100 })
  priority!: number;

  @ApiProperty({ example: 1 })
  minDeliveryDays!: number;

  @ApiProperty({ example: 2 })
  maxDeliveryDays!: number;

  @ApiProperty({
    description: 'Pre-formatted delivery promise for the admin table.',
    example: '1-2 days',
  })
  deliveryTime!: string;

  @ApiPropertyOptional({
    description: 'Same-day dispatch cut-off, minutes past midnight ICT.',
    example: 960,
  })
  cutOffMinutes?: number;

  @ApiProperty({ example: false })
  businessDaysOnly!: boolean;

  @ApiProperty({ example: 0 })
  handlingFee!: number;

  @ApiProperty({ example: 0 })
  remoteSurcharge!: number;

  @ApiPropertyOptional({ example: 20 })
  maxWeightKg?: number;

  @ApiProperty({ example: true })
  codAvailable!: boolean;

  @ApiPropertyOptional({ example: 3 })
  codFeePercent?: number;

  @ApiPropertyOptional({ example: 15 })
  codFeeMin?: number;

  @ApiPropertyOptional({ example: 300 })
  codFeeMax?: number;

  @ApiProperty({ enum: DeliveryRateBasis, example: DeliveryRateBasis.WEIGHT })
  rateBasis!: DeliveryRateBasis;

  @ApiProperty({ enum: DeliveryChargeStatus })
  status!: DeliveryChargeStatus;

  @ApiProperty({ type: [DeliveryAreaResponseDto] })
  areas!: DeliveryAreaResponseDto[];

  @ApiProperty({ type: [DeliveryRateResponseDto] })
  rates!: DeliveryRateResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  constructor(zone: {
    id: number;
    sid: string;
    code: string;
    name: string;
    nameTh: string | null;
    description: string | null;
    isDefault: boolean;
    priority: number;
    minDeliveryDays: number;
    maxDeliveryDays: number;
    cutOffMinutes: number | null;
    businessDaysOnly: boolean;
    handlingFee: unknown;
    remoteSurcharge: unknown;
    maxWeightKg: unknown;
    codAvailable: boolean;
    codFeePercent: unknown;
    codFeeMin: unknown;
    codFeeMax: unknown;
    rateBasis: DeliveryRateBasis;
    status: DeliveryChargeStatus;
    createdAt: Date;
    updatedAt: Date;
    areas: {
      id: number;
      country: string;
      province: string | null;
      district: string | null;
      subdistrict: string | null;
      postalCode: string | null;
      postalPrefix: string | null;
    }[];
    rates: {
      id: number;
      sid: string;
      label: string | null;
      minValue: unknown;
      maxValue: unknown;
      baseFee: unknown;
      stepUnit: unknown;
      stepFee: unknown;
      status: DeliveryChargeStatus;
    }[];
  }) {
    this.id = zone.id;
    this.sid = zone.sid;
    this.code = zone.code;
    this.name = zone.name;
    this.nameTh = zone.nameTh ?? undefined;
    this.description = zone.description ?? undefined;
    this.isDefault = zone.isDefault;
    this.priority = zone.priority;
    this.minDeliveryDays = zone.minDeliveryDays;
    this.maxDeliveryDays = zone.maxDeliveryDays;
    //* SAME RENDERING AS DeliveryServiceRowDto.deliveryTime — BUILT HERE,
    //* NEVER STORED, SO THE TWO NUMBERS STAY THE SOURCE OF TRUTH.
    this.deliveryTime =
      zone.minDeliveryDays === zone.maxDeliveryDays
        ? `${zone.minDeliveryDays} days`
        : `${zone.minDeliveryDays}-${zone.maxDeliveryDays} days`;
    this.cutOffMinutes = zone.cutOffMinutes ?? undefined;
    this.businessDaysOnly = zone.businessDaysOnly;
    this.handlingFee = num(zone.handlingFee);
    this.remoteSurcharge = num(zone.remoteSurcharge);
    this.maxWeightKg = optionalNum(zone.maxWeightKg);
    this.codAvailable = zone.codAvailable;
    this.codFeePercent = optionalNum(zone.codFeePercent);
    this.codFeeMin = optionalNum(zone.codFeeMin);
    this.codFeeMax = optionalNum(zone.codFeeMax);
    this.rateBasis = zone.rateBasis;
    this.status = zone.status;
    this.createdAt = zone.createdAt;
    this.updatedAt = zone.updatedAt;
    this.areas = zone.areas.map((area) => ({
      id: area.id,
      country: area.country,
      province: area.province ?? undefined,
      district: area.district ?? undefined,
      subdistrict: area.subdistrict ?? undefined,
      postalCode: area.postalCode ?? undefined,
      postalPrefix: area.postalPrefix ?? undefined,
    }));
    this.rates = zone.rates.map((rate) => ({
      id: rate.id,
      sid: rate.sid,
      label: rate.label ?? undefined,
      minValue: num(rate.minValue),
      maxValue: optionalNum(rate.maxValue),
      baseFee: num(rate.baseFee),
      stepUnit: optionalNum(rate.stepUnit),
      stepFee: num(rate.stepFee),
      status: rate.status,
    }));
  }
}

export class FreeDeliveryRuleResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  sid!: string;

  @ApiProperty({ example: 'Free delivery over ฿1,000' })
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: FreeDeliveryTrigger })
  trigger!: FreeDeliveryTrigger;

  @ApiPropertyOptional({ example: 1000 })
  minOrderAmount?: number;

  //* THE *CODE* IS FOR READING, THE *ID* IS FOR EDITING. THE ADMIN LIST RENDERS
  //* THE HUMAN-READABLE HALF; THE EDIT FORM'S PICKERS ARE KEYED ON THE ROW ID
  //* AND CANNOT PRE-SELECT ANYTHING FROM A NAME. BOTH ARE RETURNED SO THE FORM
  //* DOES NOT HAVE TO RESOLVE ONE FROM THE OTHER AGAINST A PAGED LIST.
  @ApiPropertyOptional({ example: 'FREESHIP' })
  promoCode?: string;

  @ApiPropertyOptional({
    description: 'Id of the linked coupon, for the edit form.',
    example: 1,
  })
  promoCodeId?: number;

  @ApiPropertyOptional({
    description: 'Zone this rule is limited to. Absent means every zone.',
    example: 'BKK_METRO',
  })
  zoneCode?: string;

  @ApiPropertyOptional({ example: 'Bangkok Metropolitan' })
  zoneName?: string;

  @ApiPropertyOptional({
    description: 'Id of the scoping zone, for the edit form.',
    example: 1,
  })
  zoneId?: number;

  @ApiPropertyOptional({ example: 60 })
  maxSubsidyAmount?: number;

  @ApiProperty({ example: false })
  waivesCodFee!: boolean;

  @ApiPropertyOptional()
  startsAt?: Date;

  @ApiPropertyOptional()
  endsAt?: Date;

  @ApiPropertyOptional({ example: 500 })
  usageLimit?: number;

  @ApiProperty({ example: 42 })
  usedCount!: number;

  @ApiPropertyOptional({
    description: 'usageLimit - usedCount. Absent when the limit is unlimited.',
    example: 458,
  })
  remainingUses?: number;

  @ApiProperty({ example: 100 })
  priority!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  constructor(rule: {
    id: number;
    sid: string;
    name: string;
    description: string | null;
    trigger: FreeDeliveryTrigger;
    minOrderAmount: unknown;
    promoCodeId: number | null;
    promoCode: { id: number; code: string } | null;
    zoneId: number | null;
    zone: { id: number; code: string; name: string } | null;
    maxSubsidyAmount: unknown;
    waivesCodFee: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    usageLimit: number | null;
    usedCount: number;
    priority: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = rule.id;
    this.sid = rule.sid;
    this.name = rule.name;
    this.description = rule.description ?? undefined;
    this.trigger = rule.trigger;
    this.minOrderAmount = optionalNum(rule.minOrderAmount);
    this.promoCode = rule.promoCode?.code;
    this.promoCodeId = rule.promoCodeId ?? undefined;
    this.zoneCode = rule.zone?.code;
    this.zoneName = rule.zone?.name;
    this.zoneId = rule.zoneId ?? undefined;
    this.maxSubsidyAmount = optionalNum(rule.maxSubsidyAmount);
    this.waivesCodFee = rule.waivesCodFee;
    this.startsAt = rule.startsAt ?? undefined;
    this.endsAt = rule.endsAt ?? undefined;
    this.usageLimit = rule.usageLimit ?? undefined;
    this.usedCount = rule.usedCount;
    //* SAME DERIVED FIELD AS PromoCodeResponseDto.remainingUses — CLAMPED AT 0
    //* SO A RULE THAT SOMEHOW OVERSHOT ITS CAP READS "NONE LEFT", NOT A
    //* NEGATIVE NUMBER ON AN ADMIN SCREEN.
    this.remainingUses =
      rule.usageLimit === null
        ? undefined
        : Math.max(0, rule.usageLimit - rule.usedCount);
    this.priority = rule.priority;
    this.isActive = rule.isActive;
    this.createdAt = rule.createdAt;
    this.updatedAt = rule.updatedAt;
  }
}
