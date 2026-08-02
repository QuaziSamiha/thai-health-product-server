-- Normalizes the last camelCase columns in the codebase to snake_case,
-- finishing what 20260719130000_snake_case_product_columns and
-- 20260723094500_snake_case_inventory_batch_columns started. combo_products
-- was the worst case: half its columns were already mapped (starts_at,
-- created_at, stock_status, cost_price, low_stock_threshold) while the other
-- half were not, so raw SQL against one table needed quoted mixed-case
-- identifiers for some columns and bare ones for others. combo_images had no
-- mapping at all, unlike its twin product_images.
--
-- RENAME COLUMN preserves data and auto-updates dependent indexes, unique
-- constraints, CHECK constraints and trigger column lists. What it does NOT
-- update is plpgsql FUNCTION BODIES, which store column names as plain text —
-- that is exactly how 20260719130000 silently broke
-- sync_product_total_stock_from_variants and required the hotfix in
-- 20260719190000. Verified before writing this migration: none of the eight
-- functions in this database (the three product/variant stock-sync functions
-- and the five combo availability functions) reference ANY column renamed
-- below. The combo trigger family only touches quantity, combo_id,
-- product_id, variant_id, stock_status, low_stock_threshold and id — all of
-- which keep their names. No function needs rewriting here.

-- AlterTable: combo_products
ALTER TABLE "public"."combo_products" RENAME COLUMN "shortDescription" TO "short_description";
ALTER TABLE "public"."combo_products" RENAME COLUMN "titleTh" TO "title_th";
ALTER TABLE "public"."combo_products" RENAME COLUMN "shortDescTh" TO "short_desc_th";
ALTER TABLE "public"."combo_products" RENAME COLUMN "descriptionTh" TO "description_th";
ALTER TABLE "public"."combo_products" RENAME COLUMN "totalPrice" TO "total_price";
ALTER TABLE "public"."combo_products" RENAME COLUMN "comboPrice" TO "combo_price";
ALTER TABLE "public"."combo_products" RENAME COLUMN "isFeatured" TO "is_featured";
ALTER TABLE "public"."combo_products" RENAME COLUMN "seoMetadata" TO "seo_metadata";

-- AlterTable: combo_items
ALTER TABLE "public"."combo_items" RENAME COLUMN "unitPrice" TO "unit_price";
ALTER TABLE "public"."combo_items" RENAME COLUMN "displayOrder" TO "display_order";

-- AlterTable: combo_images
ALTER TABLE "public"."combo_images" RENAME COLUMN "thumbnailUrl" TO "thumbnail_url";
ALTER TABLE "public"."combo_images" RENAME COLUMN "bannerUrl" TO "banner_url";
ALTER TABLE "public"."combo_images" RENAME COLUMN "iconUrl" TO "icon_url";
ALTER TABLE "public"."combo_images" RENAME COLUMN "altText" TO "alt_text";
ALTER TABLE "public"."combo_images" RENAME COLUMN "displayOrder" TO "display_order";
ALTER TABLE "public"."combo_images" RENAME COLUMN "isPrimary" TO "is_primary";
ALTER TABLE "public"."combo_images" RENAME COLUMN "isActive" TO "is_active";

-- The index and CHECK constraints created earlier today referenced
-- "isFeatured"/"comboPrice"/"totalPrice"/"unitPrice" by name; Postgres tracks
-- them by attribute number, so combo_products_live_idx,
-- combo_products_price_valid, combo_products_combo_price_non_negative,
-- combo_products_total_price_non_negative and
-- combo_items_unit_price_non_negative all follow the rename automatically.
-- No DROP/CREATE needed — verified after applying.
