-- How many bundles the admin chose to put on sale.
--
-- combo_products.quantity is fully derived (MIN over items, maintained by the
-- trigger family from 20260802140000) and is recomputed on every stock or item
-- change — so it cannot also carry an admin-entered number without silently
-- erasing it. This column holds the admin's intent alongside it:
--
--   effective sellable bundles = MIN(quantity, COALESCE(offered_quantity, quantity))
--
-- NULL means "no cap — sell whatever stock allows".
--
-- Deliberately NO cross-column CHECK (offered_quantity <= quantity): the two
-- are only required to satisfy that relationship at the moment an admin sets
-- it. Stock legitimately falls afterwards, which would turn such a constraint
-- into a landmine that blocks unrelated UPDATEs on the row (and would be
-- violated by the availability triggers themselves). The <= rule is enforced
-- at the API boundary in ComboProductService instead.

-- AlterTable
ALTER TABLE "public"."combo_products" ADD COLUMN "offered_quantity" INTEGER;

-- A cap of zero is not "sell none", it is a mistake — an unsellable combo is
-- expressed with status, not with a zero cap.
ALTER TABLE "public"."combo_products"
  ADD CONSTRAINT "combo_products_offered_quantity_positive"
  CHECK ("offered_quantity" IS NULL OR "offered_quantity" >= 1);
