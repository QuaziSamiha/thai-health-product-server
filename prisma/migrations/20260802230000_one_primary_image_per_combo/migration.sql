-- Partial unique index: at most one combo_images row per combo can have
-- is_primary = true. Mirrors product_images_one_primary_per_combo's twin,
-- product_images_one_primary_per_product (20260719170000) — ComboImage has
-- isPrimary with identical semantics but had no guard, so a combo could hold
-- three primaries and the storefront would pick one arbitrarily depending on
-- row order.
--
-- Prisma's schema DSL has no way to express a filtered (WHERE-clause) unique
-- index, so this is hand-written, same as the stock-sync triggers and
-- combo_items_unique_without_variant. Verified combo_images is empty and no
-- combo has more than one primary image before adding this.
--
-- Note this constrains only the "at most one" half. "At least one" is not
-- expressible as an index either (it is a cross-row condition); the service
-- covers it by flagging the first uploaded image as primary.
CREATE UNIQUE INDEX "combo_images_one_primary_per_combo"
  ON "public"."combo_images" ("combo_id")
  WHERE "is_primary" = true;
