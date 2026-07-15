-- Backfill existing rows with no discountType before enforcing NOT NULL —
-- "no discount configured" now means discountType = PERCENTAGE with a null
-- discountValue, rather than a null discountType.
UPDATE "public"."products" SET "discountType" = 'PERCENTAGE' WHERE "discountType" IS NULL;
UPDATE "public"."product_variants" SET "discountType" = 'PERCENTAGE' WHERE "discountType" IS NULL;

-- AlterTable
ALTER TABLE "public"."products" ALTER COLUMN "discountType" SET NOT NULL,
ALTER COLUMN "discountType" SET DEFAULT 'PERCENTAGE';

-- AlterTable
ALTER TABLE "public"."product_variants" ALTER COLUMN "discountType" SET NOT NULL,
ALTER COLUMN "discountType" SET DEFAULT 'PERCENTAGE';
