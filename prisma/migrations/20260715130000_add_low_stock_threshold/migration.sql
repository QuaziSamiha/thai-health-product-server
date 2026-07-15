-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "low_stock_threshold" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "low_stock_threshold" INTEGER NOT NULL DEFAULT 10;

-- Wires up the previously-dead LOW_STOCK enum value: a row is now IN_STOCK
-- above its own low_stock_threshold, LOW_STOCK from 1 up to (and including)
-- it, and OUT_OF_STOCK at 0. Replaces the two-state functions from
-- `20260714200002_backfill_stock_sync_triggers`.

CREATE OR REPLACE FUNCTION public.sync_variant_stock_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW."stockStatus" := CASE
    WHEN NEW."quantity" <= 0 THEN 'OUT_OF_STOCK'::"StockStatus"
    WHEN NEW."quantity" <= NEW."low_stock_threshold" THEN 'LOW_STOCK'::"StockStatus"
    ELSE 'IN_STOCK'::"StockStatus"
  END;
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
  NEW."stockStatus" := CASE
    WHEN NEW."total_stock" <= 0 THEN 'OUT_OF_STOCK'::"StockStatus"
    WHEN NEW."total_stock" <= NEW."low_stock_threshold" THEN 'LOW_STOCK'::"StockStatus"
    ELSE 'IN_STOCK'::"StockStatus"
  END;
  RETURN NEW;
END;
$function$;

-- The trigger's `OF <columns>` list must now also cover
-- low_stock_threshold, so editing just the threshold (no quantity change)
-- still recomputes stockStatus. Postgres has no ALTER TRIGGER for this —
-- drop and recreate.
DROP TRIGGER IF EXISTS trg_sync_variant_stock_status ON public.product_variants;
CREATE TRIGGER trg_sync_variant_stock_status BEFORE INSERT OR UPDATE OF quantity, low_stock_threshold ON public.product_variants FOR EACH ROW EXECUTE FUNCTION sync_variant_stock_status();

DROP TRIGGER IF EXISTS trg_sync_product_stock_fields ON public.products;
CREATE TRIGGER trg_sync_product_stock_fields BEFORE INSERT OR UPDATE OF quantity, "hasVariants", total_stock, low_stock_threshold ON public.products FOR EACH ROW EXECUTE FUNCTION sync_product_stock_fields();

-- Backfill: re-derive stockStatus for every existing row against the new
-- three-state rule (all rows just got the default threshold of 10 above,
-- so some previously IN_STOCK rows now qualify as LOW_STOCK).
UPDATE "public"."product_variants" SET "stockStatus" = CASE
  WHEN "quantity" <= 0 THEN 'OUT_OF_STOCK'::"StockStatus"
  WHEN "quantity" <= "low_stock_threshold" THEN 'LOW_STOCK'::"StockStatus"
  ELSE 'IN_STOCK'::"StockStatus"
END;

UPDATE "public"."products" SET "stockStatus" = CASE
  WHEN "total_stock" <= 0 THEN 'OUT_OF_STOCK'::"StockStatus"
  WHEN "total_stock" <= "low_stock_threshold" THEN 'LOW_STOCK'::"StockStatus"
  ELSE 'IN_STOCK'::"StockStatus"
END;
