-- ============================================================================
-- Thai address taxonomy: state/region -> province/district/subdistrict.
--
-- The address columns were modelled on a Western "state + region" pair, which
-- Thailand does not have. A Thai delivery address is routed on three named
-- administrative levels, and a courier needs all three:
--
--   province    changwat  (จังหวัด)          e.g. Bangkok, Chiang Mai
--   district    amphoe    (เขต in Bangkok)   e.g. Watthana, Bang Rak
--   subdistrict tambon    (แขวง in Bangkok)  e.g. Khlong Toei Nuea
--
-- state was already being used as the province and region as the district, so
-- those two are pure renames — no data is reinterpreted. subdistrict is the
-- level that was missing entirely, which is why it is the only new column.
-- address_line keeps its meaning and widens it slightly: it now carries every
-- detail *below* subdistrict level — house/unit number, moo, soi, street,
-- building, and the area/landmark line the checkout form collects.
--
-- Renames rather than add/backfill/drop: ALTER ... RENAME COLUMN is atomic and
-- carries the existing indexes, constraints and NOT NULLs with it, so no row
-- is rewritten and no window exists where the old and new columns disagree.
--
-- Pre-existing rows have no subdistrict to recover — there was never a column
-- to hold one. They are backfilled with '' and the DEFAULT is dropped
-- immediately afterwards, so the empty string can only ever mean "saved before
-- this migration"; every write from here on must supply a real value (the DTOs
-- require 2+ characters).
--
-- Four tables carry these columns and all four move together — delivery charge
-- zone matching (delivery_charge_areas) compares a checkout address
-- field-for-field with no translation layer, so a partial rename would silently
-- stop matching:
--
--   addresses               The customer's saved address book.
--   order_addresses         The frozen per-order snapshot.
--   delivery_charge_areas   Which addresses fall into a priced zone.
--   delivery_zones          Courier coverage (third-party directory).
-- ============================================================================

-- ─── addresses ──────────────────────────────────────────────────────────────

ALTER TABLE "addresses" RENAME COLUMN "state" TO "province";
ALTER TABLE "addresses" RENAME COLUMN "region" TO "district";

ALTER TABLE "addresses" ADD COLUMN "subdistrict" VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE "addresses" ALTER COLUMN "subdistrict" DROP DEFAULT;

-- ─── order_addresses ────────────────────────────────────────────────────────

ALTER TABLE "order_addresses" RENAME COLUMN "state" TO "province";
ALTER TABLE "order_addresses" RENAME COLUMN "region" TO "district";

ALTER TABLE "order_addresses" ADD COLUMN "subdistrict" VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE "order_addresses" ALTER COLUMN "subdistrict" DROP DEFAULT;

-- ─── delivery_charge_areas ──────────────────────────────────────────────────
-- Nullable here, unlike the two tables above: on an area row a NULL level is a
-- wildcard ("any subdistrict"), not missing data.

ALTER TABLE "delivery_charge_areas" RENAME COLUMN "state" TO "province";
ALTER TABLE "delivery_charge_areas" RENAME COLUMN "region" TO "district";

ALTER TABLE "delivery_charge_areas" ADD COLUMN "subdistrict" VARCHAR(100);

-- Postgres carries index *definitions* through a column rename but keeps their
-- old names, and the two unique indexes additionally have to grow the new
-- column, so both are rebuilt rather than renamed.
DROP INDEX "delivery_charge_areas_zone_id_country_state_region_postal_c_key";
DROP INDEX "delivery_charge_areas_rule_unique";

CREATE UNIQUE INDEX "delivery_charge_areas_zone_id_country_province_district_sub_key"
  ON "delivery_charge_areas" ("zone_id", "country", "province", "district", "subdistrict", "postal_code", "postal_prefix");

-- Same reason as in 20260823100000: Prisma's @@unique cannot dedupe wildcard
-- rows, because two NULLs never compare equal in Postgres. COALESCE to a
-- sentinel no real value can take and ("Thailand", NULL, NULL, NULL, NULL,
-- NULL) can only exist once per zone.
CREATE UNIQUE INDEX "delivery_charge_areas_rule_unique"
  ON "delivery_charge_areas" (
    "zone_id",
    lower("country"),
    lower(COALESCE("province", '*')),
    lower(COALESCE("district", '*')),
    lower(COALESCE("subdistrict", '*')),
    COALESCE("postal_code", '*'),
    COALESCE("postal_prefix", '*')
  );

ALTER INDEX "delivery_charge_areas_country_state_region_idx"
  RENAME TO "delivery_charge_areas_country_province_district_idx";

-- The hierarchy has to hold in both directions or the specificity ladder in
-- DeliveryChargeCalculator.scoreArea has no defined answer: a district only
-- means something inside a named province, and a subdistrict only inside a
-- named district.
ALTER TABLE "delivery_charge_areas"
  RENAME CONSTRAINT "delivery_charge_areas_region_needs_state_check"
  TO "delivery_charge_areas_district_needs_province_check";

ALTER TABLE "delivery_charge_areas"
  ADD CONSTRAINT "delivery_charge_areas_subdistrict_needs_district_check"
  CHECK ("subdistrict" IS NULL OR "district" IS NOT NULL);

-- ─── delivery_zones (courier coverage) ──────────────────────────────────────

ALTER TABLE "delivery_zones" RENAME COLUMN "state" TO "province";
ALTER TABLE "delivery_zones" RENAME COLUMN "region" TO "district";

ALTER INDEX "delivery_zones_state_region_idx"
  RENAME TO "delivery_zones_province_district_idx";
