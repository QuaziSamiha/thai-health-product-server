-- Cosmetic-only cleanup: `20260719130000_snake_case_product_columns` renamed
-- the underlying columns to snake_case but left the auto-generated FK
-- constraint and index names carrying the old camelCase-derived text (e.g.
-- "productId", "isPrimary"). Bringing these in line with the columns avoids
-- `prisma migrate dev` reporting drift going forward.

-- RenameForeignKey
ALTER TABLE "product_images" RENAME CONSTRAINT "product_images_productId_fkey" TO "product_images_product_id_fkey";

-- RenameForeignKey
ALTER TABLE "product_images" RENAME CONSTRAINT "product_images_variantId_fkey" TO "product_images_variant_id_fkey";

-- RenameForeignKey
ALTER TABLE "product_variants" RENAME CONSTRAINT "product_variants_productId_fkey" TO "product_variants_product_id_fkey";

-- RenameForeignKey
ALTER TABLE "products" RENAME CONSTRAINT "products_categoryId_fkey" TO "products_category_id_fkey";

-- RenameIndex
ALTER INDEX "product_images_productId_isPrimary_idx" RENAME TO "product_images_product_id_is_primary_idx";

-- RenameIndex
ALTER INDEX "product_images_variantId_idx" RENAME TO "product_images_variant_id_idx";

-- RenameIndex
ALTER INDEX "product_variants_productId_idx" RENAME TO "product_variants_product_id_idx";

-- RenameIndex
ALTER INDEX "product_variants_productId_isDefault_idx" RENAME TO "product_variants_product_id_is_default_idx";

-- RenameIndex
ALTER INDEX "products_categoryId_status_idx" RENAME TO "products_category_id_status_idx";

-- RenameIndex
ALTER INDEX "products_status_isFeatured_idx" RENAME TO "products_status_is_featured_idx";

-- RenameIndex
ALTER INDEX "products_stockStatus_idx" RENAME TO "products_stock_status_idx";
