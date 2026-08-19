-- ============================================================================
-- Combo availability, restated as three explicit numbers on combo_products.
--
--   available_quantity  DERIVED. How many complete bundles current component
--                       stock can assemble — MIN over items of
--                       floor(item stock / per-bundle quantity). This is the
--                       old `quantity` column, renamed: "quantity" on a model
--                       that owns no inventory read as if a combo had a
--                       warehouse count of its own, which it does not.
--   offered_quantity    ADMIN INTENT. The cap on how many bundles this
--                       promotion will ever sell. NULL = no cap.
--   sold_quantity       COUNTER. Bundles actually claimed by orders. A combo
--                       holds no stock, so this is the only record of how far
--                       a capped offer has been consumed.
--
-- The number that matters to a customer is neither of the first two alone:
--
--   sellable = offered IS NULL ? available
--                              : LEAST(available, GREATEST(offered - sold, 0))
--
-- and that rule now lives in exactly one place — combo_sellable_quantity()
-- below — because stock_status, the storefront gate, and the order validator
-- all have to agree on it.
--
-- Two lifecycle rules follow from it and are enforced here rather than left
-- to application code:
--   * A capped offer that has been fully sold (sold >= offered) cannot stay
--     ACTIVE. Event-driven, so a trigger owns it.
--   * A promotion past its ends_at cannot stay ACTIVE. Time-driven, so no
--     trigger can own it: ComboExpiryService sweeps it on a schedule, and
--     every read gate additionally tests the window live so an expired combo
--     is never sellable in the gap between sweeps. The partial index at the
--     bottom is what keeps that sweep cheap.
--
-- Finally this drops products.combo_quantity / product_variants.combo_quantity
-- (added 20260802100000, repurposed 20260804010000). They tried to express
-- "how much of this product's stock is currently claimed by combos" — but a
-- combo never reserves stock. It draws from the same pool as a direct sale at
-- checkout time, so a unit is available to both channels until it is sold to
-- one of them. Splitting the shelf count into "product stock" and "combo
-- stock" was reporting a reservation that does not exist.
-- ============================================================================

-- ── 1. Drop the product/variant combo commitment counter ────────────────────
DROP TRIGGER IF EXISTS trg_sync_product_combo_quantity_from_items ON public.combo_items;
DROP TRIGGER IF EXISTS trg_sync_product_combo_quantity_from_combo ON public.combo_products;
DROP FUNCTION IF EXISTS public.sync_product_combo_quantity_from_items();
DROP FUNCTION IF EXISTS public.sync_product_combo_quantity_from_combo();
DROP FUNCTION IF EXISTS public.recompute_product_combo_quantity(int[], int[]);

ALTER TABLE "public"."products"
  DROP CONSTRAINT IF EXISTS "products_combo_quantity_non_negative";
ALTER TABLE "public"."product_variants"
  DROP CONSTRAINT IF EXISTS "product_variants_combo_quantity_non_negative";
ALTER TABLE "public"."products" DROP COLUMN IF EXISTS "combo_quantity";
ALTER TABLE "public"."product_variants" DROP COLUMN IF EXISTS "combo_quantity";

-- ── 2. Rename quantity → available_quantity, add sold_quantity ──────────────
-- RENAME COLUMN carries the constraint and the trigger definitions with it, so
-- the CHECK is renamed for consistency rather than dropped and re-added.
ALTER TABLE "public"."combo_products" RENAME COLUMN "quantity" TO "available_quantity";
ALTER TABLE "public"."combo_products"
  RENAME CONSTRAINT "combo_products_quantity_non_negative"
  TO "combo_products_available_quantity_non_negative";

ALTER TABLE "public"."combo_products"
  ADD COLUMN "sold_quantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."combo_products"
  ADD CONSTRAINT "combo_products_sold_quantity_non_negative" CHECK ("sold_quantity" >= 0);

-- Deliberately NO cross-column CHECK (sold_quantity <= offered_quantity), for
-- the same reason 20260803010000 refused one between offered_quantity and the
-- assemblable ceiling: an admin lowering offered_quantity below what has
-- already shipped is a legitimate (if late) act, and a constraint would turn
-- it into a failed UPDATE on an unrelated column edit. The relationship is
-- enforced where it can produce a useful error — ComboProductService — and
-- the sellable formula floors at 0 so an overshoot can never read as negative
-- availability.

-- ── 3. The sellable rule, defined once ──────────────────────────────────────
-- IMMUTABLE so it can be used in an index or a generated column later, and so
-- the planner can inline it into the read gates that call it per row.
--
-- NULL offered_quantity does NOT subtract sold_quantity: with no cap, every
-- sale has already reduced available_quantity through the component stock it
-- consumed, so subtracting again would double-count the same sale.
CREATE OR REPLACE FUNCTION public.combo_sellable_quantity(
  p_available int,
  p_offered int,
  p_sold int
)
 RETURNS int
 LANGUAGE sql
 IMMUTABLE
 PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN p_offered IS NULL THEN GREATEST(COALESCE(p_available, 0), 0)
    ELSE LEAST(
      GREATEST(COALESCE(p_available, 0), 0),
      GREATEST(p_offered - COALESCE(p_sold, 0), 0)
    )
  END;
$function$;

-- ── 4. available_quantity: the scarcest-part ceiling ────────────────────────
-- Body is unchanged from 20260818100000_add_product_variant_status (a
-- non-ACTIVE pinned variant still contributes 0); only the target column and
-- the function name move. The old name is dropped at the end of this block,
-- after the three fan-in functions below have been repointed at the new one.
CREATE OR REPLACE FUNCTION public.recompute_combo_available_quantity(p_combo_ids int[])
 RETURNS void
 LANGUAGE sql
AS $function$
  UPDATE "public"."combo_products" cp
  SET "available_quantity" = COALESCE((
    SELECT MIN(
      GREATEST(
        CASE
          WHEN ci."variant_id" IS NOT NULL
            THEN CASE WHEN pv."variant_status" = 'ACTIVE' THEN pv."quantity" ELSE 0 END
          ELSE p."quantity"
        END,
        0
      ) / GREATEST(ci."quantity", 1)
    )
    FROM "public"."combo_items" ci
    JOIN "public"."products" p ON p."id" = ci."product_id"
    LEFT JOIN "public"."product_variants" pv ON pv."id" = ci."variant_id"
    WHERE ci."combo_id" = cp."id"
  ), 0)
  WHERE cp."id" = ANY(p_combo_ids);
$function$;

CREATE OR REPLACE FUNCTION public.sync_combo_available_quantity_from_items()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.recompute_combo_available_quantity(ARRAY[OLD."combo_id"]);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recompute_combo_available_quantity(ARRAY[NEW."combo_id"]);
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_combo_available_quantity_from_product()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.recompute_combo_available_quantity(ARRAY(
    SELECT DISTINCT ci."combo_id"
    FROM "public"."combo_items" ci
    WHERE ci."product_id" = NEW."id" AND ci."variant_id" IS NULL
  ));
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_combo_available_quantity_from_variant()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.recompute_combo_available_quantity(ARRAY(
    SELECT DISTINCT ci."combo_id"
    FROM "public"."combo_items" ci
    WHERE ci."variant_id" = NEW."id"
  ));
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_combo_quantity_from_items ON public.combo_items;
DROP TRIGGER IF EXISTS trg_sync_combo_quantity_from_product ON public.products;
DROP TRIGGER IF EXISTS trg_sync_combo_quantity_from_variant ON public.product_variants;
DROP FUNCTION IF EXISTS public.sync_combo_quantity_from_items();
DROP FUNCTION IF EXISTS public.sync_combo_quantity_from_product();
DROP FUNCTION IF EXISTS public.sync_combo_quantity_from_variant();
DROP FUNCTION IF EXISTS public.recompute_combo_quantity(int[]);

CREATE TRIGGER trg_sync_combo_available_quantity_from_items
  AFTER INSERT OR DELETE OR UPDATE OF quantity, product_id, variant_id, combo_id ON public.combo_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_combo_available_quantity_from_items();

CREATE TRIGGER trg_sync_combo_available_quantity_from_product
  AFTER UPDATE OF quantity ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_combo_available_quantity_from_product();

CREATE TRIGGER trg_sync_combo_available_quantity_from_variant
  AFTER UPDATE OF quantity, variant_status ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.sync_combo_available_quantity_from_variant();

-- ── 5. stock_status now reads the SELLABLE number, not the raw ceiling ──────
-- Previously derived from `quantity` alone. That was correct while a combo's
-- only limit was component stock; with a cap and a sold counter it is not — a
-- sold-out capped offer sitting on plenty of component stock would have gone
-- on rendering "In Stock" on the storefront card. stock_status is the single
-- availability signal the public API exposes (COMBO_PRODUCT_SELECT_PUBLIC
-- carries no raw counts), so it has to answer "can I buy this", not "could it
-- be assembled".
CREATE OR REPLACE FUNCTION public.sync_combo_stock_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_sellable int;
BEGIN
  v_sellable := public.combo_sellable_quantity(
    NEW."available_quantity", NEW."offered_quantity", NEW."sold_quantity"
  );

  NEW."stock_status" := CASE
    WHEN v_sellable <= 0 THEN 'OUT_OF_STOCK'::"StockStatus"
    WHEN v_sellable <= NEW."low_stock_threshold" THEN 'LOW_STOCK'::"StockStatus"
    ELSE 'IN_STOCK'::"StockStatus"
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_combo_stock_status ON public.combo_products;
CREATE TRIGGER trg_sync_combo_stock_status
  BEFORE INSERT OR UPDATE OF available_quantity, low_stock_threshold, offered_quantity, sold_quantity ON public.combo_products
  FOR EACH ROW EXECUTE FUNCTION public.sync_combo_stock_status();

-- ── 6. A fully-sold capped offer cannot stay ACTIVE ─────────────────────────
-- BEFORE-row so the flip lands in the same UPDATE that moved sold_quantity —
-- there is no window in which an exhausted combo is readable as ACTIVE.
--
-- One-way on purpose. Raising offered_quantity on a sold-out combo does NOT
-- reactivate it: republishing a promotion is an editorial decision, and
-- silently putting a card back on the storefront because a number moved is
-- exactly the kind of surprise the DRAFT-by-default rule exists to prevent.
-- The admin sets status = ACTIVE explicitly, and this trigger lets that
-- through as long as the cap is no longer exhausted.
--
-- `status` is in the OF list so the invariant holds whichever column moved: an
-- UPDATE that sets ACTIVE on a still-exhausted combo is bounced straight back
-- to INACTIVE. ComboProductService rejects that case first with a 400 that
-- explains why; this is only the backstop for seeds and manual SQL.
CREATE OR REPLACE FUNCTION public.sync_combo_offer_exhaustion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW."status" = 'ACTIVE'
     AND NEW."offered_quantity" IS NOT NULL
     AND NEW."sold_quantity" >= NEW."offered_quantity"
  THEN
    NEW."status" := 'INACTIVE'::"CategoryProductStatus";
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_sync_combo_offer_exhaustion
  BEFORE INSERT OR UPDATE OF sold_quantity, offered_quantity, status ON public.combo_products
  FOR EACH ROW EXECUTE FUNCTION public.sync_combo_offer_exhaustion();

-- ── 7. Keep the expiry sweep cheap ──────────────────────────────────────────
-- ComboExpiryService runs `UPDATE ... WHERE status = 'ACTIVE' AND deleted_at
-- IS NULL AND ends_at < now()` on a schedule. Without this the sweep is a seq
-- scan over every combo ever created, on a fixed interval, forever.
CREATE INDEX "combo_products_expiry_sweep_idx"
  ON "public"."combo_products" ("ends_at")
  WHERE "status" = 'ACTIVE' AND "deleted_at" IS NULL AND "ends_at" IS NOT NULL;

-- ── 8. Backfill ─────────────────────────────────────────────────────────────
-- sold_quantity from the order ledger, which is the only existing record of
-- combo sales. Terminal-negative statuses are excluded because those orders
-- already had their component stock restored (InventoryService
-- .restoreStockForOrder) — counting them would consume a cap against sales
-- that were given back.
UPDATE "public"."combo_products" cp
SET "sold_quantity" = COALESCE((
  SELECT SUM(oi."quantity")
  FROM "public"."order_items" oi
  JOIN "public"."orders" o ON o."id" = oi."order_id"
  WHERE oi."combo_id" = cp."id"
    AND o."status" NOT IN ('CANCELLED', 'FAILED', 'RETURNED', 'REFUNDED')
), 0);

-- Re-derive available_quantity from the renamed column. The UPDATE inside
-- recompute_combo_available_quantity fires trg_sync_combo_stock_status, which
-- now folds sold_quantity in — so stock_status is corrected here too and
-- needs no separate statement, exactly as in 20260802140000.
SELECT public.recompute_combo_available_quantity(ARRAY(SELECT "id" FROM "public"."combo_products"));

-- Deactivate anything the new rules retire: already-exhausted caps and
-- promotions whose window has closed. The trigger above only sees rows that
-- are updated, so the first sweep is written out explicitly.
UPDATE "public"."combo_products"
SET "status" = 'INACTIVE'
WHERE "status" = 'ACTIVE'
  AND "deleted_at" IS NULL
  AND (
    ("offered_quantity" IS NOT NULL AND "sold_quantity" >= "offered_quantity")
    OR ("ends_at" IS NOT NULL AND "ends_at" < now())
  );
