-- Types are archived (soft-deleted), never hard-deleted. Archiving is one-way.
ALTER TABLE "news_event_types" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

-- name / slug stay unique among NON-archived types only, so an archived
-- type's name can be reused. Prisma cannot express partial unique indexes,
-- so the schema declares a plain index on slug and these are raw SQL.
DROP INDEX "news_event_types_name_key";
DROP INDEX "news_event_types_slug_key";

CREATE UNIQUE INDEX "news_event_types_name_active_key"
  ON "news_event_types" (LOWER("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "news_event_types_slug_active_key"
  ON "news_event_types" ("slug") WHERE "deleted_at" IS NULL;

CREATE INDEX "news_event_types_slug_idx" ON "news_event_types"("slug");
