-- Backfill migration: reconstructs a migration that was applied directly to
-- the dev database (originally named `make_sale_price_required`) but whose
-- migration file was missing from this directory, causing drift.
-- NOT executed against the dev DB (registered via `prisma migrate resolve
-- --applied`) since the column already has this shape there.

-- AlterTable
ALTER TABLE "public"."product_variants" ALTER COLUMN "salePrice" SET NOT NULL,
ALTER COLUMN "salePrice" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."products" ALTER COLUMN "salePrice" SET NOT NULL,
ALTER COLUMN "salePrice" SET DEFAULT 0;
