-- inventory_recordedBy_fkey was created ON DELETE CASCADE, unlike every other
-- audit-actor relation in this schema (Product.createdBy/updatedBy/deletedBy,
-- Category, Combo, Home, Support all use SET NULL). Deleting a staff/admin
-- user must not wipe out the inventory ledger rows they recorded.
ALTER TABLE "public"."inventory" DROP CONSTRAINT "inventory_recordedBy_fkey";

ALTER TABLE "public"."inventory" ADD CONSTRAINT "inventory_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
