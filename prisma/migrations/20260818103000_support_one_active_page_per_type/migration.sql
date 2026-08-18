-- The five named SupportType values are singleton pages: the storefront asks
-- for "the Delivery Policy" and SupportRepository.findActiveByType answers with
-- a findFirst, so a second ACTIVE row of the same type makes the answer
-- planner-dependent — it can change between deploys or after a VACUUM. Nothing
-- in the app or the schema prevented that second row from being created.
--
-- OTHERS is deliberately excluded: it is the catch-all type and is *meant* to
-- hold many concurrent rows (FAQ, About Us, ...), disambiguated by slug.
--
-- Prisma's schema DSL cannot express a partial/filtered unique index, so this
-- constraint is DB-only and has no counterpart in support.prisma — the same
-- trade-off already accepted for users_email_active_key
-- (20260813082256_soft_delete_user_email_unique). See the comment on
-- Support.status in support.prisma.

-- Retire pre-existing duplicates before the index can be built: for each named
-- type keep the most recently updated ACTIVE row and demote the rest to
-- INACTIVE. Demotion (not deletion) is the reversible choice, and INACTIVE is
-- already the module's "retired but retained" state — the demoted rows stay
-- visible in the admin listing, which applies no status filter.
UPDATE "support_pages"
SET "status" = 'INACTIVE', "updatedAt" = NOW()
WHERE "id" IN (
    SELECT "id"
    FROM (
        SELECT
            "id",
            ROW_NUMBER() OVER (
                PARTITION BY "type"
                ORDER BY "updatedAt" DESC, "id" DESC
            ) AS rn
        FROM "support_pages"
        WHERE "status" = 'ACTIVE' AND "type" <> 'OTHERS'
    ) ranked
    WHERE ranked.rn > 1
);

CREATE UNIQUE INDEX "support_pages_active_type_key"
    ON "support_pages" ("type")
    WHERE "status" = 'ACTIVE' AND "type" <> 'OTHERS';
