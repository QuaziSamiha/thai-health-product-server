//* ═══════════════════════════════════════════════════════════════════════
//* THE PRICING RULES THEMSELVES — PURE FUNCTIONS, NO PRISMA, NO NEST.
//*
//* EVERYTHING IN THIS FILE TAKES PLAIN NUMBERS AND RETURNS PLAIN NUMBERS.
//* THAT IS DELIBERATE: DELIVERY PRICING IS THE PART OF CHECKOUT MOST LIKELY
//* TO BE ARGUED ABOUT WITH A CUSTOMER, AND RULES THAT NEED A DATABASE TO
//* EXERCISE ARE RULES NOBODY WRITES A TEST FOR. THE SERVICE LOADS ROWS AND
//* HANDS THEM HERE; THE DECISIONS LIVE HERE AND ONLY HERE.
//* ═══════════════════════════════════════════════════════════════════════

import { DeliveryRateBasis } from '../../generated/prisma/enums';
import { THAILAND_UTC_OFFSET_MINUTES } from './delivery-charge.constants';

/** Money is rounded to satang at every step — never accumulated raw. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Weight keeps three decimals, matching Decimal(10, 3) on the columns. */
export function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

// ─── Zone matching ──────────────────────────────────────────────────────────

/** The address fields zone matching is decided on — a subset of OrderAddress. */
export interface DeliveryDestination {
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  country: string;
}

/** One DeliveryChargeArea row, reduced to what matching reads. */
export interface AreaRule {
  country: string;
  province: string | null;
  district: string | null;
  subdistrict: string | null;
  postalCode: string | null;
  postalPrefix: string | null;
}

/** Case- and whitespace-insensitive compare, so "bangkok " matches "Bangkok". */
function sameText(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * How well one area rule describes a destination, or `null` if it does not
 * describe it at all.
 *
 * The ladder is the whole zone-resolution policy in one place, and the gaps
 * between rungs are deliberate — they leave room to slot a new rule class in
 * later without renumbering the ones already in production:
 *
 *   1000  exact postal code          the most specific statement possible
 *    950  province + district + subdistrict
 *    900  province + district
 *    800  postal prefix              +length, so "101" outranks "10"
 *    600  province alone
 *    100  country alone              a deliberate catch-all rule
 *
 * A NULL field is a wildcard, never a mismatch: `{ province: null }` is a claim
 * about the whole country, not a claim about addresses with no province. A
 * populated field that disagrees is a hard miss, which is what stops a Bangkok
 * rule from being scored against a Chiang Mai address at all.
 *
 * Country is checked first and unconditionally — a Thailand rate card has
 * nothing to say about an overseas address, and silently pricing one off the
 * catch-all would be worse than refusing it.
 */
export function scoreArea(
  rule: AreaRule,
  destination: DeliveryDestination,
): number | null {
  if (!sameText(rule.country, destination.country)) return null;

  if (rule.postalCode !== null) {
    return sameText(rule.postalCode, destination.postalCode) ? 1000 : null;
  }

  if (rule.postalPrefix !== null) {
    const prefix = rule.postalPrefix.trim();
    if (!destination.postalCode.trim().startsWith(prefix)) return null;
    //* LONGER PREFIX = NARROWER CLAIM. WITHOUT THE +length A "10" RULE AND A
    //* "101" RULE WOULD TIE AND THE ZONE WOULD BE PICKED BY priority ALONE,
    //* WHICH IS NOT WHAT EITHER RULE'S AUTHOR MEANT.
    return 800 + prefix.length;
  }

  if (
    rule.province !== null &&
    !sameText(rule.province, destination.province)
  ) {
    return null;
  }
  if (
    rule.district !== null &&
    !sameText(rule.district, destination.district)
  ) {
    return null;
  }
  if (
    rule.subdistrict !== null &&
    !sameText(rule.subdistrict, destination.subdistrict)
  ) {
    return null;
  }

  //* THE HIERARCHY IS ENFORCED IN THE DB (district_needs_province,
  //* subdistrict_needs_district CHECKS IN MIGRATION 20260824090000), SO A
  //* NON-NULL subdistrict ALWAYS ARRIVES WITH ITS district AND province.
  if (rule.subdistrict !== null) return 950;
  if (rule.province !== null && rule.district !== null) return 900;
  if (rule.province !== null) return 600;
  return 100;
}

// ─── Rate tiers ─────────────────────────────────────────────────────────────

/** One DeliveryChargeRate row, reduced to what pricing reads. */
export interface RateTier {
  minValue: number;
  maxValue: number | null;
  baseFee: number;
  stepUnit: number | null;
  stepFee: number;
}

/**
 * The tier a metric falls into, on half-open bands `[minValue, maxValue)`.
 *
 * Half-open is what makes exactly 1.0 kg belong to the 1–3 band and not to
 * both it and the 0–1 band. The database enforces that no two ACTIVE bands
 * under one zone overlap (see the GiST exclusion constraint in the migration),
 * so at most one tier can ever match and the search can stop at the first hit
 * rather than having to resolve a conflict it has no rule for.
 *
 * Returns `null` when the metric falls in a hole in the card — the caller
 * turns that into a refusal, never a free delivery.
 */
export function findRateTier(
  tiers: readonly RateTier[],
  metric: number,
): RateTier | null {
  return (
    tiers.find(
      (tier) =>
        metric >= tier.minValue &&
        (tier.maxValue === null || metric < tier.maxValue),
    ) ?? null
  );
}

/**
 * What a tier charges for a given metric.
 *
 * `baseFee` covers landing in the band at all. `stepFee` then charges for each
 * *started* `stepUnit` above `minValue`, which is how couriers actually round
 * — 5.1 kg on a "5 kg+, ฿120, then ฿20/kg" tier is ฿140, not ฿122. A tier with
 * no `stepUnit` is flat across its whole band.
 */
export function priceTier(tier: RateTier, metric: number): number {
  if (tier.stepUnit === null || tier.stepUnit <= 0 || tier.stepFee <= 0) {
    return round2(tier.baseFee);
  }
  const overage = Math.max(0, metric - tier.minValue);
  const steps = Math.ceil(round3(overage) / tier.stepUnit);
  return round2(tier.baseFee + steps * tier.stepFee);
}

/** Which cart metric a zone's tiers are measured against. */
export function metricForBasis(
  basis: DeliveryRateBasis,
  metrics: { weightKg: number; itemCount: number; orderValue: number },
): number {
  switch (basis) {
    case DeliveryRateBasis.WEIGHT:
      return metrics.weightKg;
    case DeliveryRateBasis.ITEM_COUNT:
      return metrics.itemCount;
    case DeliveryRateBasis.ORDER_VALUE:
      return metrics.orderValue;
    case DeliveryRateBasis.FLAT:
    default:
      //* A FLAT ZONE HAS ONE BAND STARTING AT 0, SO ANY METRIC RESOLVES TO IT.
      //* USING 0 RATHER THAN THE WEIGHT KEEPS "FLAT" HONEST: THE CARD CANNOT
      //* ACCIDENTALLY BECOME WEIGHT-SENSITIVE BY SOMEONE ADDING A SECOND BAND.
      return 0;
  }
}

// ─── COD fee ────────────────────────────────────────────────────────────────

/**
 * Cash-on-delivery handling fee: a percentage of the amount the courier will
 * collect at the door, clamped to the zone's floor and ceiling.
 *
 * The collected amount is goods + delivery, not goods alone — the customer
 * hands over the whole total, and that is what the courier's own fee is a
 * percentage of. Both bounds are optional so a zone can charge a pure
 * percentage, a clamped one, or (with no percentage at all) nothing.
 */
export function calculateCodFee(
  collectedAmount: number,
  zone: {
    codFeePercent: number | null;
    codFeeMin: number | null;
    codFeeMax: number | null;
  },
): number {
  if (zone.codFeePercent === null || zone.codFeePercent <= 0) {
    //* NO PERCENTAGE CONFIGURED MEANS NO COD FEE — codFeeMin IS A FLOOR ON A
    //* FEE THAT EXISTS, NOT AN INSTRUCTION TO INVENT ONE.
    return 0;
  }
  let fee = (collectedAmount * zone.codFeePercent) / 100;
  if (zone.codFeeMin !== null) fee = Math.max(fee, zone.codFeeMin);
  if (zone.codFeeMax !== null) fee = Math.min(fee, zone.codFeeMax);
  return round2(fee);
}

// ─── Estimated delivery dates ───────────────────────────────────────────────

/**
 * Turns the zone's promise (in days) into the two real dates the customer is
 * shown, in Asia/Bangkok terms.
 *
 * Two rules shape it:
 *
 *   * The dispatch cut-off. An order placed after it does not go out today, so
 *     the clock starts tomorrow. This is why the same 2–3 day zone can quote
 *     different dates at 15:59 and 16:01 without anything being reconfigured.
 *   * Sundays, when the zone asks for them. Thai couriers work Saturdays, so
 *     Sunday is the only non-working day worth modelling — a five-day week
 *     would push every upcountry promise out by a day it does not need.
 *
 * Bangkok is UTC+7 with no DST ever, so shifting by a fixed offset is exact
 * here, not an approximation. The returned Dates are UTC instants at the start
 * of the Bangkok day, which is what a Timestamptz column wants.
 */
export function calculateEstimatedDelivery(
  now: Date,
  zone: {
    minDeliveryDays: number;
    maxDeliveryDays: number;
    cutOffMinutes: number | null;
    businessDaysOnly: boolean;
  },
): { from: Date; to: Date } {
  const bangkokNow = new Date(
    now.getTime() + THAILAND_UTC_OFFSET_MINUTES * 60_000,
  );

  //* MIDNIGHT OF THE BANGKOK CALENDAR DAY, EXPRESSED AS THE UTC INSTANT IT
  //* CORRESPONDS TO. EVERY ARITHMETIC STEP BELOW IS WHOLE DAYS FROM HERE, SO
  //* THE RESULT CANNOT DRIFT BY HOURS.
  const dispatchDay = Date.UTC(
    bangkokNow.getUTCFullYear(),
    bangkokNow.getUTCMonth(),
    bangkokNow.getUTCDate(),
  );

  const minutesIntoDay =
    bangkokNow.getUTCHours() * 60 + bangkokNow.getUTCMinutes();
  const missedCutOff =
    zone.cutOffMinutes !== null && minutesIntoDay >= zone.cutOffMinutes;

  const start = missedCutOff ? dispatchDay + 86_400_000 : dispatchDay;
  const startUtc = start - THAILAND_UTC_OFFSET_MINUTES * 60_000;

  return {
    from: addDeliveryDays(
      startUtc,
      zone.minDeliveryDays,
      zone.businessDaysOnly,
    ),
    to: addDeliveryDays(startUtc, zone.maxDeliveryDays, zone.businessDaysOnly),
  };
}

/**
 * Adds whole delivery days to a dispatch instant, optionally skipping Sundays.
 *
 * Counted one day at a time rather than with a weeks-and-remainder formula:
 * the loop is bounded by the day count (never more than a couple of weeks in
 * any real rate card) and it is obviously correct, which the closed form is
 * not once a Sunday start is in play.
 */
export function addDeliveryDays(
  startUtcMs: number,
  days: number,
  businessDaysOnly: boolean,
): Date {
  let cursor = startUtcMs;
  let remaining = Math.max(0, days);

  while (remaining > 0) {
    cursor += 86_400_000;
    if (businessDaysOnly && isBangkokSunday(cursor)) continue;
    remaining -= 1;
  }

  //* A ZERO-DAY PROMISE (SAME-DAY BANGKOK) THAT LANDS ON A SUNDAY STILL HAS TO
  //* MOVE — THE LOOP ABOVE NEVER RAN, SO NOTHING ELSE WOULD CATCH IT.
  while (businessDaysOnly && isBangkokSunday(cursor)) {
    cursor += 86_400_000;
  }

  return new Date(cursor);
}

function isBangkokSunday(utcMs: number): boolean {
  return (
    new Date(utcMs + THAILAND_UTC_OFFSET_MINUTES * 60_000).getUTCDay() === 0
  );
}
