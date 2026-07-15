-- Backfill migration: reconstructs a migration that was applied directly to
-- the dev database (originally named `add_stock_price_check_constraints`)
-- but whose migration file was missing from this directory, causing drift.
-- Reconstructed from the live database's actual constraint definitions.
-- NOT executed against the dev DB (registered via `prisma migrate resolve
-- --applied`) since the constraints already exist there.

-- AlterTable
ALTER TABLE "public"."products" ADD CONSTRAINT "products_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "public"."products" ADD CONSTRAINT "products_total_stock_non_negative" CHECK ("total_stock" >= 0);
ALTER TABLE "public"."products" ADD CONSTRAINT "products_base_price_non_negative" CHECK ("basePrice" >= 0::numeric);
ALTER TABLE "public"."products" ADD CONSTRAINT "products_sale_price_valid" CHECK ("salePrice" >= 0::numeric AND "salePrice" <= "basePrice");

ALTER TABLE "public"."product_variants" ADD CONSTRAINT "product_variants_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "public"."product_variants" ADD CONSTRAINT "product_variants_base_price_non_negative" CHECK ("basePrice" >= 0::numeric);
ALTER TABLE "public"."product_variants" ADD CONSTRAINT "product_variants_sale_price_valid" CHECK ("salePrice" >= 0::numeric AND "salePrice" <= "basePrice");
