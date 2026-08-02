-- Combo tables had no CHECK constraints at all, while products/product_variants/
-- batches have been covered since `20260714200001_backfill_stock_price_check_
-- constraints`. Same defense-in-depth rationale and the same
-- `<table>_<field>_<rule>` naming.
--
-- NOTE ON COLUMN NAMES: "unitPrice", "comboPrice" and "totalPrice" carry no
-- @map() in the Prisma schema, so their real column names are camelCase and
-- MUST be quoted — exactly like "basePrice"/"salePrice" in the products
-- constraints. Only starts_at/ends_at/cost_price are snake_case here.

ALTER TABLE "public"."combo_items"
  ADD CONSTRAINT "combo_items_quantity_positive" CHECK ("quantity" > 0);
--* STRICTLY POSITIVE, NOT >= 0: A BUNDLED ITEM WITH QUANTITY 0 IS NOT A
--* CHEAPER BUNDLE, IT IS A ROW THAT SHOULD NOT EXIST — AND IT WOULD MAKE THE
--* AVAILABILITY DIVISOR IN recompute_combo_quantity MEANINGLESS.
ALTER TABLE "public"."combo_items"
  ADD CONSTRAINT "combo_items_unit_price_non_negative" CHECK ("unitPrice" IS NULL OR "unitPrice" >= 0::numeric);

ALTER TABLE "public"."combo_products"
  ADD CONSTRAINT "combo_products_combo_price_non_negative" CHECK ("comboPrice" >= 0::numeric);
ALTER TABLE "public"."combo_products"
  ADD CONSTRAINT "combo_products_total_price_non_negative" CHECK ("totalPrice" >= 0::numeric);

-- The bundle must never cost more than the sum of its parts — that is the
-- whole premise of a combo. Already enforced in ComboProductService
-- ("Combo price cannot be greater than the sum of its bundled items"); this
-- is the DB-level backstop, mirroring how products_sale_price_valid backs up
-- the app's salePrice <= basePrice rule.
ALTER TABLE "public"."combo_products"
  ADD CONSTRAINT "combo_products_price_valid" CHECK ("comboPrice" <= "totalPrice");

-- A promotion whose window ends before it begins is never live. The create
-- DTO already rejects this via @IsAfter('startsAt') on endsAt; this closes
-- the paths validation does not cover — a future update endpoint that moves
-- only startsAt, a seed script, or a manual SQL fix.
ALTER TABLE "public"."combo_products"
  ADD CONSTRAINT "combo_products_window_valid" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at");

-- Beyond the reviewed set: these two columns were added earlier today
-- (20260802140000 / 20260802170000) so the review predates them. `quantity`
-- is the direct analogue of products_quantity_non_negative, which already
-- exists; it is trigger-derived and can only be >= 0, so this pins that
-- invariant rather than trusting the trigger alone.
ALTER TABLE "public"."combo_products"
  ADD CONSTRAINT "combo_products_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "public"."combo_products"
  ADD CONSTRAINT "combo_products_cost_price_non_negative" CHECK ("cost_price" IS NULL OR "cost_price" >= 0::numeric);
