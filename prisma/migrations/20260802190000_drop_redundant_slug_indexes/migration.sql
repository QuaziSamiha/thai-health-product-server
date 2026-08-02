-- `slug` is declared @unique on both models, and a unique constraint is backed
-- by its own btree index. The separate @@index([slug]) therefore indexed the
-- exact same column with the same access method: no query can be served by it
-- that combo_products_slug_key / categories_slug_key does not already serve,
-- while every INSERT/UPDATE/DELETE had to maintain both trees.
--
-- Note: blogs_slug_idx and support_pages_slug_idx are redundant in exactly the
-- same way and are deliberately left in place here — out of scope for this
-- change.

-- DropIndex
DROP INDEX "public"."combo_products_slug_idx";
DROP INDEX "public"."categories_slug_idx";
