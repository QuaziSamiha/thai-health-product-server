-- Live "how much of this product's stock is currently committed to combos"
-- counter. Distinct from Product.comboQuantity/ProductVariant.comboQuantity
-- (a static > 0 prefill default for a NEW ComboItem, untouched by this
-- migration) — this new column starts at 0 and is kept in sync by triggers
-- below with the SUM of combo_items.quantity across every combo currently
-- in DRAFT or ACTIVE status that bundles this product/variant. INACTIVE/
-- ARCHIVED/HIDDEN combos, and deleted combos (their items cascade-delete),
-- do not count.
--
-- Same denormalize-and-trigger approach as recompute_combo_quantity in
-- 20260802140000_add_combo_stock_availability, mirrored onto the OTHER side
-- of the combo_items relationship (products/product_variants instead of
-- combo_products), and additionally gated on the parent combo's status.

ALTER TABLE "public"."products"
  ADD COLUMN "combo_reserved_quantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."product_variants"
  ADD COLUMN "combo_reserved_quantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "public"."products"
  ADD CONSTRAINT "products_combo_reserved_quantity_non_negative" CHECK ("combo_reserved_quantity" >= 0);
ALTER TABLE "public"."product_variants"
  ADD CONSTRAINT "product_variants_combo_reserved_quantity_non_negative" CHECK ("combo_reserved_quantity" >= 0);

-- ─────────────────────────────────────────────────────────────────────────
-- Single source of truth. Unpinned item (variant_id IS NULL) -> the
-- products row; pinned item -> the product_variants row — same pinned/
-- unpinned split used everywhere else in the combo model (see
-- recompute_combo_quantity, ComboProductService.resolveComboItems).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_combo_reserved_quantity(p_product_ids int[], p_variant_ids int[])
 RETURNS void
 LANGUAGE sql
AS $function$
  UPDATE "public"."products" p
  SET "combo_reserved_quantity" = COALESCE((
    SELECT SUM(ci."quantity")
    FROM "public"."combo_items" ci
    JOIN "public"."combo_products" cp ON cp."id" = ci."combo_id"
    WHERE ci."product_id" = p."id" AND ci."variant_id" IS NULL
      AND cp."deleted_at" IS NULL AND cp."status" IN ('DRAFT', 'ACTIVE')
  ), 0)
  WHERE p."id" = ANY(p_product_ids);

  UPDATE "public"."product_variants" pv
  SET "combo_reserved_quantity" = COALESCE((
    SELECT SUM(ci."quantity")
    FROM "public"."combo_items" ci
    JOIN "public"."combo_products" cp ON cp."id" = ci."combo_id"
    WHERE ci."variant_id" = pv."id"
      AND cp."deleted_at" IS NULL AND cp."status" IN ('DRAFT', 'ACTIVE')
  ), 0)
  WHERE pv."id" = ANY(p_variant_ids);
$function$;

-- Fan-in 1/2: a combo's item list changed (added/removed/quantity edited/
-- re-pinned). Recomputes both OLD and NEW product+variant so moving an item
-- between products/variants fixes up both sides. combo_products
-- cascade-deletes combo_items (ON DELETE CASCADE, see combo-product.prisma),
-- and Postgres fires each deleted child row's AFTER DELETE trigger during
-- that cascade — so deleting a combo already flows through here with no
-- separate trigger needed on combo_products for DELETE.
CREATE OR REPLACE FUNCTION public.sync_combo_reserved_quantity_from_items()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.recompute_combo_reserved_quantity(
      ARRAY[OLD."product_id"],
      CASE WHEN OLD."variant_id" IS NOT NULL THEN ARRAY[OLD."variant_id"] ELSE ARRAY[]::int[] END
    );
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recompute_combo_reserved_quantity(
      ARRAY[NEW."product_id"],
      CASE WHEN NEW."variant_id" IS NOT NULL THEN ARRAY[NEW."variant_id"] ELSE ARRAY[]::int[] END
    );
  END IF;
  RETURN NULL;
END;
$function$;

-- Fan-in 2/2: a combo's status crosses the DRAFT/ACTIVE <-> INACTIVE/
-- ARCHIVED/HIDDEN boundary (or back) — every product/variant it bundles
-- needs re-summing since whether it counts just flipped.
CREATE OR REPLACE FUNCTION public.sync_combo_reserved_quantity_from_combo_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.recompute_combo_reserved_quantity(
    ARRAY(SELECT DISTINCT ci."product_id" FROM "public"."combo_items" ci WHERE ci."combo_id" = NEW."id"),
    ARRAY(SELECT DISTINCT ci."variant_id" FROM "public"."combo_items" ci WHERE ci."combo_id" = NEW."id" AND ci."variant_id" IS NOT NULL)
  );
  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_sync_combo_reserved_quantity_from_items
  AFTER INSERT OR DELETE OR UPDATE OF quantity, product_id, variant_id ON public.combo_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_combo_reserved_quantity_from_items();

CREATE TRIGGER trg_sync_combo_reserved_quantity_from_combo_status
  AFTER UPDATE OF status ON public.combo_products
  FOR EACH ROW EXECUTE FUNCTION public.sync_combo_reserved_quantity_from_combo_status();

-- Backfill every existing product/variant.
SELECT public.recompute_combo_reserved_quantity(
  ARRAY(SELECT "id" FROM "public"."products"),
  ARRAY(SELECT "id" FROM "public"."product_variants")
);
