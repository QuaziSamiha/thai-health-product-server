-- Replaces two indexes that between them did not match the storefront's
-- listing predicate with one partial index that mirrors it:
--
--   WHERE deleted_at IS NULL
--     AND status = 'ACTIVE'
--     AND (starts_at IS NULL OR starts_at <= now())
--     AND (ends_at   IS NULL OR ends_at   >= now())
--
-- What was wrong with the old pair:
--   * combo_products_status_isFeatured_idx knew nothing about deleted_at, so
--     every soft-deleted combo still occupied index entries the listing can
--     never return.
--   * combo_products_starts_at_ends_at_idx could range-scan starts_at and then
--     had to recheck ends_at as a heap predicate — for a two-sided window the
--     second column contributes almost nothing.
--
-- Column order is deliberate: equality predicates (status, "isFeatured") lead
-- so they can be probed, ranges (starts_at, ends_at) trail. The WHERE clause
-- keeps soft-deleted rows out of the index entirely, which is also why Prisma's
-- schema DSL cannot express it — same hand-written treatment as
-- product_images_one_primary_per_product and combo_items_unique_without_variant.
--
-- NOTE ON COLUMN NAMES: "isFeatured" has no @map() in the Prisma schema, so its
-- real column name is camelCase and must be quoted. Only starts_at/ends_at/
-- deleted_at are snake_case on this table.
--
-- Honest scope: combo_products is a low-cardinality table (tens to low hundreds
-- of rows) and Postgres will correctly seq-scan it for the foreseeable future.
-- This is hygiene and future-proofing, not a measurable speedup today. The
-- window predicate above is not even implemented yet — findActiveCombosForHome
-- currently filters on deleted_at/status only.

-- DropIndex
DROP INDEX "public"."combo_products_status_isFeatured_idx";
DROP INDEX "public"."combo_products_starts_at_ends_at_idx";

-- CreateIndex
CREATE INDEX "combo_products_live_idx"
  ON "public"."combo_products" ("status", "isFeatured", "starts_at", "ends_at")
  WHERE "deleted_at" IS NULL;
