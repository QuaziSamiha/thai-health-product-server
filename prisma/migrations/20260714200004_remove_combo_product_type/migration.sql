-- Removes COMBO from the ProductType enum. Product.type is only ever
-- SIMPLE or VARIABLE going forward; the separate ComboProduct/ComboItem
-- bundling feature is unaffected — it never referenced this enum value.
BEGIN;
CREATE TYPE "ProductType_new" AS ENUM ('SIMPLE', 'VARIABLE');
ALTER TABLE "products" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "products" ALTER COLUMN "type" TYPE "ProductType_new" USING ("type"::text::"ProductType_new");
ALTER TYPE "ProductType" RENAME TO "ProductType_old";
ALTER TYPE "ProductType_new" RENAME TO "ProductType";
DROP TYPE "ProductType_old";
ALTER TABLE "products" ALTER COLUMN "type" SET DEFAULT 'SIMPLE';
COMMIT;
