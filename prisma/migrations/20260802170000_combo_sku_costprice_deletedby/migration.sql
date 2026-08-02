-- A combo is its own sellable unit, so it needs the same identity and audit
-- surface a Product has:
--
--   sku / barcode  — ops, accounting, exports and any ERP integration identify
--                    a bundle by its own SKU, not by its parts'. Nullable and
--                    unique, matching products/product_variants exactly, so a
--                    single lookup works across all three tables.
--   cost_price     — landed cost of the bundle for margin reporting against
--                    combo_price. Entered rather than summed from items: a
--                    bundle carries its own packaging/assembly cost.
--   deleted_by     — combo_products had created_by/updated_by but no deleted_by,
--                    so a soft delete recorded *when* but not *who*. products
--                    has all three (see Product in prisma/schema/product.prisma).

-- AlterTable
ALTER TABLE "public"."combo_products"
  ADD COLUMN "sku" VARCHAR(100),
  ADD COLUMN "barcode" VARCHAR(100),
  ADD COLUMN "cost_price" DECIMAL(12,2),
  ADD COLUMN "deleted_by" INTEGER;

-- CreateIndex
-- Nullable + unique: Postgres treats NULLs as distinct, so any number of
-- combos may have no SKU. That is the intended behaviour here (unlike
-- combo_items, where the NULL-distinctness was a bug — see migration
-- 20260802120000) because "no SKU assigned yet" is a real state.
CREATE UNIQUE INDEX "combo_products_sku_key" ON "public"."combo_products"("sku");
CREATE UNIQUE INDEX "combo_products_barcode_key" ON "public"."combo_products"("barcode");

-- AddForeignKey
-- SetNull matches created_by/updated_by: deleting the staff account must not
-- delete the combo, and the audit row survives with an unknown actor rather
-- than blocking the user deletion.
ALTER TABLE "public"."combo_products"
  ADD CONSTRAINT "combo_products_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
