-- Normalizes every remaining camelCase column in batches and inventory to
-- snake_case, matching the convention already applied to
-- products/product_variants/product_images by
-- 20260719130000_snake_case_product_columns. RENAME COLUMN preserves data
-- and auto-updates dependent indexes/constraints internally, but their NAMES
-- stay camelCase-derived unless renamed explicitly (same gap fixed for
-- products by 20260719160000_rename_product_fk_index_names) — both are done
-- together here so no follow-up drift is left behind.
-- No trigger function bodies reference batches/inventory columns as text,
-- so nothing else needs updating.

-- AlterTable: batches
ALTER TABLE "public"."batches" RENAME COLUMN "batchNo" TO "batch_no";
ALTER TABLE "public"."batches" RENAME COLUMN "costPrice" TO "cost_price";
ALTER TABLE "public"."batches" RENAME COLUMN "manufacturingDate" TO "manufacturing_date";
ALTER TABLE "public"."batches" RENAME COLUMN "expiryDate" TO "expiry_date";
ALTER TABLE "public"."batches" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "public"."batches" RENAME COLUMN "updatedAt" TO "updated_at";
ALTER TABLE "public"."batches" RENAME COLUMN "productId" TO "product_id";
ALTER TABLE "public"."batches" RENAME COLUMN "variantId" TO "variant_id";

-- AlterTable: inventory
ALTER TABLE "public"."inventory" RENAME COLUMN "changeType" TO "change_type";
ALTER TABLE "public"."inventory" RENAME COLUMN "referenceId" TO "reference_id";
ALTER TABLE "public"."inventory" RENAME COLUMN "costPrice" TO "cost_price";
ALTER TABLE "public"."inventory" RENAME COLUMN "sellingPrice" TO "selling_price";
ALTER TABLE "public"."inventory" RENAME COLUMN "recordedAt" TO "recorded_at";
ALTER TABLE "public"."inventory" RENAME COLUMN "productId" TO "product_id";
ALTER TABLE "public"."inventory" RENAME COLUMN "variantId" TO "variant_id";
ALTER TABLE "public"."inventory" RENAME COLUMN "recordedBy" TO "recorded_by";

-- RenameIndex: batches
ALTER INDEX "public"."batches_batchNo_key" RENAME TO "batches_batch_no_key";
ALTER INDEX "public"."batches_productId_idx" RENAME TO "batches_product_id_idx";
ALTER INDEX "public"."batches_variantId_idx" RENAME TO "batches_variant_id_idx";

-- RenameForeignKey: batches
ALTER TABLE "public"."batches" RENAME CONSTRAINT "batches_productId_fkey" TO "batches_product_id_fkey";
ALTER TABLE "public"."batches" RENAME CONSTRAINT "batches_variantId_fkey" TO "batches_variant_id_fkey";

-- RenameIndex: inventory
ALTER INDEX "public"."inventory_productId_idx" RENAME TO "inventory_product_id_idx";
ALTER INDEX "public"."inventory_variantId_idx" RENAME TO "inventory_variant_id_idx";
ALTER INDEX "public"."inventory_changeType_idx" RENAME TO "inventory_change_type_idx";

-- RenameForeignKey: inventory
ALTER TABLE "public"."inventory" RENAME CONSTRAINT "inventory_productId_fkey" TO "inventory_product_id_fkey";
ALTER TABLE "public"."inventory" RENAME CONSTRAINT "inventory_variantId_fkey" TO "inventory_variant_id_fkey";
ALTER TABLE "public"."inventory" RENAME CONSTRAINT "inventory_recordedBy_fkey" TO "inventory_recorded_by_fkey";
