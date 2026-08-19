-- ============================================================================
-- Storefront-visible coupons: promo_codes.is_public
--
-- Until now a code had exactly one visibility switch, is_active, and it meant
-- "this code works". That is not the same question as "may a customer be shown
-- this code exists" — most codes are handed out deliberately (email campaign,
-- influencer, win-back) and listing every working code would defeat the point
-- of a coupon.
--
-- is_public is that second, independent switch. The storefront listing is
-- is_public AND is_active AND inside the validity window AND not exhausted;
-- redemption itself still only ever goes through the code the customer typed,
-- so publishing changes discovery and nothing else.
--
-- DEFAULT false is load-bearing: every code that already exists was created
-- under the old "nothing is browsable" contract and must stay private until an
-- admin opts it in.
-- ============================================================================

ALTER TABLE "promo_codes"
  ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false;

-- Leading column is is_public because the storefront list is the only query
-- that reads it, and it selects the small minority of rows.
CREATE INDEX "promo_codes_is_public_is_active_idx"
  ON "promo_codes" ("is_public", "is_active");
