-- products.stock_status alone is low-cardinality (3 values) and rarely
-- selective enough for the planner to prefer over a sequential scan.
-- Replaced with a composite led by `status`, matching the actual admin
-- dashboard query shape ("active products that are low/out of stock").
-- product_variants gets the analogous composite led by `product_id`, since
-- variant queries are always scoped to a product first.

-- DropIndex
DROP INDEX "products_stock_status_idx";

-- CreateIndex
CREATE INDEX "product_variants_product_id_stock_status_idx" ON "product_variants"("product_id", "stock_status");

-- CreateIndex
CREATE INDEX "products_status_stock_status_idx" ON "products"("status", "stock_status");
