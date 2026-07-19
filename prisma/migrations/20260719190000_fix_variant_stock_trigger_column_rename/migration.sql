-- Fixes a drift bug left by 20260719130000_snake_case_product_columns:
-- that migration renamed productId -> product_id and hasVariants ->
-- has_variants but only rewrote two of the three trigger function bodies
-- that reference those columns as plain text. sync_product_total_stock_from_variants()
-- was missed and still referenced OLD."productId" / NEW."productId" /
-- "hasVariants", which no longer exist -- causing every INSERT/UPDATE/DELETE
-- on product_variants.quantity to fail at runtime with
-- `column "productId" does not exist`.

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
