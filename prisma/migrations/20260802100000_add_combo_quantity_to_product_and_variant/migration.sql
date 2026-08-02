-- Adds combo_quantity to products and product_variants: how many units of the
-- row go into a combo. Prefills ComboItem.quantity when the product/variant is
-- bundled; ComboItem.quantity remains the authoritative per-combo value.
-- A variant's own combo_quantity wins over its parent product's whenever a
-- ComboItem pins a variant.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "combo_quantity" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "combo_quantity" INTEGER NOT NULL DEFAULT 1;

-- Bundling zero or a negative number of units is meaningless, so the floor is
-- 1 rather than 0. Mirrors the non-negative stock/price guards added in
-- `20260714200001_backfill_stock_price_check_constraints`.
ALTER TABLE "public"."products" ADD CONSTRAINT "products_combo_quantity_positive" CHECK ("combo_quantity" > 0);
ALTER TABLE "public"."product_variants" ADD CONSTRAINT "product_variants_combo_quantity_positive" CHECK ("combo_quantity" > 0);
