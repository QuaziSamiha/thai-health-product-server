-- categories."productCount" stops being dead data.
--
-- The column has existed since 20260509110031_init_category_model, is
-- selected by three projections (CATEGORY_SELECT, HOME_ROOT_CATEGORY_SELECT
-- and the as-yet-unwired customer DTO) and is rendered on the storefront and
-- on the home-page "shop by category" card — but no code path in src/ has
-- ever written it, so every category has shipped `productCount: 0` forever.
--
-- ── What the number means ──────────────────────────────────────────────────
-- productCount = how many products a shopper standing on this category can
-- reach, counting the whole subtree below it:
--
--   * a leaf category  -> its own directly-filed products
--   * a level-1 node   -> its own products + every descendant's
--   * a root category  -> the union across all of its sub-categories.
--                         A root can never hold products directly
--                         (CategoryService.assertCategoryAssignableToProduct
--                         rejects level 0), so a root's number is purely the
--                         rollup — which is exactly what the home-page card
--                         wants to display.
--
-- "Product" here means *sellable*: status = 'ACTIVE' AND deleted_at IS NULL.
-- That is character-for-character ProductRepository.activeVisibilityWhere(),
-- the gate every public product read already applies, so the count can never
-- promise more rows than the listing behind it returns. Note what is
-- deliberately NOT in the predicate:
--
--   * published_at — excluded there, so excluded here (see that method's
--     comment: the storefront shows active products regardless of schedule).
--   * the category's OWN status — a DRAFT/ARCHIVED sub-category still
--     contributes its active products to its ancestors' totals. The counter
--     is read by the ADMIN projection too, where "this branch holds 12 live
--     products" is exactly what an admin needs to see before archiving or
--     re-parenting it. Gating on the ancestor chain's status would also mean
--     every category status flip had to re-tally an arbitrary subtree, and
--     would zero out the number on the very screen an admin consults it on.
--
-- ── Why a trigger and not app code ─────────────────────────────────────────
-- Same reasoning as combo_quantity / total_stock / stock_status: a counter
-- maintained in ProductService would have to be remembered by every current
-- and future write path (create, update, category move, status flip, soft
-- delete, hard delete, seeds, one-off SQL fixes) and would silently drift the
-- first time one of them forgot. In the database it is not forgettable.

-- ─────────────────────────────────────────────────────────────────────────
-- Single source of truth.
--
-- Given a set of SEED categories (the ones whose own direct product tally
-- may have moved), rewrite the stored count of every category whose rollup
-- that could affect — each seed plus its entire ancestor chain — by
-- re-counting that node's whole subtree from scratch.
--
-- Recomputing rather than incrementing (+1/-1) is deliberate: an increment is
-- only correct if it is applied exactly once per event, which is impossible
-- to guarantee across re-parenting, cascades and manual SQL, whereas a full
-- re-count is idempotent and self-healing — run it twice, or after arbitrary
-- drift, and the answer is still right.
--
-- Both walks use UNION, not UNION ALL: the dedup is what makes them
-- terminate if a parent cycle ever gets stored (nothing prevents A -> B -> A
-- today — see the "Nothing prevents a cycle" gap in docs/category.md). A
-- cycle would make the numbers meaningless, but it will not hang a write.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_category_product_count(p_category_ids int[])
 RETURNS void
 LANGUAGE sql
AS $function$
  WITH RECURSIVE affected AS (
    -- The seeds themselves...
    SELECT c."id", c."parentId"
    FROM "public"."categories" c
    WHERE c."id" = ANY(p_category_ids)
    UNION
    -- ...then walk UP: every ancestor's rollup contains the seed's products.
    SELECT parent."id", parent."parentId"
    FROM "public"."categories" parent
    JOIN affected a ON parent."id" = a."parentId"
  ),
  subtree AS (
    -- For each affected node, walk DOWN to every category it rolls up.
    SELECT a."id" AS root_id, a."id" AS node_id FROM affected a
    UNION
    SELECT s.root_id, child."id"
    FROM "public"."categories" child
    JOIN subtree s ON child."parentId" = s.node_id
  ),
  -- Take every row lock this call needs up front, in one deterministic order
  -- (ascending id). Two concurrent product writes in different branches of
  -- the same tree recompute overlapping ancestor sets; without a fixed
  -- acquisition order they could grab the same two ancestors in opposite
  -- orders and deadlock. MATERIALIZED is required — an ordinary CTE that the
  -- planner inlines (or prunes as unreferenced) would take no locks at all.
  locked AS MATERIALIZED (
    SELECT c."id"
    FROM "public"."categories" c
    WHERE c."id" IN (SELECT s.root_id FROM subtree s)
    ORDER BY c."id"
    FOR NO KEY UPDATE
  ),
  tally AS (
    -- LEFT JOIN, so a node whose whole subtree is empty tallies 0 rather than
    -- dropping out of the result and keeping a stale value.
    SELECT s.root_id, COUNT(p."id")::int AS product_count
    FROM subtree s
    LEFT JOIN "public"."products" p
      ON p."category_id" = s.node_id
     AND p."status" = 'ACTIVE'
     AND p."deleted_at" IS NULL
    GROUP BY s.root_id
  )
  UPDATE "public"."categories" c
  SET "productCount" = t.product_count
  FROM tally t
  WHERE c."id" = t.root_id
    AND c."id" IN (SELECT l."id" FROM locked l)
    -- Skip no-op writes: they would burn a dead tuple and hold a lock for
    -- nothing in the common case where the tally has not actually moved.
    AND c."productCount" IS DISTINCT FROM t.product_count;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- Fan-in 1/2 — the products side.
--
-- A product enters or leaves a tally on four kinds of event: INSERT, DELETE,
-- a category_id move, and a visibility change (status, or deleted_at going
-- non-null via ProductRepository.softDeleteProduct — which also flips status
-- to ARCHIVED today, but deleted_at is listed anyway so the counter cannot be
-- broken by a future soft delete that leaves status alone).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_category_product_count_from_products()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_counted_before boolean := false;
  v_counts_now     boolean := false;
  v_ids            int[]   := ARRAY[]::int[];
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_counted_before := OLD."status" = 'ACTIVE' AND OLD."deleted_at" IS NULL;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_counts_now := NEW."status" = 'ACTIVE' AND NEW."deleted_at" IS NULL;
  END IF;

  -- Invisible before, invisible after (DRAFT -> ARCHIVED, editing an already
  -- soft-deleted row, hard-deleting a draft...): no tally can have moved.
  IF NOT v_counted_before AND NOT v_counts_now THEN
    RETURN NULL;
  END IF;

  -- Visible before AND after, same category: an edit to price/copy/stock.
  -- Postgres fires `UPDATE OF <cols>` on a column's presence in the SET list,
  -- not on a real value change, and ProductService sends the whole DTO — so
  -- every ordinary product edit lands here. Cheapest exit for the hot path.
  IF TG_OP = 'UPDATE' AND v_counted_before AND v_counts_now
     AND OLD."category_id" = NEW."category_id" THEN
    RETURN NULL;
  END IF;

  -- Only sides that actually count are seeded. On a category move both are,
  -- which re-tallies the branch it left and the one it joined in one call.
  IF v_counted_before THEN
    v_ids := v_ids || OLD."category_id";
  END IF;
  IF v_counts_now THEN
    v_ids := v_ids || NEW."category_id";
  END IF;

  PERFORM public.recompute_category_product_count(v_ids);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_category_product_count_from_products ON public.products;
CREATE TRIGGER trg_sync_category_product_count_from_products
  AFTER INSERT OR DELETE OR UPDATE OF category_id, status, deleted_at ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_category_product_count_from_products();

-- ─────────────────────────────────────────────────────────────────────────
-- Fan-in 2/2 — the categories side.
--
-- Re-parenting moves a whole subtree's products from one ancestor chain to
-- another without a single products row changing. The moved node's OWN number
-- is unaffected (its subtree travels with it) — what changes is the chain it
-- left and the chain it joined, and seeding the two parents makes recompute
-- walk up both.
--
-- INSERT needs no handling: a brand-new category has no products and no
-- children, so it contributes 0 to every ancestor, which is what they already
-- hold. Children only ever arrive by a later re-parent, i.e. through this
-- same trigger.
--
-- DELETE is a no-op under today's FK rules (NO ACTION from children +
-- RESTRICT from products means a deletable category is provably empty), and
-- is wired anyway so that relaxing either rule — or adding the status/delete
-- cascade the module currently lacks — cannot silently strand an ancestor.
--
-- No recursion risk: recompute_category_product_count writes "productCount"
-- and nothing else, and this trigger only fires on "parentId".
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_category_product_count_from_move()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_category_product_count(
      ARRAY_REMOVE(ARRAY[OLD."parentId"], NULL)
    );
    RETURN NULL;
  END IF;

  -- `UPDATE OF "parentId"` fires whenever the column is in the SET list, so a
  -- re-save of the same parent gets here; only a real move needs work.
  IF OLD."parentId" IS NOT DISTINCT FROM NEW."parentId" THEN
    RETURN NULL;
  END IF;

  -- ARRAY_REMOVE drops the NULL when either end of the move is a root
  -- (promoting to root, or filing a former root under a parent): a root has
  -- no ancestors to re-tally on that side.
  PERFORM public.recompute_category_product_count(
    ARRAY_REMOVE(ARRAY[OLD."parentId", NEW."parentId"], NULL)
  );
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_category_product_count_from_move ON public.categories;
CREATE TRIGGER trg_sync_category_product_count_from_move
  AFTER DELETE OR UPDATE OF "parentId" ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.sync_category_product_count_from_move();

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Every existing row reads 0 and almost none of them should. Seeding with
-- every category id makes `affected` the whole table, so this one call
-- rewrites the entire tree.
SELECT public.recompute_category_product_count(
  ARRAY(SELECT "id" FROM "public"."categories")
);
