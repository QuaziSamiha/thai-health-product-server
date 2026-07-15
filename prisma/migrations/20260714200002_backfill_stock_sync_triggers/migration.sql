-- Backfill migration: reconstructs a migration that was applied directly to
-- the dev database (originally named `add_stock_sync_triggers`) but whose
-- migration file was missing from this directory, causing drift.
-- Reconstructed from the live database's actual function/trigger
-- definitions. NOT executed against the dev DB (registered via
-- `prisma migrate resolve --applied`) since these objects already exist there.

CREATE OR REPLACE FUNCTION public.sync_variant_stock_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW."stockStatus" := CASE WHEN NEW."quantity" > 0 THEN 'IN_STOCK'::"StockStatus" ELSE 'OUT_OF_STOCK'::"StockStatus" END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_product_stock_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT NEW."hasVariants" THEN
    NEW."total_stock" := NEW."quantity";
  END IF;
  NEW."stockStatus" := CASE WHEN NEW."total_stock" > 0 THEN 'IN_STOCK'::"StockStatus" ELSE 'OUT_OF_STOCK'::"StockStatus" END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_product_total_stock_from_variants()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."productId" IS NOT NULL THEN
    UPDATE "products"
    SET "total_stock" = (
      SELECT COALESCE(SUM("quantity"), 0) FROM "product_variants" WHERE "productId" = OLD."productId"
    )
    WHERE "id" = OLD."productId" AND "hasVariants" = true;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW."productId" IS NOT NULL THEN
    UPDATE "products"
    SET "total_stock" = (
      SELECT COALESCE(SUM("quantity"), 0) FROM "product_variants" WHERE "productId" = NEW."productId"
    )
    WHERE "id" = NEW."productId" AND "hasVariants" = true;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_sync_variant_stock_status BEFORE INSERT OR UPDATE OF quantity ON public.product_variants FOR EACH ROW EXECUTE FUNCTION sync_variant_stock_status();
CREATE TRIGGER trg_sync_product_stock_fields BEFORE INSERT OR UPDATE OF quantity, "hasVariants", total_stock ON public.products FOR EACH ROW EXECUTE FUNCTION sync_product_stock_fields();
CREATE TRIGGER trg_sync_product_total_stock_from_variants AFTER INSERT OR DELETE OR UPDATE OF quantity, "productId" ON public.product_variants FOR EACH ROW EXECUTE FUNCTION sync_product_total_stock_from_variants();
