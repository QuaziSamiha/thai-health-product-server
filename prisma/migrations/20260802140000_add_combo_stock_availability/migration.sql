-- Combo availability model. A combo is sellable only if EVERY bundled item
-- has enough stock, so the bundle is limited by its scarcest part:
--
--   quantity = MIN over items of floor(item stock / item quantity)
--
-- That is a MIN, not a SUM — the opposite of products.total_stock. Without
-- this, every storefront listing would have to join combo_items →
-- products/variants and aggregate per card. Same denormalize-and-trigger
-- approach as 20260714200002_backfill_stock_sync_triggers, extended with the
-- three-state LOW_STOCK rule from 20260715130000_add_low_stock_threshold.

-- AlterTable
ALTER TABLE "public"."combo_products"
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stock_status" "StockStatus" NOT NULL DEFAULT 'OUT_OF_STOCK',
  ADD COLUMN "low_stock_threshold" INTEGER NOT NULL DEFAULT 10;

-- ─────────────────────────────────────────────────────────────────────────
-- The one place the availability formula lives. Every trigger below funnels
-- into this, so the rule is defined exactly once.
--
-- Item stock source: a pinned row reads the variant's quantity, an unpinned
-- row reads the product's own quantity. That is correct because
-- ComboProductService enforces VARIABLE ⇒ variant pinned and SIMPLE ⇒ not
-- pinned (see migration 20260802120000), so an unpinned row is always a
-- SIMPLE product, whose stock lives in products.quantity.
--
-- GREATEST(stock, 0) keeps a negative stock from producing a negative
-- bundle count; GREATEST(ci.quantity, 1) guards against a divide-by-zero if
-- an item row ever reaches quantity 0. A combo with no items yields NULL
-- from MIN, which COALESCEs to 0 — an empty bundle is not sellable.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_combo_quantity(p_combo_ids int[])
 RETURNS void
 LANGUAGE sql
AS $function$
  UPDATE "public"."combo_products" cp
  SET "quantity" = COALESCE((
    SELECT MIN(
      GREATEST(
        CASE WHEN ci."variant_id" IS NOT NULL THEN pv."quantity" ELSE p."quantity" END,
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

-- Derives stock_status from quantity, mirroring sync_product_stock_fields.
-- BEFORE-row, so it also fires on the UPDATE issued by
-- recompute_combo_quantity above — that is how status stays in step with
-- quantity without a second statement anywhere.
CREATE OR REPLACE FUNCTION public.sync_combo_stock_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW."stock_status" := CASE
    WHEN NEW."quantity" <= 0 THEN 'OUT_OF_STOCK'::"StockStatus"
    WHEN NEW."quantity" <= NEW."low_stock_threshold" THEN 'LOW_STOCK'::"StockStatus"
    ELSE 'IN_STOCK'::"StockStatus"
  END;
  RETURN NEW;
END;
$function$;

-- Fan-in 1/3: the combo's own item list changed (item added, removed, or its
-- per-bundle quantity / product / variant edited). Both OLD and NEW combos
-- are recomputed so moving an item between combos fixes up both sides.
CREATE OR REPLACE FUNCTION public.sync_combo_quantity_from_items()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.recompute_combo_quantity(ARRAY[OLD."combo_id"]);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recompute_combo_quantity(ARRAY[NEW."combo_id"]);
  END IF;

  RETURN NULL;
END;
$function$;

-- Fan-in 2/3: a SIMPLE product's stock moved. Only unpinned combo rows read
-- products.quantity, so the WHERE clause is narrowed to those — a VARIABLE
-- product's own quantity column never limits a bundle.
CREATE OR REPLACE FUNCTION public.sync_combo_quantity_from_product()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.recompute_combo_quantity(ARRAY(
    SELECT DISTINCT ci."combo_id"
    FROM "public"."combo_items" ci
    WHERE ci."product_id" = NEW."id" AND ci."variant_id" IS NULL
  ));
  RETURN NULL;
END;
$function$;

-- Fan-in 3/3: a variant's stock moved — hits every combo that pinned it.
CREATE OR REPLACE FUNCTION public.sync_combo_quantity_from_variant()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.recompute_combo_quantity(ARRAY(
    SELECT DISTINCT ci."combo_id"
    FROM "public"."combo_items" ci
    WHERE ci."variant_id" = NEW."id"
  ));
  RETURN NULL;
END;
$function$;

-- The `OF <columns>` lists keep these off the hot path for unrelated writes:
-- a price edit or a rename never fires them. combo_items.variant_id/product_id
-- are included so re-pinning an item to a different variant recomputes too.
CREATE TRIGGER trg_sync_combo_stock_status
  BEFORE INSERT OR UPDATE OF quantity, low_stock_threshold ON public.combo_products
  FOR EACH ROW EXECUTE FUNCTION public.sync_combo_stock_status();

CREATE TRIGGER trg_sync_combo_quantity_from_items
  AFTER INSERT OR DELETE OR UPDATE OF quantity, product_id, variant_id, combo_id ON public.combo_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_combo_quantity_from_items();

CREATE TRIGGER trg_sync_combo_quantity_from_product
  AFTER UPDATE OF quantity ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_combo_quantity_from_product();

CREATE TRIGGER trg_sync_combo_quantity_from_variant
  AFTER UPDATE OF quantity ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.sync_combo_quantity_from_variant();

-- Backfill every existing combo. The UPDATE inside recompute_combo_quantity
-- fires trg_sync_combo_stock_status, so stock_status is derived here too and
-- needs no separate statement.
SELECT public.recompute_combo_quantity(ARRAY(SELECT "id" FROM "public"."combo_products"));
