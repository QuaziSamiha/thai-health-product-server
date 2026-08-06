-- Supersedes 20260804000000_add_combo_reserved_quantity. That migration
-- added a SEPARATE combo_reserved_quantity column summing raw
-- combo_items.quantity — but that undercounts: a combo offering 20 bundles
-- of 2 units each commits 40 units, not 2. The missing factor is
-- combo_products.offered_quantity (added in 20260803010000_combo_offered_
-- quantity — the admin's chosen "how many bundles to actually sell" cap).
--
-- Rather than keep two combo-quantity columns on Product/ProductVariant,
-- this migration drops the short-lived combo_reserved_quantity column and
-- REPURPOSES the original combo_quantity column instead: it stops being a
-- static >0 prefill default (grep confirms nothing actually reads it as a
-- ComboItem.quantity prefill — resolveComboItems defaults to a literal 1)
-- and becomes the same kind of live, trigger-maintained total the dropped
-- column was, correctly scaled by offered_quantity this time.

-- ── Undo 20260804000000 ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_combo_reserved_quantity_from_items ON public.combo_items;
DROP TRIGGER IF EXISTS trg_sync_combo_reserved_quantity_from_combo_status ON public.combo_products;
DROP FUNCTION IF EXISTS public.sync_combo_reserved_quantity_from_items();
DROP FUNCTION IF EXISTS public.sync_combo_reserved_quantity_from_combo_status();
DROP FUNCTION IF EXISTS public.recompute_combo_reserved_quantity(int[], int[]);

ALTER TABLE "public"."products" DROP CONSTRAINT IF EXISTS "products_combo_reserved_quantity_non_negative";
ALTER TABLE "public"."product_variants" DROP CONSTRAINT IF EXISTS "product_variants_combo_reserved_quantity_non_negative";
ALTER TABLE "public"."products" DROP COLUMN IF EXISTS "combo_reserved_quantity";
ALTER TABLE "public"."product_variants" DROP COLUMN IF EXISTS "combo_reserved_quantity";

-- ── Repurpose combo_quantity ────────────────────────────────────────────────
ALTER TABLE "public"."products" DROP CONSTRAINT "products_combo_quantity_positive";
ALTER TABLE "public"."product_variants" DROP CONSTRAINT "product_variants_combo_quantity_positive";

ALTER TABLE "public"."products" ALTER COLUMN "combo_quantity" SET DEFAULT 0;
ALTER TABLE "public"."product_variants" ALTER COLUMN "combo_quantity" SET DEFAULT 0;

ALTER TABLE "public"."products"
  ADD CONSTRAINT "products_combo_quantity_non_negative" CHECK ("combo_quantity" >= 0);
ALTER TABLE "public"."product_variants"
  ADD CONSTRAINT "product_variants_combo_quantity_non_negative" CHECK ("combo_quantity" >= 0);

-- ─────────────────────────────────────────────────────────────────────────
-- Single source of truth: for every DRAFT/ACTIVE combo bundling this
-- product/variant, sum (per-bundle quantity * how many bundles are actually
-- being sold). "How many bundles being sold" mirrors the effective-sellable
-- formula from 20260803010000_combo_offered_quantity:
--   LEAST(quantity, COALESCE(offered_quantity, quantity))
-- quantity (the MIN-over-items assemblable ceiling) is included as the cap
-- so a stale offered_quantity — set before stock later fell — can never
-- overstate what's actually committed.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_product_combo_quantity(p_product_ids int[], p_variant_ids int[])
 RETURNS void
 LANGUAGE sql
AS $function$
  UPDATE "public"."products" p
  SET "combo_quantity" = COALESCE((
    SELECT SUM(ci."quantity" * LEAST(cp."quantity", COALESCE(cp."offered_quantity", cp."quantity")))
    FROM "public"."combo_items" ci
    JOIN "public"."combo_products" cp ON cp."id" = ci."combo_id"
    WHERE ci."product_id" = p."id" AND ci."variant_id" IS NULL
      AND cp."deleted_at" IS NULL AND cp."status" IN ('DRAFT', 'ACTIVE')
  ), 0)
  WHERE p."id" = ANY(p_product_ids);

  UPDATE "public"."product_variants" pv
  SET "combo_quantity" = COALESCE((
    SELECT SUM(ci."quantity" * LEAST(cp."quantity", COALESCE(cp."offered_quantity", cp."quantity")))
    FROM "public"."combo_items" ci
    JOIN "public"."combo_products" cp ON cp."id" = ci."combo_id"
    WHERE ci."variant_id" = pv."id"
      AND cp."deleted_at" IS NULL AND cp."status" IN ('DRAFT', 'ACTIVE')
  ), 0)
  WHERE pv."id" = ANY(p_variant_ids);
$function$;

-- Fan-in 1/2: a combo's item list changed (added/removed/quantity edited/
-- re-pinned). combo_products cascade-deletes combo_items (ON DELETE
-- CASCADE), and Postgres fires each deleted child row's AFTER DELETE
-- trigger during that cascade — so deleting a combo flows through here even
-- though the parent combo_products row is gone by the time this runs.
CREATE OR REPLACE FUNCTION public.sync_product_combo_quantity_from_items()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.recompute_product_combo_quantity(
      ARRAY[OLD."product_id"],
      CASE WHEN OLD."variant_id" IS NOT NULL THEN ARRAY[OLD."variant_id"] ELSE ARRAY[]::int[] END
    );
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recompute_product_combo_quantity(
      ARRAY[NEW."product_id"],
      CASE WHEN NEW."variant_id" IS NOT NULL THEN ARRAY[NEW."variant_id"] ELSE ARRAY[]::int[] END
    );
  END IF;
  RETURN NULL;
END;
$function$;

-- Fan-in 2/2: the combo's own ceiling moved. `quantity` changes whenever
-- physical stock moves (via the existing recompute_combo_quantity chain);
-- `offered_quantity`/`status` change on a direct admin edit. Either can
-- shift the effective-sellable number without any combo_items row changing.
CREATE OR REPLACE FUNCTION public.sync_product_combo_quantity_from_combo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.recompute_product_combo_quantity(
    ARRAY(SELECT DISTINCT ci."product_id" FROM "public"."combo_items" ci WHERE ci."combo_id" = NEW."id"),
    ARRAY(SELECT DISTINCT ci."variant_id" FROM "public"."combo_items" ci WHERE ci."combo_id" = NEW."id" AND ci."variant_id" IS NOT NULL)
  );
  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_sync_product_combo_quantity_from_items
  AFTER INSERT OR DELETE OR UPDATE OF quantity, product_id, variant_id ON public.combo_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_combo_quantity_from_items();

CREATE TRIGGER trg_sync_product_combo_quantity_from_combo
  AFTER UPDATE OF quantity, offered_quantity, status ON public.combo_products
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_combo_quantity_from_combo();

-- Backfill every existing product/variant.
SELECT public.recompute_product_combo_quantity(
  ARRAY(SELECT "id" FROM "public"."products"),
  ARRAY(SELECT "id" FROM "public"."product_variants")
);
