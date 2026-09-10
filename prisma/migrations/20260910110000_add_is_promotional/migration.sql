-- `is_promotional` is a marketing placement flag, and it sits on BOTH
-- `products` and `product_variants` because those are two independently
-- merchandisable things: a VARIABLE product can be promoted as a whole, or a
-- single size/flavour can be pushed on its own while the rest of the range
-- stays ordinary. Neither column is derived from the other — a promoted
-- product does not promote its variants, and a promoted variant does not
-- promote its parent.
--
-- What it is NOT:
--
--   * It is not a discount. The pricing block (`discount_type`,
--     `discount_value`, `sale_price`) still decides what a buyer pays; this
--     column only decides where the row is shown. A promoted row at full
--     price is a valid state.
--   * It is not `is_featured`. Featured drives the homepage
--     (`products_status_is_featured_idx`); promotional is a separate lane, so
--     the two can be set in any combination.
--
-- NOT NULL DEFAULT false: every existing row is non-promotional until an
-- admin says otherwise, which is also the default for rows created from now
-- on. Postgres 11+ stores this default in the catalogue rather than rewriting
-- the table, so neither ALTER needs a full-table rewrite.
ALTER TABLE "public"."products"
  ADD COLUMN "is_promotional" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "public"."product_variants"
  ADD COLUMN "is_promotional" BOOLEAN NOT NULL DEFAULT false;
