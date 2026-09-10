-- `is_best` is an admin-curated "best product" flag, toggled from the product
-- form exactly like `is_featured`. It is NOT a sales ranking — no order data
-- feeds it and nothing computes it; an admin decides. ProductRepository
-- .findBestProducts filters on it (it previously returned every active
-- product, newest first, as a placeholder for a ranking that never existed).
--
-- NOT NULL DEFAULT false: every existing product starts out as not-best.
-- Postgres 11+ keeps the default in the catalogue, so this does not rewrite
-- the table.
ALTER TABLE "public"."products"
  ADD COLUMN "is_best" BOOLEAN NOT NULL DEFAULT false;

-- Same shape as products_status_is_featured_idx: the storefront section asks
-- for status = ACTIVE AND is_best = true.
CREATE INDEX "products_status_is_best_idx"
  ON "public"."products" ("status", "is_best");
