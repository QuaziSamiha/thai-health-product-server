-- products.tags is a native Postgres array with no index, so any
-- `tags @> ARRAY[...]` / `tags && ARRAY[...]` filter forces a sequential
-- scan. GIN is the standard index type for array containment/overlap
-- queries on Postgres.
CREATE INDEX "products_tags_gin_idx" ON "public"."products" USING GIN ("tags");
