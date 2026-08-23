/**
 * Seeds a working Thailand delivery rate card.
 *
 * Idempotent and keyed on `DeliveryChargeZone.code`, so it is safe to re-run:
 * an existing zone has its areas and rates replaced wholesale (the same
 * declarative semantics the admin update endpoint uses), and a new one is
 * created. It never touches a zone whose code is not listed here, so a card an
 * admin has since customised by adding their own zones survives a re-run.
 *
 * ─── Where these numbers come from ──────────────────────────────────────────
 *
 * They are the shape of the Thai domestic parcel market as of 2026, not any
 * one courier's published tariff — the point of seeding is to give the
 * merchant a card that is *right in structure* and roughly right in price, so
 * the first thing they do is adjust four numbers rather than design a pricing
 * model.
 *
 *   Zones      Thai couriers price on a Bangkok-metro / upcountry split, with
 *              the deep-south provinces and the islands carrying a surcharge
 *              on top. BKK metro is Bangkok plus the three provinces that are
 *              functionally part of it — Nonthaburi, Pathum Thani, Samut
 *              Prakan — which is why they are listed individually rather than
 *              caught by the 10xxx postal prefix (they are 11xxx/12xxx).
 *
 *   Bands      0–1 / 1–3 / 3–5 / 5–10 kg with a per-kg step above 10 kg is the
 *              near-universal domestic banding. The step is what stops a bulk
 *              order pricing off the top band's flat fee.
 *
 *   Lead time  1–2 days BKK metro, 2–3 central, 2–4 upcountry, 3–5 remote,
 *              with a 16:00 same-day dispatch cut-off. Upcountry and remote
 *              skip Sundays; Bangkok does not, because metro couriers run
 *              seven days.
 *
 *   COD        3% of the collected amount, floor ฿15, ceiling ฿300, and
 *              refused outright for the remote zone — collecting cash on an
 *              island is where COD losses actually happen.
 *
 *   Free       ฿1,000 site-wide. High enough to lift basket size, low enough
 *              to be reachable on supplements. Deliberately *not* scoped to a
 *              zone, so the storefront banner can advertise it honestly.
 *
 * Every one of these is a row an admin can change from the Set Up screen. None
 * of it is in code.
 *
 * Run with:  npm run db:seed-delivery-charge
 */
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  DeliveryRateBasis,
  FreeDeliveryTrigger,
} from '../src/generated/prisma/enums';
const { Pool } = pkg;

interface SeedArea {
  state?: string;
  region?: string;
  postalCode?: string;
  postalPrefix?: string;
}

interface SeedRate {
  label: string;
  minValue: number;
  maxValue?: number;
  baseFee: number;
  stepUnit?: number;
  stepFee?: number;
}

interface SeedZone {
  code: string;
  name: string;
  nameTh: string;
  description: string;
  isDefault: boolean;
  priority: number;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  cutOffMinutes: number;
  businessDaysOnly: boolean;
  handlingFee: number;
  remoteSurcharge: number;
  maxWeightKg: number;
  codAvailable: boolean;
  codFeePercent?: number;
  codFeeMin?: number;
  codFeeMax?: number;
  areas: SeedArea[];
  rates: SeedRate[];
}

//* THE STANDARD DOMESTIC BANDING, SHARED BY EVERY ZONE. ONLY THE FEES DIFFER
//* PER ZONE, SO THE BANDS THEMSELVES ARE WRITTEN ONCE AND PRICED PER ZONE —
//* KEEPING THE *BOUNDARIES* IDENTICAL ACROSS ZONES IS WHAT MAKES A CUSTOMER
//* MOVING BETWEEN ZONES SEE A DIFFERENT PRICE FOR THE SAME REASON EVERY TIME.
const weightBands = (
  fees: [number, number, number, number],
  topFee: number,
  perKg: number,
): SeedRate[] => [
  { label: '0-1 kg', minValue: 0, maxValue: 1, baseFee: fees[0] },
  { label: '1-3 kg', minValue: 1, maxValue: 3, baseFee: fees[1] },
  { label: '3-5 kg', minValue: 3, maxValue: 5, baseFee: fees[2] },
  { label: '5-10 kg', minValue: 5, maxValue: 10, baseFee: fees[3] },
  {
    label: '10 kg+',
    minValue: 10,
    baseFee: topFee,
    stepUnit: 1,
    stepFee: perKg,
  },
];

const ZONES: SeedZone[] = [
  {
    code: 'BKK_METRO',
    name: 'Bangkok Metropolitan',
    nameTh: 'กรุงเทพและปริมณฑล',
    description:
      'Bangkok and the three provinces that function as part of it. Fastest lane, cheapest bands, delivers seven days a week.',
    isDefault: false,
    priority: 10,
    minDeliveryDays: 1,
    maxDeliveryDays: 2,
    cutOffMinutes: 960, //* 16:00 ICT
    businessDaysOnly: false,
    handlingFee: 0,
    remoteSurcharge: 0,
    maxWeightKg: 30,
    codAvailable: true,
    codFeePercent: 3,
    codFeeMin: 15,
    codFeeMax: 300,
    areas: [
      //* BANGKOK ITSELF IS EVERY 10xxx POSTAL CODE — ONE PREFIX RULE INSTEAD OF
      //* FIFTY DISTRICT ROWS. THE THREE METRO PROVINCES ARE 11xxx/12xxx AND SO
      //* HAVE TO BE NAMED, WHICH IS ALSO CLEARER TO AN ADMIN READING THE TABLE.
      { postalPrefix: '10' },
      { state: 'Nonthaburi' },
      { state: 'Pathum Thani' },
      { state: 'Samut Prakan' },
    ],
    rates: weightBands([40, 55, 75, 110], 150, 15),
  },
  {
    code: 'CENTRAL',
    name: 'Central Thailand',
    nameTh: 'ภาคกลาง',
    description:
      'Provinces within a day of the Bangkok hub. One day slower than metro, marginally dearer.',
    isDefault: false,
    priority: 20,
    minDeliveryDays: 2,
    maxDeliveryDays: 3,
    cutOffMinutes: 960,
    businessDaysOnly: false,
    handlingFee: 0,
    remoteSurcharge: 0,
    maxWeightKg: 30,
    codAvailable: true,
    codFeePercent: 3,
    codFeeMin: 15,
    codFeeMax: 300,
    areas: [
      { state: 'Ayutthaya' },
      { state: 'Nakhon Pathom' },
      { state: 'Samut Sakhon' },
      { state: 'Samut Songkhram' },
      { state: 'Saraburi' },
      { state: 'Ang Thong' },
      { state: 'Sing Buri' },
      { state: 'Lopburi' },
      { state: 'Chachoengsao' },
      { state: 'Nakhon Nayok' },
      { state: 'Suphan Buri' },
      { state: 'Ratchaburi' },
      { state: 'Kanchanaburi' },
      { state: 'Chonburi' },
      { state: 'Rayong' },
    ],
    rates: weightBands([50, 70, 95, 140], 190, 20),
  },
  {
    code: 'UPCOUNTRY',
    name: 'Upcountry',
    nameTh: 'ต่างจังหวัด',
    description:
      'The rest of the country. The catch-all: any address no other zone claims is priced here, which is what keeps checkout working for a province nobody has listed yet.',
    //* THE FALLBACK. WITHOUT ONE, AN ADDRESS IN AN UNLISTED PROVINCE IS
    //* REFUSED AT CHECKOUT — WHICH IS THE CORRECT *DEFAULT* BEHAVIOUR BUT A
    //* BAD ONE TO SHIP, SINCE THE SEED CANNOT NAME ALL 77 PROVINCES.
    isDefault: true,
    priority: 30,
    minDeliveryDays: 2,
    maxDeliveryDays: 4,
    cutOffMinutes: 960,
    businessDaysOnly: true,
    handlingFee: 0,
    remoteSurcharge: 0,
    maxWeightKg: 30,
    codAvailable: true,
    codFeePercent: 3,
    codFeeMin: 15,
    codFeeMax: 300,
    //* NO AREA RULES ON PURPOSE. A COUNTRY-WIDE WILDCARD ROW WOULD SCORE 100
    //* AGAINST *EVERY* ADDRESS AND WOULD BE INDISTINGUISHABLE FROM THE
    //* FALLBACK IT ALREADY IS — WORSE, IT WOULD OUT-RANK NOTHING AND CONFUSE
    //* THE TABLE. THE isDefault FLAG IS THE WHOLE MECHANISM HERE.
    areas: [],
    rates: weightBands([60, 85, 115, 165], 220, 25),
  },
  {
    code: 'REMOTE',
    name: 'Remote & Islands',
    nameTh: 'พื้นที่ห่างไกลและเกาะ',
    description:
      'Deep-south provinces and the islands. Carries a surcharge, takes longer, and does not accept Cash on Delivery.',
    isDefault: false,
    //* HIGHEST SPECIFICITY WINS REGARDLESS OF priority, SO THE ISLAND POSTAL
    //* CODES BELOW BEAT THEIR OWN PROVINCE'S RULE IN CENTRAL/UPCOUNTRY WITHOUT
    //* NEEDING AN "EXCLUDE" MECHANISM ANYWHERE. SEE scoreArea.
    priority: 5,
    minDeliveryDays: 3,
    maxDeliveryDays: 5,
    cutOffMinutes: 960,
    businessDaysOnly: true,
    handlingFee: 0,
    remoteSurcharge: 50,
    maxWeightKg: 20,
    //* COD OFF. AN UNCOLLECTED CASH PARCEL ON AN ISLAND COSTS THE RETURN LEG
    //* PLUS THE OUTBOUND ONE, AND THIS IS WHERE THAT ACTUALLY HAPPENS.
    codAvailable: false,
    areas: [
      { state: 'Yala' },
      { state: 'Pattani' },
      { state: 'Narathiwat' },
      { state: 'Mae Hong Son' },
      //* KOH SAMUI / KOH PHA NGAN — INSIDE SURAT THANI, WHICH IS OTHERWISE
      //* UPCOUNTRY. THE EXACT POSTAL CODE OUT-SCORES THE PROVINCE RULE.
      { postalCode: '84140' },
      { postalCode: '84280' },
      { postalCode: '84320' },
      //* KOH TAO
      { postalCode: '84360' },
      //* KOH CHANG, TRAT
      { postalCode: '23170' },
      //* KOH LANTA, KRABI
      { postalCode: '81150' },
    ],
    rates: weightBands([90, 120, 160, 220], 300, 35),
  },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  const prisma = new PrismaClient({ adapter });

  try {
    for (const zone of ZONES) {
      const { areas, rates, ...scalars } = zone;

      await prisma.$transaction(async (tx) => {
        //* THE PARTIAL UNIQUE INDEX ALLOWS ONE ACTIVE DEFAULT. STAND DOWN
        //* WHATEVER HOLDS IT BEFORE CLAIMING IT, EXACTLY AS THE ADMIN ENDPOINT
        //* DOES — OTHERWISE A RE-RUN AGAINST A CUSTOMISED CARD WOULD BLOW UP ON
        //* A CONSTRAINT INSTEAD OF DOING WHAT IT MEANS.
        if (scalars.isDefault) {
          await tx.deliveryChargeZone.updateMany({
            where: { isDefault: true, code: { not: scalars.code } },
            data: { isDefault: false },
          });
        }

        const saved = await tx.deliveryChargeZone.upsert({
          where: { code: scalars.code },
          create: { ...scalars, rateBasis: DeliveryRateBasis.WEIGHT },
          update: { ...scalars, rateBasis: DeliveryRateBasis.WEIGHT },
          select: { id: true },
        });

        //* DELETE-THEN-INSERT, NOT UPSERT-PER-ROW. THE RATE BANDS CARRY A GiST
        //* EXCLUSION CONSTRAINT AGAINST OVERLAP, SO A NEW CARD HAS TO BE
        //* INSERTED INTO AN EMPTY SET OR IT COLLIDES WITH THE ONE IT REPLACES.
        //* BOTH STATEMENTS ARE IN THIS TRANSACTION, SO THE ZONE IS NEVER
        //* VISIBLE WITHOUT A CARD.
        await tx.deliveryChargeArea.deleteMany({ where: { zoneId: saved.id } });
        if (areas.length) {
          await tx.deliveryChargeArea.createMany({
            data: areas.map((area) => ({ ...area, zoneId: saved.id })),
          });
        }

        await tx.deliveryChargeRate.deleteMany({ where: { zoneId: saved.id } });
        await tx.deliveryChargeRate.createMany({
          data: rates.map((rate) => ({ ...rate, zoneId: saved.id })),
        });
      });

      console.log(
        `Seeded delivery zone: ${zone.code} (${areas.length} area rules, ${rates.length} rate bands)`,
      );
    }

    //* THE SITE-WIDE FREE-DELIVERY PROMISE. zoneId NULL IS WHAT MAKES IT
    //* ADVERTISABLE ON THE STOREFRONT — SEE findLowestPublicThreshold.
    const FREE_DELIVERY_NAME = 'Free delivery over ฿1,000';
    const existingRule = await prisma.deliveryFreeDeliveryRule.findFirst({
      where: { name: FREE_DELIVERY_NAME },
      select: { id: true },
    });
    if (!existingRule) {
      await prisma.deliveryFreeDeliveryRule.create({
        data: {
          name: FREE_DELIVERY_NAME,
          description:
            'Measured on the goods total after item discounts and any coupon — the number the customer actually pays for products.',
          trigger: FreeDeliveryTrigger.MIN_ORDER_AMOUNT,
          minOrderAmount: 1000,
          //* THE COD FEE IS NOT WAIVED. IT IS THE COURIER'S CASH-HANDLING
          //* CHARGE, NOT DELIVERY, AND ABSORBING IT ON EVERY LARGE COD ORDER IS
          //* A MARGIN DECISION NOBODY MADE.
          waivesCodFee: false,
          priority: 100,
          isActive: true,
        },
      });
      console.log(`Seeded free-delivery rule: ${FREE_DELIVERY_NAME}`);
    } else {
      //* LEFT ALONE ON A RE-RUN. THE THRESHOLD IS THE SINGLE MOST LIKELY THING
      //* A MERCHANT HAS ALREADY TUNED, AND RESETTING IT TO ฿1,000 BEHIND THEIR
      //* BACK WOULD BE A REAL LOSS OF MONEY.
      console.log(
        `Free-delivery rule already exists, left unchanged: ${FREE_DELIVERY_NAME}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Delivery-charge seed failed:', error);
  process.exit(1);
});
