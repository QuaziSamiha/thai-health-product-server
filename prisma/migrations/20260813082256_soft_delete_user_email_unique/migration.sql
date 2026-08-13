-- Add soft-delete tracking to users
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

-- Replace the global unique constraint on email with one scoped to
-- non-deleted rows, so an archived account's email can be reused by a new
-- signup. Prisma's schema DSL can't express a partial/filtered unique index,
-- so this constraint is DB-only and intentionally has no @unique counterpart
-- in schema.prisma (see the comment on User.email).
DROP INDEX "users_email_key";
CREATE UNIQUE INDEX "users_email_active_key" ON "users"("email") WHERE "deleted_at" IS NULL;
