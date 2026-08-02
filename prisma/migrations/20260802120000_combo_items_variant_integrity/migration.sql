-- Partial unique index: a combo may bundle a given product at most once
-- *without* a pinned variant. The model-level @@unique([comboId, productId,
-- variantId]) only covers rows where variant_id IS NOT NULL, because Postgres
-- treats every NULL as distinct from every other NULL in a unique index — so
-- simple-type products (exactly the variant_id IS NULL case) had no duplicate
-- protection at all. Prisma's schema DSL has no way to express a filtered
-- unique index, so this is hand-written, same as
-- product_images_one_primary_per_product. Verified no combo currently has
-- duplicate NULL-variant rows before adding this.
CREATE UNIQUE INDEX "combo_items_unique_without_variant"
  ON "public"."combo_items" ("combo_id", "product_id")
  WHERE "variant_id" IS NULL;

-- ON DELETE SET NULL rewrote a pinned combo item ("Product A / 500ml") into a
-- generic one ("Product A") whenever the variant was deleted, silently
-- changing what the combo contains — and, with the index above in place, it
-- could also collide with an existing NULL-variant row for the same product.
-- RESTRICT matches combo_items_product_id_fkey: a bundled variant, like a
-- bundled product, cannot be deleted while a combo still references it.
ALTER TABLE "public"."combo_items"
  DROP CONSTRAINT "combo_items_variant_id_fkey";

ALTER TABLE "public"."combo_items"
  ADD CONSTRAINT "combo_items_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
