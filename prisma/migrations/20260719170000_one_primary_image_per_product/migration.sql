-- Partial unique index: at most one product_images row per product can have
-- is_primary = true. Prisma's schema DSL has no way to express a filtered
-- (WHERE-clause) unique index, so this is hand-written, same as the
-- stock-sync triggers. Verified no existing product has more than one
-- primary image before adding this.
CREATE UNIQUE INDEX "product_images_one_primary_per_product"
  ON "public"."product_images" ("product_id")
  WHERE "is_primary" = true;
