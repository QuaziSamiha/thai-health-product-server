-- A category may not become its own ancestor.
--
-- `Category.parentId` is a plain nullable self-FK, so Postgres has always been
-- willing to store A -> B -> A. Until now the only guard was
-- `CategoryService.updateCategory`'s `parentId === id` check, which catches the
-- one-node case and nothing longer. A real loop is worse than untidy data: the
-- storefront walks `parentId` upward to build breadcrumbs, `CategoryResponseDto`
-- recurses parent/children, and `recompute_category_product_count` walks the
-- tree in both directions. Every one of those is a non-terminating walk on a
-- cyclic tree, and none of them re-checks.
--
-- `CategoryService.assertNoCycle` now rejects the move up front with a `400`
-- naming the offending path — that is the error an admin should ever see. This
-- trigger sits underneath it and exists for the cases application code cannot
-- cover:
--
--   1. **The race.** The service checks, then writes, in two statements with no
--      lock between them. Two admins re-parenting concurrently (X under Y while
--      Y is moved under X) each pass their own check against a snapshot that
--      does not yet contain the other's edge, and the loop closes on commit.
--      Note this race is NOT closed by the trigger being BEFORE-row: the two
--      statements write different rows and take no conflicting row locks. It is
--      closed by the advisory lock inside the function — see the comment on it,
--      which records what was measured with and without.
--   2. **Everything that is not the service.** Seeds, data fixes, a future
--      bulk-move endpoint, a psql session at 2am.
--
-- Same reasoning as the counter triggers: an invariant that must hold for the
-- data to be readable at all belongs to the data, not to one call path.
--
-- If this trigger ever fires, the request fails as a database error rather than
-- the tidy `400` — by design. Reaching it means the application check was
-- bypassed or lost a race, and a failed write is strictly better than a tree no
-- reader can walk.

-- ─────────────────────────────────────────────────────────────────────────
-- The guard.
--
-- A move is a cycle exactly when the row being written is already an ancestor
-- of (or is) its new parent — the new edge would then point from inside a
-- branch back to its own root. So: walk up from NEW."parentId" and look for
-- NEW."id".
--
-- BEFORE-row, so the loop is refused rather than written and rolled back. The
-- walk reads the table as it stands, which still holds this row's OLD parent —
-- that is harmless, because the search stops the moment it reaches NEW."id",
-- and it can only reach it through edges that already exist.
--
-- The `path` array is what makes this safe to run on a tree that is ALREADY
-- cyclic (see the pre-existing-cycle check at the bottom — this migration
-- reports such rows but cannot invent a correct parent for them). Note that
-- plain `UNION` would not substitute for it here either: it deduplicates whole
-- rows, and any column that varies per hop — a depth counter, the path itself —
-- makes every row unique and the recursion endless.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_category_hierarchy_acyclic()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_would_cycle boolean;
BEGIN
  -- Promoting to root can never close a loop.
  IF NEW."parentId" IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize re-parenting against itself, transaction-scoped.
  --
  -- This is what makes the check a guarantee instead of a good intention, and
  -- it was added only after measuring: two transactions moving DIFFERENT rows
  -- (X under Y while Y is moved under X) take no conflicting row locks, so each
  -- one's trigger reads a snapshot in which the other's edge does not exist yet,
  -- both pass, and the loop closes on commit. Verified: without this line that
  -- race produces a cycle.
  --
  -- Waiting here rather than at row-lock time is the point. The lock is released
  -- only at commit, so the loser resumes after the winner is durable, and the
  -- recursive walk below — issued by a VOLATILE function, which takes a fresh
  -- snapshot per query in READ COMMITTED — then sees the committed edge and
  -- rejects.
  --
  -- The cost is nil in practice: it is taken only when "parentId" is actually
  -- being written (moves are a rare admin action), never on an ordinary
  -- category edit, and never on a product write.
  PERFORM pg_advisory_xact_lock(hashtext('category_hierarchy_reparent'));

  IF NEW."parentId" = NEW."id" THEN
    RAISE EXCEPTION
      'Category % cannot be its own parent', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;

  WITH RECURSIVE chain AS (
    SELECT c."id", c."parentId", ARRAY[c."id"] AS path
    FROM "public"."categories" c
    WHERE c."id" = NEW."parentId"
    UNION ALL
    SELECT p."id", p."parentId", ch.path || p."id"
    FROM "public"."categories" p
    JOIN chain ch ON p."id" = ch."parentId"
    WHERE NOT p."id" = ANY(ch.path)
  )
  SELECT EXISTS (SELECT 1 FROM chain WHERE "id" = NEW."id")
  INTO v_would_cycle;

  IF v_would_cycle THEN
    RAISE EXCEPTION
      'Moving category % under category % would create a cycle in the category hierarchy',
      NEW."id", NEW."parentId"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- INSERT is deliberately not covered: a freshly inserted row's id cannot
-- already appear in any existing ancestry, so a new category can only ever
-- attach to a chain, never close one. Cycles are created by MOVES.
DROP TRIGGER IF EXISTS trg_assert_category_hierarchy_acyclic ON public.categories;
CREATE TRIGGER trg_assert_category_hierarchy_acyclic
  BEFORE UPDATE OF "parentId" ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.assert_category_hierarchy_acyclic();

-- ── Pre-existing cycles ─────────────────────────────────────────────────────
-- The trigger only governs writes from here on. If a loop was stored before
-- this migration it stays stored, so say so loudly rather than let it hide:
-- such a branch renders as an endless breadcrumb and its productCount values
-- are meaningless. There is no safe automatic repair — which node's parent is
-- the wrong one is an editorial question — so this reports and does not fix.
DO $$
DECLARE
  v_cyclic int[];
BEGIN
  WITH RECURSIVE walk AS (
    SELECT c."id" AS start_id, c."parentId" AS next_id, ARRAY[c."id"] AS path
    FROM "public"."categories" c
    UNION ALL
    SELECT w.start_id, p."parentId", w.path || p."id"
    FROM "public"."categories" p
    JOIN walk w ON p."id" = w.next_id
    WHERE NOT p."id" = ANY(w.path)
  )
  SELECT ARRAY(
    SELECT DISTINCT start_id FROM walk
    WHERE next_id = ANY(path)
    ORDER BY start_id
  ) INTO v_cyclic;

  IF array_length(v_cyclic, 1) > 0 THEN
    RAISE WARNING
      'category hierarchy already contains a cycle reachable from category id(s) %. The trigger installed by this migration blocks NEW cycles but cannot repair existing ones — re-parent one node in each loop by hand, then re-run recompute_category_product_count over every category.',
      v_cyclic;
  END IF;
END $$;
