-- combo_items.unit_price is documented as a "snapshot price at time of
-- bundling", but nothing recorded *when* that snapshot was taken. During a
-- price dispute there was no way to tell a two-day-old snapshot from a
-- two-year-old one.
--
-- Why priced_at and not created_at/updated_at: updated_at moves on ANY column
-- change — a display_order reshuffle or a per-bundle quantity edit would reset
-- it and destroy the very fact being recorded. priced_at moves if and only if
-- unit_price actually changes value.

-- AlterTable
ALTER TABLE "public"."combo_items" ADD COLUMN "priced_at" TIMESTAMPTZ(3);

-- Backfill: the best available evidence of when an existing item was priced is
-- when its combo was created, since no update path has ever re-priced an item
-- (createComboProduct is currently the only writer). Rows with a NULL
-- unit_price stay NULL — there is no price, so there is no pricing date.
UPDATE "public"."combo_items" ci
SET "priced_at" = cp."created_at"
FROM "public"."combo_products" cp
WHERE cp."id" = ci."combo_id" AND ci."unit_price" IS NOT NULL;

-- Kept in the database rather than the service so no write path can bypass it:
-- a seed script, a manual SQL correction, or a future update endpoint that
-- forgets would otherwise leave priced_at lying. Same rationale as the combo
-- availability trigger family (20260802140000).
--
-- IS DISTINCT FROM (not <>) so NULL→value and value→NULL transitions both
-- count as a change; plain <> yields NULL when either side is NULL and the
-- branch would silently not fire.
CREATE OR REPLACE FUNCTION public.sync_combo_item_priced_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW."unit_price" IS DISTINCT FROM OLD."unit_price" THEN
    NEW."priced_at" := CASE WHEN NEW."unit_price" IS NULL THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END;
$function$;

-- UPDATE OF unit_price keeps this off the hot path: reordering items or
-- changing a per-bundle quantity never fires it. The IS DISTINCT FROM guard
-- above then also ignores an UPDATE that writes the same price back.
CREATE TRIGGER trg_sync_combo_item_priced_at
  BEFORE INSERT OR UPDATE OF unit_price ON public.combo_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_combo_item_priced_at();
