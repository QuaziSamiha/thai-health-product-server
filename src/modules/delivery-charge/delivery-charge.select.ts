//* ═══════════════════════════════════════════════════════════════════════
//* DELIVERY-CHARGE SELECT SHAPES — PRISMA PROJECTIONS.
//* KEEP IN SYNC WITH THE DTO CONSTRUCTORS THEY FEED (see ./dto).
//* ═══════════════════════════════════════════════════════════════════════

export const DELIVERY_CHARGE_AREA_SELECT = {
  id: true,
  country: true,
  state: true,
  region: true,
  postalCode: true,
  postalPrefix: true,
} as const;

export const DELIVERY_CHARGE_RATE_SELECT = {
  id: true,
  sid: true,
  label: true,
  minValue: true,
  maxValue: true,
  baseFee: true,
  stepUnit: true,
  stepFee: true,
  status: true,
} as const;

//* THE ADMIN ZONE ROW — ONE ZONE WITH ITS FULL RULE SET. THE ADMIN SCREEN
//* EDITS A ZONE AS ONE FORM (COVERAGE TABLE + RATE TABLE), SO THE LIST READ
//* CARRIES BOTH RATHER THAN MAKING THE UI FAN OUT PER ROW.
export const DELIVERY_CHARGE_ZONE_SELECT = {
  id: true,
  sid: true,
  code: true,
  name: true,
  nameTh: true,
  description: true,
  isDefault: true,
  priority: true,
  minDeliveryDays: true,
  maxDeliveryDays: true,
  cutOffMinutes: true,
  businessDaysOnly: true,
  handlingFee: true,
  remoteSurcharge: true,
  maxWeightKg: true,
  codAvailable: true,
  codFeePercent: true,
  codFeeMin: true,
  codFeeMax: true,
  rateBasis: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  areas: {
    select: DELIVERY_CHARGE_AREA_SELECT,
    orderBy: { id: 'asc' },
  },
  rates: {
    select: DELIVERY_CHARGE_RATE_SELECT,
    orderBy: { minValue: 'asc' },
  },
} as const;

//* WHAT THE CALCULATOR NEEDS AND NOTHING ELSE. DELIBERATELY NOT REUSING THE
//* ADMIN SELECT ABOVE: THE QUOTE PATH IS THE HOTTEST READ IN THIS MODULE AND
//* HAS NO USE FOR description/AUDIT COLUMNS, AND rates IS FILTERED TO ACTIVE
//* TIERS HERE SO THE TIER SEARCH NEVER HAS TO RE-CHECK STATUS IN MEMORY.
export const DELIVERY_CHARGE_ZONE_PRICING_SELECT = {
  id: true,
  code: true,
  name: true,
  nameTh: true,
  priority: true,
  isDefault: true,
  minDeliveryDays: true,
  maxDeliveryDays: true,
  cutOffMinutes: true,
  businessDaysOnly: true,
  handlingFee: true,
  remoteSurcharge: true,
  maxWeightKg: true,
  codAvailable: true,
  codFeePercent: true,
  codFeeMin: true,
  codFeeMax: true,
  rateBasis: true,
  rates: {
    where: { status: 'ACTIVE' as const },
    select: DELIVERY_CHARGE_RATE_SELECT,
    orderBy: { minValue: 'asc' as const },
  },
} as const;

export const FREE_DELIVERY_RULE_SELECT = {
  id: true,
  sid: true,
  name: true,
  description: true,
  trigger: true,
  minOrderAmount: true,
  promoCodeId: true,
  promoCode: { select: { id: true, code: true } },
  zoneId: true,
  zone: { select: { id: true, code: true, name: true } },
  maxSubsidyAmount: true,
  waivesCodFee: true,
  startsAt: true,
  endsAt: true,
  usageLimit: true,
  usedCount: true,
  priority: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;
