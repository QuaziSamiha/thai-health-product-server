-- ============================================================================
-- Delivery charge: the merchant's own shipping rate card, and the rules that
-- waive it.
--
-- Until now the delivery fee was a TypeScript constant (FLAT_DELIVERY_CHARGE =
-- 50 in OrderService) applied to every order regardless of destination, weight
-- or basket size. That is not a pricing model, it is a placeholder — it cannot
-- express "free over 1,000 THB", cannot charge more to reach an island, and
-- cannot be changed without a deploy.
--
-- Four tables replace it:
--
--   delivery_charge_zones   A priced destination tier (Bangkok Metro, Central,
--                           Upcountry, Remote). Owns the delivery promise in
--                           days, the fixed add-ons, the COD fee policy, and
--                           which cart metric its tiers are measured on.
--   delivery_charge_areas   Which addresses fall into a zone. NULL is a
--                           wildcard, so one row can mean "the whole country"
--                           and another "postal code 10110" — the more
--                           specific rule wins.
--   delivery_charge_rates   The non-overlapping bands along a zone's axis,
--                           half-open [min_value, max_value).
--   delivery_free_delivery_rules
--                           The waiver layer. Never changes what delivery
--                           costs, only how much of it the merchant absorbs.
--
-- Deliberately separate from the delivery_providers/delivery_zones tables
-- added in 20260813094513: those describe what a *courier* charges us and
-- where a parcel is. Merging the two would let a courier renegotiation
-- silently reprice the storefront.
--
-- Nothing in here is enforced only in application code where the database can
-- enforce it instead. Three classes of integrity get real constraints:
--
--   * A rate card whose bands overlap has no defined answer for "which tier".
--     A GiST exclusion constraint over numrange rejects the overlap at write
--     time rather than letting the calculator pick whichever row sorted first.
--   * A free-delivery rule missing its own trigger's input can never fire.
--     CHECK constraints make that unrepresentable, including from a seed
--     script or a psql session that never sees the DTO.
--   * Two catch-all zones, or two identical area rules, would make zone
--     resolution order-dependent. Partial and COALESCE-based unique indexes
--     close both, which plain column-list uniques cannot: Postgres treats
--     NULLs as distinct, so ('Thailand', NULL, NULL, NULL, NULL) would
--     otherwise be insertable twice.
--
-- Finally, orders gains a delivery snapshot. Order rows already freeze every
-- other number they carry; the delivery fee was the one that could not explain
-- itself afterwards.
-- ============================================================================

-- btree_gist lets a GiST index mix the equality column (zone_id) with the
-- range column in one exclusion constraint. pg_trgm was already added the same
-- way in 20260817130000, so extension creation is an established step here.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE "DeliveryChargeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TYPE "DeliveryRateBasis" AS ENUM ('FLAT', 'WEIGHT', 'ORDER_VALUE', 'ITEM_COUNT');

CREATE TYPE "FreeDeliveryTrigger" AS ENUM ('MIN_ORDER_AMOUNT', 'PROMO_CODE', 'FIRST_ORDER', 'CAMPAIGN');

-- ─── delivery_charge_zones ──────────────────────────────────────────────────

CREATE TABLE "delivery_charge_zones" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "name_th" VARCHAR(150),
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "min_delivery_days" INTEGER NOT NULL,
    "max_delivery_days" INTEGER NOT NULL,
    "cut_off_minutes" INTEGER,
    "business_days_only" BOOLEAN NOT NULL DEFAULT false,
    "handling_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remote_surcharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "max_weight_kg" DECIMAL(10,3),
    "cod_available" BOOLEAN NOT NULL DEFAULT true,
    "cod_fee_percent" DECIMAL(5,2),
    "cod_fee_min" DECIMAL(12,2),
    "cod_fee_max" DECIMAL(12,2),
    "rate_basis" "DeliveryRateBasis" NOT NULL DEFAULT 'FLAT',
    "status" "DeliveryChargeStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "delivery_charge_zones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_charge_zones_sid_key" ON "delivery_charge_zones" ("sid");
CREATE UNIQUE INDEX "delivery_charge_zones_code_key" ON "delivery_charge_zones" ("code");
CREATE INDEX "delivery_charge_zones_status_priority_idx" ON "delivery_charge_zones" ("status", "priority");

-- The catch-all is a singleton *among active zones*. Scoping the partial index
-- to ACTIVE is what lets an admin stand up a replacement default, flip the old
-- one INACTIVE, and activate the new one — with an unscoped unique that swap
-- would be impossible without a window where the storefront has no fallback.
CREATE UNIQUE INDEX "delivery_charge_zones_one_active_default"
  ON "delivery_charge_zones" ("is_default")
  WHERE "is_default" = true AND "status" = 'ACTIVE';

ALTER TABLE "delivery_charge_zones"
  ADD CONSTRAINT "delivery_charge_zones_day_range_check"
  CHECK ("min_delivery_days" >= 0 AND "max_delivery_days" >= "min_delivery_days");

-- 0..1439 = minutes past midnight. Anything else is a unit mix-up (someone
-- storing 16 for "4pm", or seconds), which would silently shift every
-- estimated delivery date rather than fail.
ALTER TABLE "delivery_charge_zones"
  ADD CONSTRAINT "delivery_charge_zones_cut_off_check"
  CHECK ("cut_off_minutes" IS NULL OR ("cut_off_minutes" >= 0 AND "cut_off_minutes" < 1440));

ALTER TABLE "delivery_charge_zones"
  ADD CONSTRAINT "delivery_charge_zones_fees_non_negative_check"
  CHECK (
    "handling_fee" >= 0
    AND "remote_surcharge" >= 0
    AND ("max_weight_kg" IS NULL OR "max_weight_kg" > 0)
    AND ("cod_fee_percent" IS NULL OR ("cod_fee_percent" >= 0 AND "cod_fee_percent" <= 100))
    AND ("cod_fee_min" IS NULL OR "cod_fee_min" >= 0)
    AND ("cod_fee_max" IS NULL OR "cod_fee_max" >= 0)
    AND ("cod_fee_min" IS NULL OR "cod_fee_max" IS NULL OR "cod_fee_max" >= "cod_fee_min")
  );

ALTER TABLE "delivery_charge_zones"
  ADD CONSTRAINT "delivery_charge_zones_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "delivery_charge_zones"
  ADD CONSTRAINT "delivery_charge_zones_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── delivery_charge_areas ──────────────────────────────────────────────────

CREATE TABLE "delivery_charge_areas" (
    "id" SERIAL NOT NULL,
    "country" VARCHAR(100) NOT NULL DEFAULT 'Thailand',
    "state" VARCHAR(100),
    "region" VARCHAR(100),
    "postal_code" VARCHAR(20),
    "postal_prefix" VARCHAR(10),
    "zone_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_charge_areas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_charge_areas_zone_id_idx" ON "delivery_charge_areas" ("zone_id");
CREATE INDEX "delivery_charge_areas_country_state_region_idx" ON "delivery_charge_areas" ("country", "state", "region");
CREATE INDEX "delivery_charge_areas_postal_code_idx" ON "delivery_charge_areas" ("postal_code");

-- Prisma's @@unique on the same columns is generated below for parity with the
-- schema, but it cannot enforce this: in Postgres two rows of
-- (1, 'Thailand', NULL, NULL, NULL, NULL) are *not* duplicates, because NULLs
-- never compare equal. COALESCE to a sentinel that no real value can take and
-- the wildcards deduplicate properly.
CREATE UNIQUE INDEX "delivery_charge_areas_zone_id_country_state_region_postal_c_key"
  ON "delivery_charge_areas" ("zone_id", "country", "state", "region", "postal_code", "postal_prefix");

CREATE UNIQUE INDEX "delivery_charge_areas_rule_unique"
  ON "delivery_charge_areas" (
    "zone_id",
    lower("country"),
    lower(COALESCE("state", '*')),
    lower(COALESCE("region", '*')),
    COALESCE("postal_code", '*'),
    COALESCE("postal_prefix", '*')
  );

-- A rule that names a district without naming its province matches every
-- "Watthana" in Thailand. There is exactly one, but the next such pair will not
-- be so lucky — require the parent whenever the child is given.
ALTER TABLE "delivery_charge_areas"
  ADD CONSTRAINT "delivery_charge_areas_region_needs_state_check"
  CHECK ("region" IS NULL OR "state" IS NOT NULL);

-- postal_code (exact) and postal_prefix (leading digits) are two spellings of
-- the same axis. Setting both means the row claims a precision it does not
-- have, and the specificity ladder would have to invent a tie-break.
ALTER TABLE "delivery_charge_areas"
  ADD CONSTRAINT "delivery_charge_areas_postal_exclusive_check"
  CHECK ("postal_code" IS NULL OR "postal_prefix" IS NULL);

ALTER TABLE "delivery_charge_areas"
  ADD CONSTRAINT "delivery_charge_areas_zone_id_fkey"
  FOREIGN KEY ("zone_id") REFERENCES "delivery_charge_zones" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── delivery_charge_rates ──────────────────────────────────────────────────

CREATE TABLE "delivery_charge_rates" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "label" VARCHAR(100),
    "min_value" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "max_value" DECIMAL(12,3),
    "base_fee" DECIMAL(12,2) NOT NULL,
    "step_unit" DECIMAL(12,3),
    "step_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "DeliveryChargeStatus" NOT NULL DEFAULT 'ACTIVE',
    "zone_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "delivery_charge_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_charge_rates_sid_key" ON "delivery_charge_rates" ("sid");
CREATE INDEX "delivery_charge_rates_zone_id_status_min_value_idx" ON "delivery_charge_rates" ("zone_id", "status", "min_value");

ALTER TABLE "delivery_charge_rates"
  ADD CONSTRAINT "delivery_charge_rates_band_check"
  CHECK (
    "min_value" >= 0
    AND ("max_value" IS NULL OR "max_value" > "min_value")
    AND "base_fee" >= 0
    AND "step_fee" >= 0
    AND ("step_unit" IS NULL OR "step_unit" > 0)
    -- A step fee with no step unit has nothing to multiply, and a step unit
    -- with no fee charges nothing: either alone is a half-finished edit.
    AND (("step_unit" IS NULL AND "step_fee" = 0) OR ("step_unit" IS NOT NULL AND "step_fee" > 0))
  );

-- The band-overlap guard. Two ACTIVE tiers under one zone whose
-- [min_value, max_value) ranges intersect have no defined winner, and the bug
-- that produces is invisible: the customer is simply charged whatever row the
-- planner returned first, which can change between deploys. numrange('[)') is
-- exactly the half-open semantics the calculator implements, and an unbounded
-- max_value becomes an unbounded range rather than a NULL that skips the check.
-- INACTIVE rows are excluded so a replacement band can be staged next to the
-- one it will supersede.
ALTER TABLE "delivery_charge_rates"
  ADD CONSTRAINT "delivery_charge_rates_no_overlapping_bands"
  EXCLUDE USING gist (
    "zone_id" WITH =,
    numrange("min_value", "max_value", '[)') WITH &&
  ) WHERE ("status" = 'ACTIVE');

ALTER TABLE "delivery_charge_rates"
  ADD CONSTRAINT "delivery_charge_rates_zone_id_fkey"
  FOREIGN KEY ("zone_id") REFERENCES "delivery_charge_zones" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── delivery_free_delivery_rules ───────────────────────────────────────────

CREATE TABLE "delivery_free_delivery_rules" (
    "id" SERIAL NOT NULL,
    "sid" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "trigger" "FreeDeliveryTrigger" NOT NULL,
    "min_order_amount" DECIMAL(12,2),
    "promo_code_id" INTEGER,
    "zone_id" INTEGER,
    "max_subsidy_amount" DECIMAL(12,2),
    "waives_cod_fee" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "usage_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "delivery_free_delivery_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_free_delivery_rules_sid_key" ON "delivery_free_delivery_rules" ("sid");
CREATE INDEX "delivery_free_delivery_rules_is_active_priority_idx" ON "delivery_free_delivery_rules" ("is_active", "priority");
CREATE INDEX "delivery_free_delivery_rules_is_active_starts_at_ends_at_idx" ON "delivery_free_delivery_rules" ("is_active", "starts_at", "ends_at");
CREATE INDEX "delivery_free_delivery_rules_zone_id_idx" ON "delivery_free_delivery_rules" ("zone_id");
CREATE INDEX "delivery_free_delivery_rules_promo_code_id_idx" ON "delivery_free_delivery_rules" ("promo_code_id");

-- Each trigger requires its own input and only its own. Without this a
-- MIN_ORDER_AMOUNT rule with a NULL threshold would be created happily and
-- then quietly never fire — the worst kind of promotion bug, because the
-- symptom (nobody got free delivery) looks like customer behaviour.
ALTER TABLE "delivery_free_delivery_rules"
  ADD CONSTRAINT "delivery_free_delivery_rules_trigger_inputs_check"
  CHECK (
    CASE "trigger"
      WHEN 'MIN_ORDER_AMOUNT' THEN "min_order_amount" IS NOT NULL AND "promo_code_id" IS NULL
      WHEN 'PROMO_CODE'       THEN "promo_code_id" IS NOT NULL AND "min_order_amount" IS NULL
      -- FIRST_ORDER and CAMPAIGN take no extra input; carrying one would
      -- suggest a condition that is not actually evaluated.
      ELSE "min_order_amount" IS NULL AND "promo_code_id" IS NULL
    END
  );

ALTER TABLE "delivery_free_delivery_rules"
  ADD CONSTRAINT "delivery_free_delivery_rules_window_check"
  CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at");

ALTER TABLE "delivery_free_delivery_rules"
  ADD CONSTRAINT "delivery_free_delivery_rules_amounts_check"
  CHECK (
    ("min_order_amount" IS NULL OR "min_order_amount" >= 0)
    AND ("max_subsidy_amount" IS NULL OR "max_subsidy_amount" > 0)
    AND ("usage_limit" IS NULL OR "usage_limit" > 0)
    AND "used_count" >= 0
  );

ALTER TABLE "delivery_free_delivery_rules"
  ADD CONSTRAINT "delivery_free_delivery_rules_promo_code_id_fkey"
  FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_free_delivery_rules"
  ADD CONSTRAINT "delivery_free_delivery_rules_zone_id_fkey"
  FOREIGN KEY ("zone_id") REFERENCES "delivery_charge_zones" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_free_delivery_rules"
  ADD CONSTRAINT "delivery_free_delivery_rules_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "delivery_free_delivery_rules"
  ADD CONSTRAINT "delivery_free_delivery_rules_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── orders: the delivery snapshot ──────────────────────────────────────────
--
-- Every column here is nullable or defaulted, so existing orders migrate
-- untouched: they keep the delivery_charge they were placed with, and simply
-- have no explanation attached — which is honest, because under the flat
-- constant there was none to record.
--
-- delivery_charge_base is the fee before any waiver; delivery_charge stays
-- what was actually billed. The difference is what a free-delivery promise
-- cost the merchant on that order, and it is not recoverable any other way:
-- a zero fee from a waiver and a zero fee from a free zone are the same number.

ALTER TABLE "orders"
  ADD COLUMN "delivery_zone_code" VARCHAR(50),
  ADD COLUMN "delivery_zone_name" VARCHAR(150),
  ADD COLUMN "delivery_charge_base" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "delivery_cod_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "free_delivery_applied" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "free_delivery_rule_name" VARCHAR(150),
  ADD COLUMN "estimated_delivery_from" TIMESTAMPTZ(3),
  ADD COLUMN "estimated_delivery_to" TIMESTAMPTZ(3);

-- Backfill so the invariant below holds for history too. Pre-migration orders
-- were charged a flat fee with no waiver, so base == charged by definition.
UPDATE "orders" SET "delivery_charge_base" = "delivery_charge";

-- A waiver can only ever reduce the fee, never invent one. Stated as a
-- constraint because delivery_charge feeds total_amount, and a base below the
-- charged amount would mean the margin report reads the subsidy as negative.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_delivery_charge_base_check"
  CHECK ("delivery_charge_base" >= "delivery_charge" AND "delivery_cod_fee" >= 0);
