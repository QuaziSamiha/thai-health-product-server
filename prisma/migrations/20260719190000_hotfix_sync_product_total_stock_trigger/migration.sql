-- HOTFIX: 20260719130000_snake_case_product_columns renamed productId/hasVariants
-- to product_id/has_variants but only rewrote sync_variant_stock_status and
-- sync_product_stock_fields. It missed sync_product_total_stock_from_variants
-- (defined back in 20260714200002_backfill_stock_sync_triggers), whose body
-- still referenced the old camelCase names. Since plpgsql only validates
-- statement bodies at execution time, this compiled fine and broke silently:
-- any INSERT/UPDATE OF quantity, product_id/DELETE on product_variants fired
-- the trigger, which then threw `column "productId" does not exist` and
-- rolled back — breaking variant stock changes for every VARIABLE product.
CREATE OR REPLACE FUNCTION public.sync_product_total_stock_from_variants()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."product_id" IS NOT NULL THEN
    UPDATE "products"
    SET "total_stock" = (
      SELECT COALESCE(SUM("quantity"), 0) FROM "product_variants" WHERE "product_id" = OLD."product_id"
    )
    WHERE "id" = OLD."product_id" AND "has_variants" = true;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW."product_id" IS NOT NULL THEN
    UPDATE "products"
    SET "total_stock" = (
      SELECT COALESCE(SUM("quantity"), 0) FROM "product_variants" WHERE "product_id" = NEW."product_id"
    )
    WHERE "id" = NEW."product_id" AND "has_variants" = true;
  END IF;

  RETURN NULL;
END;
$function$;
