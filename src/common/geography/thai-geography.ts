import { BadRequestException } from '@nestjs/common';
//* THE '.data' IN THE FILENAME IS LOAD-BEARING: jest RESOLVES BARE
//* './thai-geography' WITH json AHEAD OF ts IN moduleFileExtensions, SO A
//* SIBLING thai-geography.json WOULD SHADOW THIS MODULE AND EVERY IMPORT OF
//* IT WOULD SILENTLY RESOLVE TO THE RAW ARRAY.
import rawGeography from './thai-geography.data.json';

//* ═══════════════════════════════════════════════════════════════════════
//* THAI ADDRESS VALIDATION — THE SERVER-SIDE HALF OF THE CHECKOUT CASCADE.
//*
//* THE CLIENT PICKS province → district → subdistrict FROM A DROPDOWN AND
//* DERIVES THE POSTAL CODE FROM THE SUBDISTRICT, SO A CUSTOMER USING THE UI
//* CANNOT PRODUCE AN INCONSISTENT ADDRESS. A `curl` CAN. WITHOUT THIS CHECK
//* THE API ACCEPTS ANY TEXT IN ALL THREE LEVELS AND ANY FIVE DIGITS AS THE
//* POSTAL CODE — AND postalCode IS THE **MOST SPECIFIC** THING DELIVERY-ZONE
//* MATCHING SCORES ON (1000, THE TOP RUNG OF DeliveryChargeCalculator's
//* LADDER), SO A SURIN ADDRESS CLAIMING "10110" WOULD BE PRICED AS BANGKOK
//* METRO AND SHIPPED UPCOUNTRY AT THE METRO RATE.
//*
//* SAME DATASET THE CLIENT'S PICKER USES (client:
//* src/lib/thailand/thailand-geography.json) — thailand-geography-data/
//* thailand-geography-json, MIT, © Joe Takara, with "Loburi" corrected to
//* "Lop Buri". THE TWO COPIES MUST BE REGENERATED TOGETHER: IF THE PICKER
//* EVER OFFERS SOMETHING THIS FILE DOES NOT KNOW, CHECKOUT 400s.
//* ═══════════════════════════════════════════════════════════════════════

//* THE SHIPPED SHAPE IS POSITIONAL — SEE THE CLIENT MODULE'S NOTE.
type RawSubdistrict = [en: string, th: string, postalCode: string];
type RawDistrict = [en: string, th: string, subdistricts: RawSubdistrict[]];
type RawProvince = [en: string, th: string, districts: RawDistrict[]];

/** The only country this storefront ships to — see `assertServedCountry`. */
export const SERVED_COUNTRY = 'Thailand';

const norm = (value: string): string => value.trim().toLowerCase();

//* province -> district -> subdistrict -> SET OF VALID POSTAL CODES.
//* BUILT ONCE, LAZILY: A PROCESS THAT NEVER TOUCHES AN ADDRESS NEVER PAYS
//* FOR IT, AND THE ONE THAT DOES PAYS ~7,400 Map INSERTS EXACTLY ONCE.
let index: Map<string, Map<string, Map<string, Set<string>>>> | null = null;

function getIndex(): Map<string, Map<string, Map<string, Set<string>>>> {
  if (index) return index;

  const built = new Map<string, Map<string, Map<string, Set<string>>>>();
  for (const [provinceEn, , districts] of rawGeography as RawProvince[]) {
    const districtMap = new Map<string, Map<string, Set<string>>>();
    for (const [districtEn, , subdistricts] of districts) {
      const subdistrictMap = new Map<string, Set<string>>();
      for (const [subdistrictEn, , postalCode] of subdistricts) {
        const key = norm(subdistrictEn);
        //* A HANDFUL OF SUBDISTRICTS SPAN TWO POSTAL CODES, AND THE MERGED
        //* "Bang Sai"-STYLE DISTRICTS CARRY THE UNION OF BOTH DISTRICTS' —
        //* SO THE VALUE IS A SET, NOT A SINGLE CODE.
        const codes = subdistrictMap.get(key) ?? new Set<string>();
        codes.add(postalCode);
        subdistrictMap.set(key, codes);
      }
      districtMap.set(norm(districtEn), subdistrictMap);
    }
    built.set(norm(provinceEn), districtMap);
  }

  index = built;
  return index;
}

export interface ThaiAddressParts {
  province: string;
  district: string;
  subdistrict: string;
  postalCode: string;
}

/**
 * Rejects an address that Thailand does not actually contain.
 *
 * Checks the hierarchy top-down and names the first level that breaks, so the
 * caller learns *which* field is wrong rather than "invalid address" — the
 * levels are meaningless out of order (a district only exists inside its
 * province), and reporting the deepest failure would blame the subdistrict for
 * a misspelt province.
 *
 * Matching is case- and whitespace-insensitive, mirroring how the delivery
 * calculator compares the very same strings.
 */
export function assertThaiAddress(parts: ThaiAddressParts): void {
  const districts = getIndex().get(norm(parts.province));
  if (!districts) {
    throw new BadRequestException(
      `"${parts.province}" is not a province of Thailand`,
    );
  }

  const subdistricts = districts.get(norm(parts.district));
  if (!subdistricts) {
    throw new BadRequestException(
      `"${parts.district}" is not a district of ${parts.province}`,
    );
  }

  const postalCodes = subdistricts.get(norm(parts.subdistrict));
  if (!postalCodes) {
    throw new BadRequestException(
      `"${parts.subdistrict}" is not a sub-district of ${parts.district}, ${parts.province}`,
    );
  }

  if (!postalCodes.has(parts.postalCode.trim())) {
    const expected = [...postalCodes].join(' or ');
    throw new BadRequestException(
      `Postal code ${parts.postalCode} does not belong to ${parts.subdistrict}, ${parts.district} — expected ${expected}`,
    );
  }
}

/**
 * Rejects a destination this storefront does not ship to.
 *
 * Thailand-only today, and deliberately a hard list rather than a lookup
 * against `delivery_charge_areas`: an unseeded rate card would otherwise make
 * *every* country unservable and block address saving entirely. Widen this
 * constant when a second country is genuinely supported end to end.
 */
export function assertServedCountry(country: string | undefined): void {
  if (country === undefined) return;
  if (norm(country) !== norm(SERVED_COUNTRY)) {
    throw new BadRequestException(
      `We currently deliver within ${SERVED_COUNTRY} only — "${country}" is not a supported country`,
    );
  }
}
