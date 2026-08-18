-- Per-variant visibility gate. Until now a VARIABLE product was all-or-nothing:
-- retiring one size meant either deleting the variant row (blocked outright
-- when a combo bundles it — combo_items_variant_id_fkey is ON DELETE RESTRICT)
-- or taking the whole product down. product_variants.variant_status fixes that
-- with the same CategoryProductStatus enum products.status already uses.
--
-- It NARROWS, never widens: an ACTIVE variant of a DRAFT product is still
-- invisible, because the parent product gate is applied first everywhere.
--
-- Two derived columns have to learn about it, or the flag would be cosmetic:
--
--   products.total_stock   — was SUM(quantity) over ALL variants. A retired
--                            variant's stock is still on the shelf but cannot
--                            be bought, so counting it would keep a product
--                            reading IN_STOCK while every purchasable variant
--                            is gone. Now sums ACTIVE variants only.
--
--   combo_products.quantity — the scarcest-part bundle ceiling. A pinned
--                            variant that is not ACTIVE contributes 0 stock,
--                            so any combo bundling it drops to 0 bundles /
--                            OUT_OF_STOCK. That is the DB-level backstop
--                            behind ComboProductService's app-level rules
--                            (cannot bundle a non-ACTIVE variant, cannot
--                            publish a combo that pins one, cannot deactivate
--                            a variant an ACTIVE combo depends on).
--
-- Both app-side mirrors of these formulas must move in step:
-- ProductService.buildStockAndVariants / buildVariantReconcilePlan for
-- total_stock, ComboProductService.resolveComboAvailability for the ceiling.

-- ── AlterTable ──────────────────────────────────────────────────────────────
-- DEFAULT 'ACTIVE' backfills every existing row to today's behaviour: before
-- this column existed, a variant that was in the DB was purchasable.
ALTER TABLE "public"."product_variants"
  ADD COLUMN "variant_status" "CategoryProductStatus" NOT NULL DEFAULT 'ACTIVE';

-- Mirrors products' own (status, ...) index family: the storefront PDP and
-- every public product read filter this product's variants down to the
-- sellable ones, which is a (product_id, variant_status) lookup.
CREATE INDEX "product_variants_product_id_variant_status_idx"
  ON "public"."product_variants" ("product_id", "variant_status");

-- ─────────────────────────────────────────────────────────────────────────
-- products.total_stock — sellable stock, not shelf stock.
--
-- Supersedes the body last written by
-- 20260719190000_hotfix_sync_product_total_stock_trigger. Only the SUM's
-- WHERE clause changes (variant_status = 'ACTIVE'); the OLD/NEW fan-out and
-- the has_variants guard are unchanged.
--
-- The trigger's `OF <columns>` list must also cover variant_status now, or
-- flipping a variant's status alone would leave total_stock stale until the
-- next quantity edit. Postgres has no ALTER TRIGGER for that — drop and
-- recreate, same as 20260715130000_add_low_stock_threshold had to.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_product_total_stock_from_variants()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."product_id" IS NOT NULL THEN
    UPDATE "products"
    SET "total_stock" = (
      SELECT COALESCE(SUM("quantity"), 0) FROM "product_variants"
      WHERE "product_id" = OLD."product_id" AND "variant_status" = 'ACTIVE'
    )
    WHERE "id" = OLD."product_id" AND "has_variants" = true;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW."product_id" IS NOT NULL THEN
    UPDATE "products"
    SET "total_stock" = (
      SELECT COALESCE(SUM("quantity"), 0) FROM "product_variants"
      WHERE "product_id" = NEW."product_id" AND "variant_status" = 'ACTIVE'
    )
    WHERE "id" = NEW."product_id" AND "has_variants" = true;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_product_total_stock_from_variants ON public.product_variants;
CREATE TRIGGER trg_sync_product_total_stock_from_variants
  AFTER INSERT OR DELETE OR UPDATE OF quantity, product_id, variant_status ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_total_stock_from_variants();

-- ─────────────────────────────────────────────────────────────────────────
-- combo_products.quantity — a non-ACTIVE pinned variant contributes 0.
--
-- Supersedes the body from 20260802140000_add_combo_stock_availability. The
-- MIN/GREATEST/divide-by-zero guards are untouched; the only change is the
-- pinned branch, which now reads 0 instead of pv.quantity when the variant is
-- not ACTIVE. MIN over items then forces the whole bundle to 0, and the
-- BEFORE-row trg_sync_combo_stock_status derives OUT_OF_STOCK from that in
-- the same UPDATE — no extra statement needed, exactly as before.
--
-- The unpinned branch deliberately still reads products.quantity with no
-- status test: gating a bundle on the *product's* own workflow status is a
-- separate rule (an admin may legitimately stage a DRAFT combo around a DRAFT
-- product), and nothing in this change alters it.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_combo_quantity(p_combo_ids int[])
 RETURNS void
 LANGUAGE sql
AS $function$
  UPDATE "public"."combo_products" cp
  SET "quantity" = COALESCE((
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

-- Fan-in 3/3 from 20260802140000 fired only on a variant's `quantity`. A
-- status flip moves the same ceiling without touching quantity, so widen the
-- trigger's column list; the function body needs no change (it already keys
-- off NEW."id").
DROP TRIGGER IF EXISTS trg_sync_combo_quantity_from_variant ON public.product_variants;
CREATE TRIGGER trg_sync_combo_quantity_from_variant
  AFTER UPDATE OF quantity, variant_status ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.sync_combo_quantity_from_variant();

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Every row defaulted to ACTIVE above, so neither formula's result actually
-- moves — these run so the columns are provably derived from the NEW
-- definitions rather than trusted to have been equivalent, the same way
-- 20260802140000 backfilled itself.
UPDATE "public"."products" p
SET "total_stock" = (
  SELECT COALESCE(SUM("quantity"), 0) FROM "public"."product_variants"
  WHERE "product_id" = p."id" AND "variant_status" = 'ACTIVE'
)
WHERE p."has_variants" = true;

SELECT public.recompute_combo_quantity(ARRAY(SELECT "id" FROM "public"."combo_products"));
