-- discountValue previously had no DB-level bound tied to discountType — the
-- 0-100 (PERCENTAGE) / <= basePrice (FIXED) rule lived only in app code
-- (ProductService.resolveSalePrice). Defense-in-depth, matching the
-- products_sale_price_valid / product_variants_sale_price_valid pattern
-- from `20260714200001_backfill_stock_price_check_constraints`.

ALTER TABLE "public"."products" ADD CONSTRAINT "products_discount_value_valid" CHECK (
  "discountValue" IS NULL
  OR (
    "discountValue" >= 0::numeric
    AND (
      ("discountType" = 'PERCENTAGE'::"DiscountType" AND "discountValue" <= 100::numeric)
      OR ("discountType" = 'FIXED'::"DiscountType" AND "discountValue" <= "basePrice")
    )
  )
);

ALTER TABLE "public"."product_variants" ADD CONSTRAINT "product_variants_discount_value_valid" CHECK (
  "discountValue" IS NULL
  OR (
    "discountValue" >= 0::numeric
    AND (
      ("discountType" = 'PERCENTAGE'::"DiscountType" AND "discountValue" <= 100::numeric)
      OR ("discountType" = 'FIXED'::"DiscountType" AND "discountValue" <= "basePrice")
    )
  )
);
