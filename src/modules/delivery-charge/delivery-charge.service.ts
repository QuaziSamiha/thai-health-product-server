import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  DeliveryChargeStatus,
  DeliveryRateBasis,
  FreeDeliveryTrigger,
  PaymentMethod,
} from '../../generated/prisma/enums';
import { IPaginatedResult } from '../../shared/pagination';
import { DeliveryChargeRepository } from './delivery-charge.repository';
import {
  AreaRule,
  DeliveryDestination,
  RateTier,
  calculateCodFee,
  calculateEstimatedDelivery,
  findRateTier,
  metricForBasis,
  priceTier,
  round2,
  round3,
  scoreArea,
} from './delivery-charge.calculator';
import {
  DEFAULT_ITEM_WEIGHT_KG,
  NATIONWIDE_ZONE_CODE,
} from './delivery-charge.constants';
import { DeliveryChargeQuote } from './dto/delivery-quote-response.dto';
import {
  CreateDeliveryZoneDto,
  DeliveryAreaInputDto,
  DeliveryRateInputDto,
} from './dto/create-delivery-zone.dto';
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
import {
  NationwideFlatRateDto,
  SetNationwideFlatRateDto,
} from './dto/nationwide-flat-rate.dto';
import { PaginationQueryDto } from '../../shared/pagination';

/** One basket line, as both the quote endpoint and order placement express it. */
export interface DeliveryChargeItem {
  productId?: number | null;
  variantId?: number | null;
  comboId?: number | null;
  quantity: number;
}

/**
 * Everything the fee depends on. Assembled by the caller — the quote endpoint
 * from a DTO, `placeOrder` from the order it is mid-way through building — so
 * both paths reach `calculateQuote` through exactly one door and cannot drift.
 */
export interface DeliveryChargeContext {
  destination: DeliveryDestination;
  items: DeliveryChargeItem[];
  /**
   * The goods total the waiver rules are measured against: line prices after
   * item-level discounts, minus any coupon discount.
   *
   * Post-coupon is the deliberate choice. Measuring the threshold on the
   * pre-coupon subtotal lets a customer stack a percentage coupon onto a
   * basket that only reached the threshold *because* of the pre-discount
   * price, and collect free delivery on a basket that never actually met it.
   * It is also what the customer sees on the summary row, which is the number
   * they will argue from.
   */
  eligibleAmount: number;
  paymentMethod: PaymentMethod;
  /** Id of the coupon actually applied, for PROMO_CODE rules. */
  appliedPromoCodeId?: number | null;
  userId?: number | null;
  /** Overridden in tests; production always passes "now". */
  now?: Date;
}

//* THE ZONE SHAPE THE CALCULATION NEEDS, ONCE Decimal COLUMNS HAVE BEEN
//* COERCED. KEEPING THE COERCION AT THE EDGE MEANS NOTHING BELOW HAS TO
//* REMEMBER WHICH FIELDS WERE Decimal.
interface PricingZone {
  id: number;
  code: string;
  name: string;
  nameTh: string | null;
  isDefault: boolean;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  cutOffMinutes: number | null;
  businessDaysOnly: boolean;
  handlingFee: number;
  remoteSurcharge: number;
  maxWeightKg: number | null;
  codAvailable: boolean;
  codFeePercent: number | null;
  codFeeMin: number | null;
  codFeeMax: number | null;
  rateBasis: DeliveryRateBasis;
  rates: RateTier[];
}

function toNum(value: unknown): number {
  return Number(value);
}

function toOptionalNum(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

@Injectable()
export class DeliveryChargeService {
  private readonly logger = new Logger(DeliveryChargeService.name);

  constructor(private readonly repository: DeliveryChargeRepository) {}

  // ══════════════════════════════════════════════════════════════════════════
  // QUOTING — the storefront preview and the order path share every line of it
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Prices one basket to one destination.
   *
   * This is the only place a delivery fee is ever produced. The checkout
   * preview and `OrderService.placeOrder` both call it, which is what makes
   * "the price you were quoted is the price you were charged" a property of
   * the code rather than a thing two implementations have to agree on.
   *
   * The client never sends a fee and there is no signed quote to replay: a
   * preview is advisory, placement recomputes from the same rows inside its own
   * transaction and charges that. Tampering with a quote therefore changes what
   * the customer is *shown* and nothing they are billed — which is precisely
   * why the preview endpoint can be public.
   *
   * `tx` threads the caller's transaction through when placement calls it, so
   * the rate card the order is priced against is the one visible inside that
   * transaction and cannot be edited out from under it mid-placement.
   */
  async calculateQuote(
    context: DeliveryChargeContext,
    tx?: Prisma.TransactionClient,
  ): Promise<DeliveryChargeQuote> {
    const now = context.now ?? new Date();
    const zone = await this.resolveZone(context.destination, tx);

    const { weightKg, itemCount } = await this.measureBasket(context.items, tx);

    if (zone.maxWeightKg !== null && weightKg > zone.maxWeightKg) {
      throw new BadRequestException(
        `This order weighs ${weightKg} kg, which is over the ${zone.maxWeightKg} kg limit for delivery to ${zone.name}. Please split it into smaller orders or contact us to arrange freight.`,
      );
    }

    const isCod = context.paymentMethod === PaymentMethod.CASH_ON_DELIVERY;
    if (isCod && !zone.codAvailable) {
      throw new BadRequestException(
        `Cash on Delivery is not available for ${zone.name}. Please choose another payment method.`,
      );
    }

    // ─── The rate tier ──────────────────────────────────────────────────────
    const metric = metricForBasis(zone.rateBasis, {
      weightKg,
      itemCount,
      orderValue: context.eligibleAmount,
    });
    const tier = findRateTier(zone.rates, metric);
    if (!tier) {
      //* A HOLE IN THE RATE CARD IS A CONFIGURATION BUG, NOT A CUSTOMER
      //* MISTAKE, SO IT IS LOGGED AT ERROR WITH EVERYTHING NEEDED TO FIND IT.
      //* THE CUSTOMER STILL GETS A REFUSAL RATHER THAN A GUESSED PRICE OR A
      //* FREE DELIVERY — SILENTLY CHARGING 0 IS THE ONE OUTCOME THAT COSTS
      //* REAL MONEY AND NOBODY NOTICES.
      this.logger.error(
        `No delivery rate band covers ${metric} (${zone.rateBasis}) in zone ${zone.code} — the rate card has a gap`,
      );
      throw new BadRequestException(
        'We could not calculate a delivery charge for this order. Please contact support.',
      );
    }

    const rateFee = priceTier(tier, metric);
    const deliveryOnly = round2(
      rateFee + zone.handlingFee + zone.remoteSurcharge,
    );

    //* THE COURIER COLLECTS GOODS + DELIVERY AT THE DOOR, SO THE CASH-HANDLING
    //* PERCENTAGE IS TAKEN ON THAT WHOLE AMOUNT — NOT ON THE GOODS ALONE.
    const codFee = isCod
      ? calculateCodFee(context.eligibleAmount + deliveryOnly, zone)
      : 0;

    const baseCharge = round2(deliveryOnly + codFee);

    // ─── The waiver ─────────────────────────────────────────────────────────
    const waiver = await this.resolveWaiver(
      zone,
      context,
      deliveryOnly,
      codFee,
      tx,
    );

    const deliveryCharge = round2(baseCharge - waiver.waivedAmount);
    const estimated = calculateEstimatedDelivery(now, zone);

    return {
      zone: {
        id: zone.id,
        code: zone.code,
        name: zone.name,
        nameTh: zone.nameTh,
        rateBasis: zone.rateBasis,
        minDeliveryDays: zone.minDeliveryDays,
        maxDeliveryDays: zone.maxDeliveryDays,
      },
      chargeableWeightKg: weightKg,
      itemCount,
      eligibleAmount: round2(context.eligibleAmount),
      rateFee,
      handlingFee: zone.handlingFee,
      remoteSurcharge: zone.remoteSurcharge,
      codFee,
      baseCharge,
      waivedAmount: waiver.waivedAmount,
      deliveryCharge,
      freeDelivery: {
        applied: waiver.waivedAmount > 0,
        ruleId: waiver.ruleId,
        ruleName: waiver.ruleName,
        partial: waiver.waivedAmount > 0 && deliveryCharge > 0,
      },
      freeDeliveryProgress: waiver.progress,
      estimatedDeliveryFrom: estimated.from,
      estimatedDeliveryTo: estimated.to,
    };
  }

  /**
   * Records that an order actually consumed a capped free-delivery rule.
   *
   * Separate from `calculateQuote` because quoting must stay read-only — the
   * checkout page re-quotes on every keystroke in the address form, and a
   * quote that burned a use would exhaust a 500-order campaign in an afternoon
   * without a single order being placed.
   *
   * Returns false when the claim was lost to a concurrent order, which the
   * caller must treat as "this order does not get free delivery" and re-price.
   * An uncapped rule always returns true.
   */
  async claimFreeDelivery(
    ruleId: number,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const rule = await tx.deliveryFreeDeliveryRule.findUnique({
      where: { id: ruleId },
      select: { usageLimit: true },
    });
    if (!rule) return false;
    const claimed = await this.repository.claimRuleUsage(
      ruleId,
      rule.usageLimit,
      tx,
    );
    return claimed > 0;
  }

  /**
   * The public checkout preview: turns a request into a `DeliveryChargeContext`
   * and quotes it.
   *
   * Two lookups happen here and nowhere deeper, because both are about
   * *identity* rather than pricing:
   *
   *   * `addressId` is resolved through AddressService, which enforces
   *     ownership. Without that, the id is an enumeration handle — anyone
   *     could walk the range and read back other customers' provinces and
   *     postal codes one 200 at a time. Guests cannot use it at all: they have
   *     no address book, so an id they send can only be someone else's.
   *   * `promoCode` is resolved to an id, because free-delivery rules bind to
   *     a coupon row and not to a typed string. Resolution is deliberately
   *     silent on a miss — the promotion module owns telling a customer their
   *     coupon is bad, and a delivery quote that 400s on a typo would block
   *     the checkout page over something unrelated to delivery.
   *
   * Note what is *not* trusted: the basket's weight and item count are read
   * from the catalog (see measureBasket), and the goods subtotal used for
   * threshold rules is supplied by the caller from server-side prices — a
   * client cannot claim a ฿1,000 basket to unlock free delivery on ฿200 of
   * goods, because placement recomputes both from the catalog anyway.
   */
  async quoteForRequest(params: {
    destination: DeliveryDestination;
    items: DeliveryChargeItem[];
    eligibleAmount: number;
    paymentMethod: PaymentMethod;
    promoCode?: string;
    userId?: number;
  }): Promise<DeliveryChargeQuote> {
    const promoCodeId = params.promoCode
      ? await this.repository.findPromoCodeIdByCode(params.promoCode)
      : null;

    return await this.calculateQuote({
      destination: params.destination,
      items: params.items,
      eligibleAmount: params.eligibleAmount,
      paymentMethod: params.paymentMethod,
      appliedPromoCodeId: promoCodeId,
      userId: params.userId ?? null,
    });
  }

  // ─── Zone resolution ───────────────────────────────────────────────────────

  /**
   * Which zone prices this address.
   *
   * Candidates come back from the database already narrowed to the province
   * and postal code in play; each of their area rules is scored, the zone
   * keeps its best-scoring rule, and the highest score across zones wins with
   * `priority` (then id) settling genuine ties. Falls back to the catch-all,
   * and refuses the address outright if there is not even one of those.
   *
   * Refusing is the important half. A destination with no zone means the rate
   * card does not cover it, and the two alternatives — charging the cheapest
   * zone's price or charging nothing — both ship a real parcel at a price
   * nobody chose.
   */
  private async resolveZone(
    destination: DeliveryDestination,
    tx?: Prisma.TransactionClient,
  ): Promise<PricingZone> {
    const candidates = await this.repository.findCandidateZonesForDestination(
      destination,
      tx,
    );

    let best: { zone: (typeof candidates)[number]; score: number } | null =
      null;
    for (const zone of candidates) {
      let zoneScore: number | null = null;
      for (const area of zone.areas as AreaRule[]) {
        const score = scoreArea(area, destination);
        if (score !== null && (zoneScore === null || score > zoneScore)) {
          zoneScore = score;
        }
      }
      if (zoneScore === null) continue;
      //* STRICTLY GREATER, SO THE FIRST ZONE AT A GIVEN SCORE KEEPS IT — THE
      //* QUERY ALREADY ORDERED BY (priority, id), WHICH IS THE TIE-BREAK.
      if (best === null || zoneScore > best.score) {
        best = { zone, score: zoneScore };
      }
    }

    if (best) return this.toPricingZone(best.zone);

    //* THE CATCH-ALL ONLY CATCHES ADDRESSES IN A COUNTRY THIS CARD ACTUALLY
    //* COVERS. WITHOUT THE GATE A THAILAND CARD WOULD PRICE A MALAYSIAN
    //* ADDRESS OFF ITS UPCOUNTRY BANDS AND PROMISE A 2-4 DAY DOMESTIC LEAD
    //* TIME FOR A PARCEL THAT HAS TO CLEAR CUSTOMS — scoreArea ALREADY REFUSES
    //* THE FOREIGN ADDRESS, AND THIS CLOSES THE SIDE DOOR IT LEFT OPEN.
    if (await this.repository.isCountryServed(destination.country, tx)) {
      const fallback = await this.repository.findDefaultZone(tx);
      if (fallback) return this.toPricingZone(fallback);
    }

    throw new BadRequestException(
      `We do not currently deliver to ${destination.region}, ${destination.state} ${destination.postalCode}. Please try a different address or contact us.`,
    );
  }

  /** Coerces one zone row's Decimal columns once, at the edge. */
  private toPricingZone(zone: {
    id: number;
    code: string;
    name: string;
    nameTh: string | null;
    isDefault: boolean;
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
    rates: {
      minValue: unknown;
      maxValue: unknown;
      baseFee: unknown;
      stepUnit: unknown;
      stepFee: unknown;
    }[];
  }): PricingZone {
    return {
      id: zone.id,
      code: zone.code,
      name: zone.name,
      nameTh: zone.nameTh,
      isDefault: zone.isDefault,
      minDeliveryDays: zone.minDeliveryDays,
      maxDeliveryDays: zone.maxDeliveryDays,
      cutOffMinutes: zone.cutOffMinutes,
      businessDaysOnly: zone.businessDaysOnly,
      handlingFee: toNum(zone.handlingFee),
      remoteSurcharge: toNum(zone.remoteSurcharge),
      maxWeightKg: toOptionalNum(zone.maxWeightKg),
      codAvailable: zone.codAvailable,
      codFeePercent: toOptionalNum(zone.codFeePercent),
      codFeeMin: toOptionalNum(zone.codFeeMin),
      codFeeMax: toOptionalNum(zone.codFeeMax),
      rateBasis: zone.rateBasis,
      rates: zone.rates.map((rate) => ({
        minValue: toNum(rate.minValue),
        maxValue: toOptionalNum(rate.maxValue),
        baseFee: toNum(rate.baseFee),
        stepUnit: toOptionalNum(rate.stepUnit),
        stepFee: toNum(rate.stepFee),
      })),
    };
  }

  // ─── Basket measurement ────────────────────────────────────────────────────

  /**
   * Total weight and unit count of a basket, read from the catalog.
   *
   * Weight is never taken from the request. A client-supplied weight is a
   * client-supplied *price* on a weight-based zone, which would let anyone
   * check out a 20 kg order at the 0–1 kg rate.
   *
   * A combo weighs the sum of its components (it holds no weight of its own,
   * same as it holds no stock of its own), and anything the catalog has no
   * weight for falls back to DEFAULT_ITEM_WEIGHT_KG rather than to zero — see
   * that constant for why a missing weight must never be free to ship.
   */
  private async measureBasket(
    items: DeliveryChargeItem[],
    tx?: Prisma.TransactionClient,
  ): Promise<{ weightKg: number; itemCount: number }> {
    //* PARENT PRODUCTS OF VARIANT LINES ARE INCLUDED TOO — A VARIANT WITH NO
    //* WEIGHT OF ITS OWN FALLS BACK TO ITS PRODUCT'S, AND THAT ROW HAS TO HAVE
    //* BEEN LOADED FOR THE FALLBACK TO REACH ANYTHING.
    const productIds = [
      ...new Set(items.filter((i) => i.productId).map((i) => i.productId!)),
    ];
    const variantIds = [
      ...new Set(items.filter((i) => i.variantId).map((i) => i.variantId!)),
    ];
    const comboIds = [
      ...new Set(items.filter((i) => i.comboId).map((i) => i.comboId!)),
    ];

    const [{ products, variants }, comboComponents] = await Promise.all([
      this.repository.findProductWeights(productIds, variantIds, tx),
      this.repository.findComboComponents(comboIds, tx),
    ]);

    const productWeight = new Map<number, number | null>(
      products.map((p) => [p.id, toOptionalNum(p.weight)] as const),
    );
    //* THE VARIANT'S OWN WEIGHT WINS — A 30 ML AND A 100 ML BOTTLE OF THE SAME
    //* PRODUCT DO NOT WEIGH THE SAME — AND FALLS BACK TO THE PARENT'S, WHICH IS
    //* ONLY REACHABLE ONCE productWeight IS BUILT, HENCE THE SEPARATE PASS.
    const variantWeight = new Map<number, number | null>();
    for (const variant of variants) {
      variantWeight.set(
        variant.id,
        toOptionalNum(variant.weight) ??
          productWeight.get(variant.productId) ??
          null,
      );
    }

    //* ONE BUNDLE'S WEIGHT, SUMMED OVER ITS COMPONENT LINES.
    const comboWeight = new Map<number, number>();
    for (const component of comboComponents) {
      const unit =
        toOptionalNum(component.variant?.weight) ??
        toOptionalNum(component.product?.weight) ??
        DEFAULT_ITEM_WEIGHT_KG;
      comboWeight.set(
        component.comboId,
        (comboWeight.get(component.comboId) ?? 0) + unit * component.quantity,
      );
    }

    let weightKg = 0;
    let itemCount = 0;
    for (const item of items) {
      const unitWeight = item.comboId
        ? (comboWeight.get(item.comboId) ?? DEFAULT_ITEM_WEIGHT_KG)
        : item.variantId
          ? (variantWeight.get(item.variantId) ?? DEFAULT_ITEM_WEIGHT_KG)
          : (productWeight.get(item.productId!) ?? DEFAULT_ITEM_WEIGHT_KG);
      weightKg += unitWeight * item.quantity;
      itemCount += item.quantity;
    }

    return { weightKg: round3(weightKg), itemCount };
  }

  // ─── Free-delivery evaluation ──────────────────────────────────────────────

  /**
   * Finds the first rule that fires and works out how much it waives.
   *
   * Rules are evaluated in `priority` order and the first match wins — they do
   * not stack, because stacking waivers on one fee has no meaning (the second
   * has nothing left to waive) and would make "why was this free" unanswerable
   * on the order record.
   *
   * While walking the list it also tracks the cheapest *unmet* basket
   * threshold. That is what powers the "spend ฿240 more" nudge, and it is free
   * here — the rules are already loaded, already scoped to this zone, and
   * already filtered to the live ones. The client could not compute it at any
   * price: it would need every rule and every zone scope.
   */
  private async resolveWaiver(
    zone: PricingZone,
    context: DeliveryChargeContext,
    deliveryOnly: number,
    codFee: number,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    ruleId: number | null;
    ruleName: string | null;
    waivedAmount: number;
    progress: DeliveryChargeQuote['freeDeliveryProgress'];
  }> {
    const rules = await this.repository.findApplicableRules(zone.id, tx);

    let progress: DeliveryChargeQuote['freeDeliveryProgress'] = null;
    //* CACHED SO THE FIRST_ORDER LOOKUP COSTS AT MOST ONE COUNT PER QUOTE,
    //* HOWEVER MANY FIRST_ORDER RULES THE LIST HAPPENS TO CONTAIN.
    let isFirstOrder: boolean | null = null;

    for (const rule of rules) {
      let fires = false;

      switch (rule.trigger) {
        case FreeDeliveryTrigger.MIN_ORDER_AMOUNT: {
          const threshold = toNum(rule.minOrderAmount);
          fires = context.eligibleAmount >= threshold;
          if (!fires) {
            const remaining = round2(threshold - context.eligibleAmount);
            //* KEEP THE *NEAREST* UNMET THRESHOLD, NOT THE FIRST — A ฿500 AND A
            //* ฿1,000 RULE SHOULD NUDGE TOWARDS THE ONE ACTUALLY WITHIN REACH.
            if (progress === null || remaining < progress.remaining) {
              progress = { threshold, remaining, ruleName: rule.name };
            }
          }
          break;
        }
        case FreeDeliveryTrigger.PROMO_CODE:
          fires =
            context.appliedPromoCodeId != null &&
            rule.promoCodeId === context.appliedPromoCodeId;
          break;
        case FreeDeliveryTrigger.FIRST_ORDER: {
          //* A GUEST HAS NO HISTORY TO CHECK. TREATING THEM AS A FIRST-TIME
          //* CUSTOMER WOULD MAKE THE PERK FREE TO FARM BY CHECKING OUT LOGGED
          //* OUT, SO IT SIMPLY NEVER FIRES FOR THEM.
          if (!context.userId) break;
          if (isFirstOrder === null) {
            isFirstOrder = !(await this.repository.hasPreviousOrders(
              context.userId,
              tx,
            ));
          }
          fires = isFirstOrder;
          break;
        }
        case FreeDeliveryTrigger.CAMPAIGN:
          //* THE WINDOW IS THE WHOLE CONDITION, AND findApplicableRules ALREADY
          //* FILTERED ON IT — REACHING HERE MEANS IT IS LIVE.
          fires = true;
          break;
      }

      if (!fires) continue;

      //* THE COD FEE IS ONLY IN THE WAIVABLE POOL WHEN THE RULE OPTS IN.
      const waivable = deliveryOnly + (rule.waivesCodFee ? codFee : 0);
      const cap = toOptionalNum(rule.maxSubsidyAmount);
      const waivedAmount = round2(
        cap === null ? waivable : Math.min(waivable, cap),
      );

      //* A RULE THAT MATCHES ON A ZERO FEE STILL "WINS" AND STOPS THE WALK, BUT
      //* IT WAIVES NOTHING — SO freeDelivery.applied STAYS false RATHER THAN
      //* LABELLING A NATURALLY-FREE ZONE AS A PROMOTION.
      return {
        ruleId: waivedAmount > 0 ? rule.id : null,
        ruleName: waivedAmount > 0 ? rule.name : null,
        waivedAmount,
        progress: null,
      };
    }

    return { ruleId: null, ruleName: null, waivedAmount: 0, progress };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — zone rate-card management
  // ══════════════════════════════════════════════════════════════════════════

  async createZone(
    userId: number,
    dto: CreateDeliveryZoneDto,
  ): Promise<DeliveryZoneResponseDto> {
    this.assertRateCardIsUsable(dto.rates);

    const existing = await this.repository.findZoneByCode(dto.code);
    if (existing) {
      throw new ConflictException(
        `A delivery zone with the code ${dto.code} already exists`,
      );
    }

    const created = await this.repository.withTransaction(async (tx) => {
      //* THE PARTIAL UNIQUE INDEX WOULD REJECT A SECOND ACTIVE DEFAULT WITH A
      //* RAW CONSTRAINT ERROR. STANDING THE OLD ONE DOWN FIRST IS WHAT AN ADMIN
      //* MEANS BY TICKING THE BOX, AND DOING IT IN THIS TRANSACTION MEANS THERE
      //* IS NEVER A MOMENT WITH NO FALLBACK ZONE AT ALL.
      if (dto.isDefault) {
        await this.repository.clearDefaultZone(null, tx);
      }

      const zone = await this.repository.createZone(
        {
          code: dto.code,
          name: dto.name,
          nameTh: dto.nameTh,
          description: dto.description,
          isDefault: dto.isDefault ?? false,
          priority: dto.priority ?? 100,
          minDeliveryDays: dto.minDeliveryDays,
          maxDeliveryDays: dto.maxDeliveryDays,
          cutOffMinutes: dto.cutOffMinutes,
          businessDaysOnly: dto.businessDaysOnly ?? false,
          handlingFee: dto.handlingFee ?? 0,
          remoteSurcharge: dto.remoteSurcharge ?? 0,
          maxWeightKg: dto.maxWeightKg,
          codAvailable: dto.codAvailable ?? true,
          codFeePercent: dto.codFeePercent,
          codFeeMin: dto.codFeeMin,
          codFeeMax: dto.codFeeMax,
          rateBasis: dto.rateBasis ?? DeliveryRateBasis.FLAT,
          status: dto.status ?? DeliveryChargeStatus.ACTIVE,
          createdBy: userId,
          updatedBy: userId,
        },
        tx,
      );

      await this.repository.replaceZoneAreas(
        zone.id,
        dto.areas.map(toAreaRow),
        tx,
      );
      await this.repository.replaceZoneRates(
        zone.id,
        dto.rates.map(toRateRow),
        tx,
      );

      return (await this.repository.findZoneById(zone.id, tx))!;
    });

    return new DeliveryZoneResponseDto(created);
  }

  async getAllZones(
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<DeliveryZoneResponseDto>> {
    const paginated = await this.repository.findAllZones(params);
    return {
      ...paginated,
      data: paginated.data.map((zone) => new DeliveryZoneResponseDto(zone)),
    };
  }

  async getZoneById(id: number): Promise<DeliveryZoneResponseDto> {
    const zone = await this.repository.findZoneById(id);
    if (!zone) {
      throw new NotFoundException(`Delivery zone with ID ${id} not found`);
    }
    return new DeliveryZoneResponseDto(zone);
  }

  async updateZone(
    id: number,
    userId: number,
    dto: UpdateDeliveryZoneDto,
  ): Promise<DeliveryZoneResponseDto> {
    const existing = await this.repository.findZoneById(id);
    if (!existing) {
      throw new NotFoundException(`Delivery zone with ID ${id} not found`);
    }

    //* CROSS-FIELD ORDERING IS RE-CHECKED HERE, NOT LEFT TO THE DTO: AN UPDATE
    //* MAY TOUCH ONLY ONE END OF EITHER PAIR, SO THE COMPARISON HAS TO RUN
    //* AGAINST THE ROW'S EXISTING VALUE FOR WHICHEVER SIDE WAS NOT SUBMITTED.
    //* SAME REASONING AS DeliveryService.updateExternalDeliveryService.
    const effectiveMin = dto.minDeliveryDays ?? existing.minDeliveryDays;
    const effectiveMax = dto.maxDeliveryDays ?? existing.maxDeliveryDays;
    if (effectiveMax < effectiveMin) {
      throw new BadRequestException(
        'Maximum delivery days must be greater than or equal to minimum delivery days',
      );
    }

    const effectiveCodMin = dto.codFeeMin ?? toOptionalNum(existing.codFeeMin);
    const effectiveCodMax = dto.codFeeMax ?? toOptionalNum(existing.codFeeMax);
    if (
      effectiveCodMin !== null &&
      effectiveCodMax !== null &&
      effectiveCodMax < effectiveCodMin
    ) {
      throw new BadRequestException(
        'COD fee maximum must be greater than or equal to the COD fee minimum',
      );
    }

    if (dto.rates) this.assertRateCardIsUsable(dto.rates);

    if (dto.code && dto.code !== existing.code) {
      const conflict = await this.repository.findZoneByCode(dto.code);
      if (conflict && conflict.id !== id) {
        throw new ConflictException(
          `A delivery zone with the code ${dto.code} already exists`,
        );
      }
    }

    const updated = await this.repository.withTransaction(async (tx) => {
      if (dto.isDefault === true) {
        await this.repository.clearDefaultZone(id, tx);
      }

      await this.repository.updateZone(
        id,
        {
          code: dto.code,
          name: dto.name,
          nameTh: dto.nameTh,
          description: dto.description,
          isDefault: dto.isDefault,
          priority: dto.priority,
          minDeliveryDays: dto.minDeliveryDays,
          maxDeliveryDays: dto.maxDeliveryDays,
          cutOffMinutes: dto.cutOffMinutes,
          businessDaysOnly: dto.businessDaysOnly,
          handlingFee: dto.handlingFee,
          remoteSurcharge: dto.remoteSurcharge,
          maxWeightKg: dto.maxWeightKg,
          codAvailable: dto.codAvailable,
          codFeePercent: dto.codFeePercent,
          codFeeMin: dto.codFeeMin,
          codFeeMax: dto.codFeeMax,
          rateBasis: dto.rateBasis,
          status: dto.status,
          updatedBy: userId,
        },
        tx,
      );

      //* undefined = LEAVE ALONE, AN ARRAY = REPLACE WHOLESALE. SEE THE
      //* UpdateDeliveryZoneDto DOC COMMENT FOR WHY THESE TWO ARE DECLARATIVE
      //* WHILE EVERY SCALAR ABOVE IS A MERGE.
      if (dto.areas !== undefined) {
        await this.repository.replaceZoneAreas(
          id,
          dto.areas.map(toAreaRow),
          tx,
        );
      }
      if (dto.rates !== undefined) {
        await this.repository.replaceZoneRates(
          id,
          dto.rates.map(toRateRow),
          tx,
        );
      }

      return (await this.repository.findZoneById(id, tx))!;
    });

    return new DeliveryZoneResponseDto(updated);
  }

  async deleteZone(id: number): Promise<void> {
    const existing = await this.repository.findZoneById(id);
    if (!existing) {
      throw new NotFoundException(`Delivery zone with ID ${id} not found`);
    }
    //* THE CATCH-ALL IS LOAD-BEARING: WITHOUT IT, EVERY ADDRESS NO AREA RULE
    //* COVERS IS REFUSED AT CHECKOUT. DELETING IT WOULD TAKE ORDERS OFFLINE
    //* FOR AN UNKNOWABLE SLICE OF THE COUNTRY, SO IT HAS TO BE HANDED OVER
    //* FIRST — SET ANOTHER ZONE AS DEFAULT, THEN DELETE THIS ONE.
    if (existing.isDefault) {
      throw new ConflictException(
        'This is the fallback zone for addresses no other zone covers. Make another zone the default first, then delete this one.',
      );
    }
    await this.repository.deleteZone(id);
  }

  /**
   * Rejects a rate card that cannot price every basket.
   *
   * The database guarantees no two active bands *overlap*; it cannot see the
   * opposite failure, a band that is missing. Two shapes matter:
   *
   *   * No open-ended top band. Every basket above the highest maxValue would
   *     land in a hole and be refused at checkout — a rate card that works in
   *     testing and fails on the first bulk order.
   *   * More than one open-ended band. The overlap constraint already catches
   *     this for active bands, but catching it here turns a raw Postgres
   *     constraint error into a sentence an admin can act on.
   *
   * Only active bands are considered, matching what the calculator reads.
   */
  private assertRateCardIsUsable(rates: DeliveryRateInputDto[]): void {
    const active = rates.filter(
      (rate) =>
        (rate.status ?? DeliveryChargeStatus.ACTIVE) ===
        DeliveryChargeStatus.ACTIVE,
    );
    if (!active.length) {
      throw new BadRequestException(
        'A delivery zone needs at least one active rate band, or it can never price an order',
      );
    }

    const openEnded = active.filter((rate) => rate.maxValue === undefined);
    if (openEnded.length === 0) {
      throw new BadRequestException(
        'The rate card needs one open-ended top band (leave maxValue empty), or orders above the highest band cannot be priced',
      );
    }
    if (openEnded.length > 1) {
      throw new BadRequestException(
        'Only one rate band may be open-ended — every other band needs a maxValue',
      );
    }

    for (const rate of active) {
      const min = rate.minValue ?? 0;
      if (rate.maxValue !== undefined && rate.maxValue <= min) {
        throw new BadRequestException(
          `Rate band "${rate.label ?? min}" has a maximum that is not above its minimum`,
        );
      }
      //* THE DB'S OWN CHECK CATCHES THIS TOO; SAYING IT HERE NAMES THE BAND.
      if ((rate.stepFee ?? 0) > 0 && rate.stepUnit === undefined) {
        throw new BadRequestException(
          `Rate band "${rate.label ?? min}" charges a step fee but does not say how big a step is`,
        );
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — nationwide flat rate (one charge, everywhere)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Reads the nationwide flat rate, together with whatever currently overrides
   * it.
   *
   * The second half is the part that matters. A nationwide rate is the
   * catch-all, so it only reaches an address no other zone claims — a shop
   * that seeded a four-zone Thailand card and then set a flat ฿50 would have
   * that ฿50 apply almost nowhere. Returning the overriding zone names lets
   * the screen say so instead of letting an admin believe a price is in force
   * that mostly is not.
   */
  async getNationwideFlatRate(): Promise<NationwideFlatRateDto> {
    const zone = await this.repository.findZoneByCodeFull(NATIONWIDE_ZONE_CODE);
    const overriding = await this.repository.findOverridingZoneNames(
      zone?.id ?? null,
    );
    return new NationwideFlatRateDto(
      zone ? new DeliveryZoneResponseDto(zone) : null,
      overriding,
    );
  }

  /**
   * Sets one delivery charge for the whole country, creating the zone the
   * first time and updating it after.
   *
   * Idempotent by design — the admin screen has one "save" button and no idea
   * whether the zone exists yet, and making it find out first would be a race
   * against a second admin doing the same thing. The reserved `NATIONWIDE`
   * code is what makes the upsert possible.
   *
   * What it builds underneath is an ordinary zone: FLAT basis, **no** area
   * rules, `isDefault` so it catches everything, and exactly one open-ended
   * band holding the charge. No area rules is the deliberate part — a
   * country-wide wildcard row would score against every address and be
   * indistinguishable from the fallback it already is, so `isDefault` is left
   * as the whole mechanism. Nothing in the calculator is special-cased for
   * this zone, which is what lets a shop start here and later add a REMOTE
   * zone without migrating anything.
   */
  async setNationwideFlatRate(
    userId: number,
    dto: SetNationwideFlatRateDto,
  ): Promise<NationwideFlatRateDto> {
    const scalars = {
      name: dto.name ?? 'Nationwide',
      nameTh: dto.nameTh ?? null,
      description:
        'One delivery charge for the whole country. Catches every address no other zone covers.',
      isDefault: true,
      //* HIGHEST NUMBER = LAST RESORT. priority ONLY BREAKS TIES BETWEEN EQUALLY
      //* SPECIFIC MATCHES, AND THIS ZONE HAS NO AREA RULES TO MATCH WITH, SO
      //* THE VALUE IS DOCUMENTATION MORE THAN MECHANISM — BUT IT KEEPS THE
      //* ADMIN LIST (SORTED BY priority) READING IN THE RIGHT ORDER.
      priority: 1000,
      minDeliveryDays: dto.minDeliveryDays,
      maxDeliveryDays: dto.maxDeliveryDays,
      cutOffMinutes: dto.cutOffMinutes ?? null,
      businessDaysOnly: dto.businessDaysOnly ?? false,
      //* THE WHOLE CHARGE LIVES IN THE ONE RATE BAND. SPLITTING PART OF IT INTO
      //* handlingFee WOULD MAKE THE NUMBER THE ADMIN TYPED DIFFER FROM THE
      //* NUMBER THE CUSTOMER PAYS, WHICH IS THE ONE THING THIS SIMPLE MODE
      //* EXISTS TO GUARANTEE.
      handlingFee: 0,
      remoteSurcharge: 0,
      maxWeightKg: dto.maxWeightKg ?? null,
      codAvailable: dto.codAvailable ?? true,
      codFeePercent: dto.codFeePercent ?? null,
      codFeeMin: dto.codFeeMin ?? null,
      codFeeMax: dto.codFeeMax ?? null,
      rateBasis: DeliveryRateBasis.FLAT,
      status: DeliveryChargeStatus.ACTIVE,
    };

    const zone = await this.repository.withTransaction(async (tx) => {
      //* THE PARTIAL UNIQUE INDEX ALLOWS ONE ACTIVE DEFAULT, SO WHATEVER HOLDS
      //* IT HAS TO BE STOOD DOWN FIRST — INSIDE THIS TRANSACTION, SO THERE IS
      //* NEVER A MOMENT WITH NO FALLBACK ZONE AT ALL.
      await this.repository.clearDefaultZone(null, tx);

      const saved = await this.repository.upsertZoneByCode(
        NATIONWIDE_ZONE_CODE,
        { ...scalars, createdBy: userId, updatedBy: userId },
        { ...scalars, updatedBy: userId },
        tx,
      );

      await this.repository.replaceZoneAreas(saved.id, [], tx);
      await this.repository.replaceZoneRates(
        saved.id,
        [
          {
            label: 'All orders',
            minValue: 0,
            maxValue: null,
            baseFee: dto.charge,
            stepUnit: null,
            stepFee: 0,
            status: DeliveryChargeStatus.ACTIVE,
          },
        ],
        tx,
      );

      if (dto.exclusive) {
        await this.repository.deactivateOtherZones(saved.id, tx);
      }

      return (await this.repository.findZoneById(saved.id, tx))!;
    });

    const overriding = await this.repository.findOverridingZoneNames(zone.id);
    return new NationwideFlatRateDto(
      new DeliveryZoneResponseDto(zone),
      overriding,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — free-delivery rules
  // ══════════════════════════════════════════════════════════════════════════

  async createRule(
    userId: number,
    dto: CreateFreeDeliveryRuleDto,
  ): Promise<FreeDeliveryRuleResponseDto> {
    this.assertTriggerInputs(dto.trigger, dto.minOrderAmount, dto.promoCodeId);

    const created = await this.repository.createRule({
      name: dto.name,
      description: dto.description,
      trigger: dto.trigger,
      minOrderAmount: dto.minOrderAmount,
      promoCodeId: dto.promoCodeId,
      zoneId: dto.zoneId,
      maxSubsidyAmount: dto.maxSubsidyAmount,
      waivesCodFee: dto.waivesCodFee ?? false,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      usageLimit: dto.usageLimit,
      priority: dto.priority ?? 100,
      isActive: dto.isActive ?? true,
      createdBy: userId,
      updatedBy: userId,
    });

    return new FreeDeliveryRuleResponseDto(created);
  }

  async getAllRules(
    params: FreeDeliveryRuleQueryDto,
  ): Promise<IPaginatedResult<FreeDeliveryRuleResponseDto>> {
    const paginated = await this.repository.findAllRules(params);
    return {
      ...paginated,
      data: paginated.data.map((rule) => new FreeDeliveryRuleResponseDto(rule)),
    };
  }

  async updateRule(
    id: number,
    userId: number,
    dto: UpdateFreeDeliveryRuleDto,
  ): Promise<FreeDeliveryRuleResponseDto> {
    const existing = await this.repository.findRuleById(id);
    if (!existing) {
      throw new NotFoundException(`Free delivery rule with ID ${id} not found`);
    }

    //* THE TRIGGER/INPUT PAIRING IS CHECKED AGAINST THE *MERGED* ROW, NOT THE
    //* PATCH: SWITCHING trigger TO MIN_ORDER_AMOUNT WITHOUT SENDING A
    //* minOrderAmount IS ONLY VALID IF THE ROW ALREADY CARRIES ONE.
    const trigger = dto.trigger ?? existing.trigger;
    const minOrderAmount =
      dto.minOrderAmount ?? toOptionalNum(existing.minOrderAmount) ?? undefined;
    const promoCodeId = dto.promoCodeId ?? existing.promoCodeId ?? undefined;
    this.assertTriggerInputs(trigger, minOrderAmount, promoCodeId);

    //* THE CHECK CONSTRAINT ALSO FORBIDS AN INPUT THAT BELONGS TO A *DIFFERENT*
    //* TRIGGER, SO CHANGING THE TRIGGER MUST ALSO CLEAR WHAT THE OLD ONE USED.
    //* DOING IT HERE RATHER THAN MAKING THE ADMIN SEND EXPLICIT NULLS KEEPS THE
    //* PATCH SEMANTICS ("SEND WHAT YOU CHANGED") INTACT.
    const triggerChanged =
      dto.trigger !== undefined && dto.trigger !== existing.trigger;

    const updated = await this.repository.updateRule(id, {
      name: dto.name,
      description: dto.description,
      trigger: dto.trigger,
      minOrderAmount:
        trigger === FreeDeliveryTrigger.MIN_ORDER_AMOUNT
          ? (dto.minOrderAmount ??
            (triggerChanged ? minOrderAmount : undefined))
          : null,
      promoCodeId:
        trigger === FreeDeliveryTrigger.PROMO_CODE
          ? (dto.promoCodeId ?? (triggerChanged ? promoCodeId : undefined))
          : null,
      zoneId: dto.zoneId,
      maxSubsidyAmount: dto.maxSubsidyAmount,
      waivesCodFee: dto.waivesCodFee,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      usageLimit: dto.usageLimit,
      priority: dto.priority,
      isActive: dto.isActive,
      updatedBy: userId,
    });

    return new FreeDeliveryRuleResponseDto(updated);
  }

  async deleteRule(id: number): Promise<void> {
    const existing = await this.repository.findRuleById(id);
    if (!existing) {
      throw new NotFoundException(`Free delivery rule with ID ${id} not found`);
    }
    //* HARD DELETE. UNLIKE A PROMO CODE, A FREE-DELIVERY RULE HAS NO REDEMPTION
    //* LEDGER POINTING AT IT — ORDERS SNAPSHOT THE RULE'S *NAME*
    //* (Order.freeDeliveryRuleName), NOT ITS ID, SO HISTORY STILL EXPLAINS
    //* ITSELF AFTER THE RULE IS GONE.
    await this.repository.deleteRule(id);
  }

  /** Each trigger requires its own input and refuses the others'. */
  private assertTriggerInputs(
    trigger: FreeDeliveryTrigger,
    minOrderAmount: number | undefined,
    promoCodeId: number | undefined,
  ): void {
    if (trigger === FreeDeliveryTrigger.MIN_ORDER_AMOUNT) {
      if (minOrderAmount === undefined) {
        throw new BadRequestException(
          'A minimum-basket rule needs a minOrderAmount, or it can never fire',
        );
      }
      if (promoCodeId !== undefined) {
        throw new BadRequestException(
          'A minimum-basket rule cannot also be tied to a promo code — create a separate PROMO_CODE rule instead',
        );
      }
      return;
    }

    if (trigger === FreeDeliveryTrigger.PROMO_CODE) {
      if (promoCodeId === undefined) {
        throw new BadRequestException(
          'A promo-code rule needs a promoCodeId, or it can never fire',
        );
      }
      if (minOrderAmount !== undefined) {
        throw new BadRequestException(
          'A promo-code rule cannot also carry a minimum basket — put that condition on the promo code itself (PromoCode.minOrderAmount)',
        );
      }
      return;
    }

    //* FIRST_ORDER AND CAMPAIGN TAKE NO EXTRA INPUT. CARRYING ONE WOULD SUGGEST
    //* A CONDITION THAT IS NEVER ACTUALLY EVALUATED.
    if (minOrderAmount !== undefined || promoCodeId !== undefined) {
      throw new BadRequestException(
        `A ${trigger} rule takes no minOrderAmount or promoCodeId — its window and zone scope are the whole condition`,
      );
    }
  }

  // ── Storefront ────────────────────────────────────────────────────────────

  /** The site-wide "free delivery over X" promise, if one is live. */
  async getPublicFreeDeliveryThreshold() {
    return await this.repository.findLowestPublicThreshold();
  }
}

// ─── DTO → row mappers ───────────────────────────────────────────────────────

function toAreaRow(area: DeliveryAreaInputDto) {
  return {
    country: area.country ?? 'Thailand',
    state: area.state ?? null,
    region: area.region ?? null,
    postalCode: area.postalCode ?? null,
    postalPrefix: area.postalPrefix ?? null,
  };
}

function toRateRow(rate: DeliveryRateInputDto) {
  return {
    label: rate.label ?? null,
    minValue: rate.minValue ?? 0,
    maxValue: rate.maxValue ?? null,
    baseFee: rate.baseFee,
    stepUnit: rate.stepUnit ?? null,
    stepFee: rate.stepFee ?? 0,
    status: rate.status ?? DeliveryChargeStatus.ACTIVE,
  };
}
