-- Normalizes every remaining camelCase column in products, product_variants,
-- and product_images to snake_case, matching the convention already used
-- consistently by combo_items/combo_products (and partially by these three
-- tables via total_stock/low_stock_threshold/created_at/etc).
-- RENAME COLUMN preserves data and auto-updates dependent indexes, unique
-- constraints and CHECK constraints; only the two stock-sync trigger
-- FUNCTION BODIES below reference column names as plain text and must be
-- updated by hand.

-- AlterTable: products
ALTER TABLE "public"."products" RENAME COLUMN "shortDescription" TO "short_description";
ALTER TABLE "public"."products" RENAME COLUMN "nameTh" TO "name_th";
ALTER TABLE "public"."products" RENAME COLUMN "descriptionTh" TO "description_th";
ALTER TABLE "public"."products" RENAME COLUMN "shortDescTh" TO "short_desc_th";
ALTER TABLE "public"."products" RENAME COLUMN "isFeatured" TO "is_featured";
ALTER TABLE "public"."products" RENAME COLUMN "hasVariants" TO "has_variants";
ALTER TABLE "public"."products" RENAME COLUMN "costPrice" TO "cost_price";
ALTER TABLE "public"."products" RENAME COLUMN "discountType" TO "discount_type";
ALTER TABLE "public"."products" RENAME COLUMN "discountValue" TO "discount_value";
ALTER TABLE "public"."products" RENAME COLUMN "basePrice" TO "base_price";
ALTER TABLE "public"."products" RENAME COLUMN "salePrice" TO "sale_price";
ALTER TABLE "public"."products" RENAME COLUMN "stockStatus" TO "stock_status";
ALTER TABLE "public"."products" RENAME COLUMN "seoMetadata" TO "seo_metadata";
ALTER TABLE "public"."products" RENAME COLUMN "dosageTh" TO "dosage_th";
ALTER TABLE "public"."products" RENAME COLUMN "ingredientsTh" TO "ingredients_th";
ALTER TABLE "public"."products" RENAME COLUMN "healthBenefits" TO "health_benefits";
ALTER TABLE "public"."products" RENAME COLUMN "healthBenefitsTh" TO "health_benefits_th";
ALTER TABLE "public"."products" RENAME COLUMN "warningTh" TO "warning_th";
ALTER TABLE "public"."products" RENAME COLUMN "storageInstructions" TO "storage_instructions";
ALTER TABLE "public"."products" RENAME COLUMN "storageInstructionsTh" TO "storage_instructions_th";
ALTER TABLE "public"."products" RENAME COLUMN "categoryId" TO "category_id";

-- AlterTable: product_variants
ALTER TABLE "public"."product_variants" RENAME COLUMN "shortDescription" TO "short_description";
ALTER TABLE "public"."product_variants" RENAME COLUMN "nameTh" TO "name_th";
ALTER TABLE "public"."product_variants" RENAME COLUMN "descriptionTh" TO "description_th";
ALTER TABLE "public"."product_variants" RENAME COLUMN "shortDescTh" TO "short_desc_th";
ALTER TABLE "public"."product_variants" RENAME COLUMN "stockStatus" TO "stock_status";
ALTER TABLE "public"."product_variants" RENAME COLUMN "costPrice" TO "cost_price";
ALTER TABLE "public"."product_variants" RENAME COLUMN "discountType" TO "discount_type";
ALTER TABLE "public"."product_variants" RENAME COLUMN "discountValue" TO "discount_value";
ALTER TABLE "public"."product_variants" RENAME COLUMN "basePrice" TO "base_price";
ALTER TABLE "public"."product_variants" RENAME COLUMN "salePrice" TO "sale_price";
ALTER TABLE "public"."product_variants" RENAME COLUMN "isDefault" TO "is_default";
ALTER TABLE "public"."product_variants" RENAME COLUMN "productId" TO "product_id";

-- AlterTable: product_images
ALTER TABLE "public"."product_images" RENAME COLUMN "thumbnailUrl" TO "thumbnail_url";
ALTER TABLE "public"."product_images" RENAME COLUMN "bannerUrl" TO "banner_url";
ALTER TABLE "public"."product_images" RENAME COLUMN "iconUrl" TO "icon_url";
ALTER TABLE "public"."product_images" RENAME COLUMN "altText" TO "alt_text";
ALTER TABLE "public"."product_images" RENAME COLUMN "displayOrder" TO "display_order";
ALTER TABLE "public"."product_images" RENAME COLUMN "isPrimary" TO "is_primary";
ALTER TABLE "public"."product_images" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "public"."product_images" RENAME COLUMN "productId" TO "product_id";
ALTER TABLE "public"."product_images" RENAME COLUMN "variantId" TO "variant_id";

-- Trigger column lists (`UPDATE OF ...`) are tracked internally by attribute
-- number, so they survive the renames above untouched. Only the function
-- bodies below reference columns as text and need updating.
CREATE OR REPLACE FUNCTION public.sync_variant_stock_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW."stock_status" := CASE
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
  IF NOT NEW."has_variants" THEN
    NEW."total_stock" := NEW."quantity";
  END IF;
  NEW."stock_status" := CASE
    WHEN NEW."total_stock" <= 0 THEN 'OUT_OF_STOCK'::"StockStatus"
    WHEN NEW."total_stock" <= NEW."low_stock_threshold" THEN 'LOW_STOCK'::"StockStatus"
    ELSE 'IN_STOCK'::"StockStatus"
  END;
  RETURN NEW;
END;
$function$;
