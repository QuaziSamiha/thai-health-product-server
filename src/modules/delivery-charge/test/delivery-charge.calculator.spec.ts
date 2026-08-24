import {
  addDeliveryDays,
  calculateCodFee,
  calculateEstimatedDelivery,
  findRateTier,
  metricForBasis,
  priceTier,
  scoreArea,
  type AreaRule,
  type RateTier,
} from '../delivery-charge.calculator';
import { DeliveryRateBasis } from '../../../generated/prisma/enums';

// ---------------------------------------------------------------------------
// Helpers
//
// Every assertion about a date is written in Asia/Bangkok terms, because that
// is the only frame the rules are stated in — a cut-off is 16:00 *there*, and
// the day a parcel is promised for is a Thai calendar day. Comparing raw UTC
// instants would make every expectation read as an off-by-seven-hours puzzle.
// ---------------------------------------------------------------------------

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

/** A Date rendered as "YYYY-MM-DD HH:mm" in Bangkok local time. */
const ict = (date: Date): string =>
  new Date(date.getTime() + ICT_OFFSET_MS)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');

/** A UTC instant from a Bangkok wall-clock time, so tests read as ICT. */
const atIct = (iso: string): Date =>
  new Date(new Date(`${iso}Z`).getTime() - ICT_OFFSET_MS);

const area = (overrides: Partial<AreaRule>): AreaRule => ({
  country: 'Thailand',
  province: null,
  district: null,
  subdistrict: null,
  postalCode: null,
  postalPrefix: null,
  ...overrides,
});

const BANGKOK = {
  subdistrict: 'Khlong Toei Nuea',
  district: 'Watthana',
  province: 'Bangkok',
  postalCode: '10110',
  country: 'Thailand',
};

describe('scoreArea — which zone claims an address', () => {
  it('ranks an exact postal code above every other kind of rule', () => {
    expect(scoreArea(area({ postalCode: '10110' }), BANGKOK)).toBe(1000);
    expect(
      scoreArea(
        area({
          province: 'Bangkok',
          district: 'Watthana',
          subdistrict: 'Khlong Toei Nuea',
        }),
        BANGKOK,
      ),
    ).toBe(950);
    expect(
      scoreArea(area({ province: 'Bangkok', district: 'Watthana' }), BANGKOK),
    ).toBe(900);
    expect(scoreArea(area({ province: 'Bangkok' }), BANGKOK)).toBe(600);
    expect(scoreArea(area({}), BANGKOK)).toBe(100);
  });

  //* THIS IS THE PROPERTY THAT LETS AN ISLAND BE CARVED OUT OF ITS PROVINCE
  //* WITHOUT ANY "EXCLUDE" MECHANISM: THE REMOTE ZONE NAMES KOH SAMUI'S POSTAL
  //* CODE, THE UPCOUNTRY ZONE NAMES SURAT THANI, AND THE NARROWER ONE WINS.
  it('lets a narrower rule beat a wider one over the same address', () => {
    const exact = scoreArea(area({ postalCode: '10110' }), BANGKOK)!;
    const province = scoreArea(area({ province: 'Bangkok' }), BANGKOK)!;
    expect(exact).toBeGreaterThan(province);
  });

  it('ranks a longer postal prefix above a shorter one', () => {
    const narrow = scoreArea(area({ postalPrefix: '101' }), BANGKOK)!;
    const wide = scoreArea(area({ postalPrefix: '10' }), BANGKOK)!;
    expect(narrow).toBeGreaterThan(wide);
  });

  it('treats a null field as a wildcard, not as a requirement to be null', () => {
    //* { province: null } CLAIMS THE WHOLE COUNTRY. IF IT WERE READ AS "ADDRESSES
    //* WITH NO PROVINCE" THE CATCH-ALL RULE WOULD MATCH NOTHING AT ALL.
    expect(scoreArea(area({}), BANGKOK)).not.toBeNull();
  });

  it('ignores case and surrounding whitespace', () => {
    expect(scoreArea(area({ province: '  bangkok ' }), BANGKOK)).toBe(600);
  });

  it('is a hard miss when a populated field disagrees', () => {
    expect(scoreArea(area({ province: 'Chiang Mai' }), BANGKOK)).toBeNull();
    expect(
      scoreArea(area({ province: 'Bangkok', district: 'Bang Rak' }), BANGKOK),
    ).toBeNull();
    expect(
      scoreArea(
        area({
          province: 'Bangkok',
          district: 'Watthana',
          subdistrict: 'Khlong Tan Nuea',
        }),
        BANGKOK,
      ),
    ).toBeNull();
    //* A POSTAL RULE THAT DOES NOT MATCH MUST NOT FALL THROUGH TO BE SCORED AS
    //* A PROVINCE OR COUNTRY RULE — THAT WOULD MAKE A 50000 RULE MATCH BANGKOK.
    expect(scoreArea(area({ postalCode: '50000' }), BANGKOK)).toBeNull();
    expect(scoreArea(area({ postalPrefix: '5' }), BANGKOK)).toBeNull();
  });

  it('refuses an address in another country outright', () => {
    expect(scoreArea(area({ country: 'Malaysia' }), BANGKOK)).toBeNull();
    expect(scoreArea(area({}), { ...BANGKOK, country: 'Malaysia' })).toBeNull();
  });
});

describe('findRateTier — which band prices a basket', () => {
  const tiers: RateTier[] = [
    { minValue: 0, maxValue: 1, baseFee: 40, stepUnit: null, stepFee: 0 },
    { minValue: 1, maxValue: 3, baseFee: 55, stepUnit: null, stepFee: 0 },
    { minValue: 10, maxValue: null, baseFee: 150, stepUnit: 1, stepFee: 15 },
  ];

  it('puts a boundary value in the upper band, never both', () => {
    //* HALF-OPEN [min, max). EXACTLY 1 KG BELONGS TO 1-3, NOT TO 0-1.
    expect(findRateTier(tiers, 1)?.baseFee).toBe(55);
    expect(findRateTier(tiers, 0.999)?.baseFee).toBe(40);
    expect(findRateTier(tiers, 2.999)?.baseFee).toBe(55);
  });

  it('matches the open-ended top band from its floor upward', () => {
    expect(findRateTier(tiers, 10)?.baseFee).toBe(150);
    expect(findRateTier(tiers, 500)?.baseFee).toBe(150);
  });

  //* A HOLE IN THE CARD MUST SURFACE AS "NO TIER" SO THE SERVICE CAN REFUSE.
  //* THE FAILURE THAT COSTS REAL MONEY IS SILENTLY CHARGING NOTHING.
  it('returns null for a value that falls in a gap', () => {
    expect(findRateTier(tiers, 5)).toBeNull();
  });
});

describe('priceTier — what a band charges', () => {
  const flat: RateTier = {
    minValue: 1,
    maxValue: 3,
    baseFee: 55,
    stepUnit: null,
    stepFee: 0,
  };
  const stepped: RateTier = {
    minValue: 10,
    maxValue: null,
    baseFee: 150,
    stepUnit: 1,
    stepFee: 15,
  };

  it('charges a flat band the same across its whole range', () => {
    expect(priceTier(flat, 1)).toBe(55);
    expect(priceTier(flat, 2.9)).toBe(55);
  });

  it('charges a whole step fee for each started unit above the floor', () => {
    //* HOW COURIERS ACTUALLY ROUND: 10.1 KG COSTS A FULL EXTRA KILO.
    expect(priceTier(stepped, 10)).toBe(150);
    expect(priceTier(stepped, 10.1)).toBe(165);
    expect(priceTier(stepped, 11)).toBe(165);
    expect(priceTier(stepped, 11.001)).toBe(180);
  });
});

describe('metricForBasis — which cart number a zone measures', () => {
  const metrics = { weightKg: 2.5, itemCount: 4, orderValue: 900 };

  it('reads the metric named by the basis', () => {
    expect(metricForBasis(DeliveryRateBasis.WEIGHT, metrics)).toBe(2.5);
    expect(metricForBasis(DeliveryRateBasis.ITEM_COUNT, metrics)).toBe(4);
    expect(metricForBasis(DeliveryRateBasis.ORDER_VALUE, metrics)).toBe(900);
  });

  //* A FLAT ZONE MUST STAY FLAT EVEN IF SOMEONE ADDS A SECOND BAND TO IT —
  //* MEASURING 0 IS WHAT GUARANTEES IT ALWAYS LANDS IN THE BAND STARTING AT 0.
  it('measures nothing for a flat zone', () => {
    expect(metricForBasis(DeliveryRateBasis.FLAT, metrics)).toBe(0);
  });
});

describe('calculateCodFee — cash-handling charge', () => {
  const zone = { codFeePercent: 3, codFeeMin: 15, codFeeMax: 300 };

  it('takes the percentage and clamps it to both bounds', () => {
    expect(calculateCodFee(1000, zone)).toBe(30);
    expect(calculateCodFee(455, zone)).toBe(15); //* 13.65 lifted to the floor
    expect(calculateCodFee(20000, zone)).toBe(300); //* 600 capped
  });

  //* codFeeMin IS A FLOOR ON A FEE THAT EXISTS, NOT AN INSTRUCTION TO INVENT
  //* ONE — A ZONE WITH NO PERCENTAGE CHARGES NOTHING FOR COD.
  it('charges nothing when no percentage is configured', () => {
    expect(
      calculateCodFee(1000, {
        codFeePercent: null,
        codFeeMin: 15,
        codFeeMax: null,
      }),
    ).toBe(0);
  });

  it('works with either bound absent', () => {
    expect(
      calculateCodFee(1000, {
        codFeePercent: 3,
        codFeeMin: null,
        codFeeMax: null,
      }),
    ).toBe(30);
  });
});

describe('calculateEstimatedDelivery — the promise, as real dates', () => {
  //* 2026-08-20 IS A THURSDAY, 08-21 A FRIDAY, 08-22 A SATURDAY, 08-23 A SUNDAY.
  const sevenDayZone = {
    minDeliveryDays: 1,
    maxDeliveryDays: 2,
    cutOffMinutes: 960, //* 16:00 ICT
    businessDaysOnly: false,
  };

  it('dispatches the same day before the cut-off', () => {
    const { from, to } = calculateEstimatedDelivery(
      atIct('2026-08-20T15:00:00'),
      sevenDayZone,
    );
    expect(ict(from)).toBe('2026-08-21 00:00');
    expect(ict(to)).toBe('2026-08-22 00:00');
  });

  //* THE SAME ZONE QUOTES DIFFERENT DATES AT 15:59 AND 16:01 WITH NOTHING
  //* RECONFIGURED — THAT IS THE CUT-OFF DOING ITS JOB, NOT A BUG.
  it('slips a day past the cut-off', () => {
    const { from } = calculateEstimatedDelivery(
      atIct('2026-08-20T17:00:00'),
      sevenDayZone,
    );
    expect(ict(from)).toBe('2026-08-22 00:00');
  });

  it('ignores the hour entirely when no cut-off is configured', () => {
    const noCutOff = { ...sevenDayZone, cutOffMinutes: null };
    expect(
      ict(
        calculateEstimatedDelivery(atIct('2026-08-20T23:30:00'), noCutOff).from,
      ),
    ).toBe('2026-08-21 00:00');
  });

  it('skips Sundays but delivers Saturdays when asked for business days', () => {
    const businessZone = {
      minDeliveryDays: 1,
      maxDeliveryDays: 2,
      cutOffMinutes: null,
      businessDaysOnly: true,
    };
    //* FRIDAY + 1 LANDS ON SATURDAY (THAI COURIERS WORK IT), + 2 SKIPS SUNDAY.
    const { from, to } = calculateEstimatedDelivery(
      atIct('2026-08-21T10:00:00'),
      businessZone,
    );
    expect(ict(from)).toBe('2026-08-22 00:00');
    expect(ict(to)).toBe('2026-08-24 00:00');
  });

  //* THE LOOP NEVER RUNS FOR A ZERO-DAY PROMISE, SO WITHOUT THE SECOND PASS IN
  //* addDeliveryDays A SAME-DAY ORDER PLACED ON A SUNDAY WOULD BE PROMISED FOR
  //* THAT SUNDAY.
  it('moves a same-day promise off a Sunday', () => {
    const sameDay = {
      minDeliveryDays: 0,
      maxDeliveryDays: 0,
      cutOffMinutes: null,
      businessDaysOnly: true,
    };
    expect(
      ict(
        calculateEstimatedDelivery(atIct('2026-08-22T10:00:00'), sameDay).from,
      ),
    ).toBe('2026-08-22 00:00'); //* Saturday stays
    expect(
      ict(
        calculateEstimatedDelivery(atIct('2026-08-23T10:00:00'), sameDay).from,
      ),
    ).toBe('2026-08-24 00:00'); //* Sunday moves to Monday
  });

  it('lands on Bangkok midnight, whatever hour the order was placed', () => {
    const { from } = calculateEstimatedDelivery(
      atIct('2026-08-20T09:17:43'),
      sevenDayZone,
    );
    expect(ict(from).endsWith('00:00')).toBe(true);
  });
});

describe('addDeliveryDays', () => {
  const mondayIct = atIct('2026-08-24T00:00:00').getTime();

  it('counts calendar days when business days are not requested', () => {
    expect(ict(addDeliveryDays(mondayIct, 7, false))).toBe('2026-08-31 00:00');
  });

  it('stretches a week to eight days when Sundays are skipped', () => {
    expect(ict(addDeliveryDays(mondayIct, 7, true))).toBe('2026-09-01 00:00');
  });

  it('returns the start unchanged for zero days on a working day', () => {
    expect(ict(addDeliveryDays(mondayIct, 0, true))).toBe('2026-08-24 00:00');
  });
});
