import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryRateBasis } from '../../../generated/prisma/enums';
import { DELIVERY_CURRENCY } from '../delivery-charge.constants';

/**
 * The internal result of a delivery-charge calculation.
 *
 * Separate from the response DTO on purpose: `placeOrder` consumes this shape
 * to write its snapshot columns and never serialises it, while the quote
 * endpoint turns it into the DTO below. Keeping them apart means adding an
 * internal number (a rule id to bump, a tier id to log) does not silently
 * widen the public API.
 */
export interface DeliveryChargeQuote {
  zone: {
    id: number;
    code: string;
    name: string;
    nameTh: string | null;
    rateBasis: DeliveryRateBasis;
    minDeliveryDays: number;
    maxDeliveryDays: number;
  };
  chargeableWeightKg: number;
  itemCount: number;
  /** Goods total the waiver rules are measured against — see the service. */
  eligibleAmount: number;
  /** What the matched rate tier charged, before add-ons. */
  rateFee: number;
  handlingFee: number;
  remoteSurcharge: number;
  codFee: number;
  /** rateFee + handlingFee + remoteSurcharge + codFee, before any waiver. */
  baseCharge: number;
  /** How much of `baseCharge` the merchant absorbed. */
  waivedAmount: number;
  /** baseCharge - waivedAmount. This is what the customer pays. */
  deliveryCharge: number;
  freeDelivery: {
    applied: boolean;
    ruleId: number | null;
    ruleName: string | null;
    /** True when the rule capped its subsidy and the customer still pays a remainder. */
    partial: boolean;
  };
  /**
   * The nearest unmet minimum-basket rule, when one exists. Powers the
   * "spend ฿240 more for free delivery" nudge, which is the single highest-
   * converting element on a Thai checkout page and is impossible for the
   * client to compute — it would need every rule and every zone scope.
   */
  freeDeliveryProgress: {
    threshold: number;
    remaining: number;
    ruleName: string;
  } | null;
  estimatedDeliveryFrom: Date;
  estimatedDeliveryTo: Date;
}

class DeliveryQuoteZoneDto {
  @ApiProperty({ example: 'BKK_METRO' })
  code!: string;

  @ApiProperty({ example: 'Bangkok Metropolitan' })
  name!: string;

  @ApiPropertyOptional({ example: 'กรุงเทพและปริมณฑล' })
  nameTh?: string;

  @ApiProperty({ enum: DeliveryRateBasis, example: DeliveryRateBasis.WEIGHT })
  rateBasis!: DeliveryRateBasis;

  @ApiProperty({ example: 1 })
  minDeliveryDays!: number;

  @ApiProperty({ example: 2 })
  maxDeliveryDays!: number;
}

class FreeDeliveryStateDto {
  @ApiProperty({ example: true })
  applied!: boolean;

  @ApiPropertyOptional({
    description: 'Customer-facing reason, ready to render on the summary row.',
    example: 'Free delivery over ฿1,000',
  })
  ruleName?: string;

  @ApiProperty({
    description:
      'True when the rule capped its subsidy and the customer still owes the remainder.',
    example: false,
  })
  partial!: boolean;
}

class FreeDeliveryProgressDto {
  @ApiProperty({ example: 1000 })
  threshold!: number;

  @ApiProperty({ example: 240.5 })
  remaining!: number;

  @ApiProperty({ example: 'Free delivery over ฿1,000' })
  ruleName!: string;
}

/**
 * The quote as the storefront sees it.
 *
 * Every component of the fee is broken out rather than collapsed into one
 * number, because a delivery charge the customer cannot decompose is a support
 * ticket. The order summary can render "Delivery ฿80 · Free delivery −฿80"
 * from this alone.
 */
export class DeliveryQuoteResponseDto {
  @ApiProperty({ example: DELIVERY_CURRENCY })
  currency!: string;

  @ApiProperty({ type: DeliveryQuoteZoneDto })
  zone!: DeliveryQuoteZoneDto;

  @ApiProperty({
    description: 'Total catalog weight of the basket, in kilograms.',
    example: 1.75,
  })
  chargeableWeightKg!: number;

  @ApiProperty({ description: 'Total units in the basket.', example: 3 })
  itemCount!: number;

  @ApiProperty({
    description: 'What the matched rate tier charged, before add-ons.',
    example: 60,
  })
  rateFee!: number;

  @ApiProperty({ example: 0 })
  handlingFee!: number;

  @ApiProperty({
    description: 'Remote-area surcharge for this destination.',
    example: 0,
  })
  remoteSurcharge!: number;

  @ApiProperty({
    description:
      'Cash-on-delivery handling fee. 0 for any other payment method.',
    example: 20,
  })
  codFee!: number;

  @ApiProperty({
    description: 'The full fee before any free-delivery waiver.',
    example: 80,
  })
  baseCharge!: number;

  @ApiProperty({
    description: 'How much of baseCharge the merchant absorbed.',
    example: 60,
  })
  waivedAmount!: number;

  @ApiProperty({
    description:
      'What the customer is charged — baseCharge minus waivedAmount. Re-derived authoritatively at placement; this is a preview.',
    example: 20,
  })
  deliveryCharge!: number;

  @ApiProperty({ type: FreeDeliveryStateDto })
  freeDelivery!: FreeDeliveryStateDto;

  @ApiPropertyOptional({
    description:
      'The nearest unmet minimum-basket rule, for the "spend a little more" nudge. Absent when free delivery already applies or no threshold rule covers this destination.',
    type: FreeDeliveryProgressDto,
  })
  freeDeliveryProgress?: FreeDeliveryProgressDto;

  @ApiProperty({
    description: 'Earliest promised delivery date (ISO 8601).',
    example: '2026-08-25T00:00:00.000Z',
  })
  estimatedDeliveryFrom!: Date;

  @ApiProperty({
    description: 'Latest promised delivery date (ISO 8601).',
    example: '2026-08-26T00:00:00.000Z',
  })
  estimatedDeliveryTo!: Date;

  @ApiProperty({
    description:
      'Pre-formatted delivery promise, so every surface renders it identically.',
    example: '1-2 days',
  })
  estimatedDeliveryText!: string;

  constructor(quote: DeliveryChargeQuote) {
    this.currency = DELIVERY_CURRENCY;
    this.zone = {
      code: quote.zone.code,
      name: quote.zone.name,
      nameTh: quote.zone.nameTh ?? undefined,
      rateBasis: quote.zone.rateBasis,
      minDeliveryDays: quote.zone.minDeliveryDays,
      maxDeliveryDays: quote.zone.maxDeliveryDays,
    };
    this.chargeableWeightKg = quote.chargeableWeightKg;
    this.itemCount = quote.itemCount;
    this.rateFee = quote.rateFee;
    this.handlingFee = quote.handlingFee;
    this.remoteSurcharge = quote.remoteSurcharge;
    this.codFee = quote.codFee;
    this.baseCharge = quote.baseCharge;
    this.waivedAmount = quote.waivedAmount;
    this.deliveryCharge = quote.deliveryCharge;
    this.freeDelivery = {
      applied: quote.freeDelivery.applied,
      ruleName: quote.freeDelivery.ruleName ?? undefined,
      partial: quote.freeDelivery.partial,
    };
    this.freeDeliveryProgress = quote.freeDeliveryProgress ?? undefined;
    this.estimatedDeliveryFrom = quote.estimatedDeliveryFrom;
    this.estimatedDeliveryTo = quote.estimatedDeliveryTo;
    //* SAME "n days" / "n-m days" RENDERING AS DeliveryServiceRowDto.deliveryTime
    //* (delivery module) — NEVER STORED, ONLY BUILT AT READ TIME.
    this.estimatedDeliveryText =
      quote.zone.minDeliveryDays === quote.zone.maxDeliveryDays
        ? `${quote.zone.minDeliveryDays} days`
        : `${quote.zone.minDeliveryDays}-${quote.zone.maxDeliveryDays} days`;
  }
}

/**
 * The storefront banner's data: "Free delivery on orders over ฿1,000".
 *
 * Deliberately answers only the site-wide question. A zone-scoped rule is not
 * a promise the merchant can make before knowing where the parcel is going,
 * and advertising one on the homepage would be a promise broken at checkout.
 */
export class FreeDeliveryThresholdDto {
  @ApiProperty({
    description: 'Whether any site-wide minimum-basket rule is live right now.',
    example: true,
  })
  available!: boolean;

  @ApiPropertyOptional({
    description: 'The lowest live site-wide threshold, in THB.',
    example: 1000,
  })
  threshold?: number;

  @ApiPropertyOptional({
    description: "The rule's customer-facing name.",
    example: 'Free delivery over ฿1,000',
  })
  ruleName?: string;

  @ApiProperty({ example: DELIVERY_CURRENCY })
  currency!: string;

  constructor(rule: { name: string; minOrderAmount: unknown } | null) {
    this.currency = DELIVERY_CURRENCY;
    this.available = rule !== null;
    if (rule) {
      this.threshold = Number(rule.minOrderAmount);
      this.ruleName = rule.name;
    }
  }
}
