-- Repo-wide conversion of every DateTime column from `timestamp(3)` (Prisma's
-- default native mapping, tz-naive) to `timestamptz(3)`.
--
-- Why: comparing a tz-naive column against now() (which is timestamptz) forces
-- an implicit cast through the *server's* TimeZone setting. This database's
-- TimeZone is `Asia/Dhaka`, not Bangkok and not UTC, and a production server
-- will be set to something else again — so a promotion window that ends at
-- "midnight" would end at a different real instant depending on where the
-- query runs. Storefront window queries over combo_products.starts_at/ends_at
-- (the @@index([startsAt, endsAt]) exists for exactly that) are the first
-- place this would have bitten.
--
-- THE `USING ... AT TIME ZONE 'UTC'` CLAUSE IS LOAD-BEARING. Prisma serializes
-- JS Dates to UTC before writing, so every naive column already holds a UTC
-- wall-clock value (verified: combo_products.starts_at reads
-- `2026-07-01 00:00:00` as raw text). A plain `ALTER COLUMN ... TYPE
-- timestamptz(3)` would let Postgres interpret those values in the server's
-- TimeZone and silently shift every timestamp in the database by the local
-- UTC offset — 6 hours here. `AT TIME ZONE 'UTC'` pins the interpretation to
-- what the data actually means, so the conversion is lossless.
--
-- profiles."dateOfBirth" is deliberately excluded and stays tz-naive: a birth
-- date is a calendar date, not an instant, and making it tz-aware would render
-- it as a different day depending on the reader's zone. It should become
-- `@db.Date` in its own migration — see the note on User.Profile in
-- prisma/schema/user.prisma.

ALTER TABLE "public"."batches" ALTER COLUMN "manufacturing_date" TYPE TIMESTAMPTZ(3) USING "manufacturing_date" AT TIME ZONE 'UTC';
ALTER TABLE "public"."batches" ALTER COLUMN "expiry_date" TYPE TIMESTAMPTZ(3) USING "expiry_date" AT TIME ZONE 'UTC';
ALTER TABLE "public"."batches" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."batches" ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."blogs" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."blogs" ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."blogs" ALTER COLUMN "published_at" TYPE TIMESTAMPTZ(3) USING "published_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."categories" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "public"."categories" ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "public"."combo_products" ALTER COLUMN "starts_at" TYPE TIMESTAMPTZ(3) USING "starts_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."combo_products" ALTER COLUMN "ends_at" TYPE TIMESTAMPTZ(3) USING "ends_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."combo_products" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."combo_products" ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."combo_products" ALTER COLUMN "deleted_at" TYPE TIMESTAMPTZ(3) USING "deleted_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."combo_products" ALTER COLUMN "published_at" TYPE TIMESTAMPTZ(3) USING "published_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."home_content" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "public"."home_content" ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "public"."inventory" ALTER COLUMN "recorded_at" TYPE TIMESTAMPTZ(3) USING "recorded_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."otps" ALTER COLUMN "expires_at" TYPE TIMESTAMPTZ(3) USING "expires_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."otps" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."products" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."products" ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."products" ALTER COLUMN "deleted_at" TYPE TIMESTAMPTZ(3) USING "deleted_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."products" ALTER COLUMN "published_at" TYPE TIMESTAMPTZ(3) USING "published_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."sessions" ALTER COLUMN "refreshTokenExpiresAt" TYPE TIMESTAMPTZ(3) USING "refreshTokenExpiresAt" AT TIME ZONE 'UTC';
ALTER TABLE "public"."sessions" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "public"."support_pages" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "public"."support_pages" ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "public"."user_security" ALTER COLUMN "emailVerifiedAt" TYPE TIMESTAMPTZ(3) USING "emailVerifiedAt" AT TIME ZONE 'UTC';
ALTER TABLE "public"."user_security" ALTER COLUMN "verificationTokenExpires" TYPE TIMESTAMPTZ(3) USING "verificationTokenExpires" AT TIME ZONE 'UTC';
ALTER TABLE "public"."user_security" ALTER COLUMN "resetTokenExpires" TYPE TIMESTAMPTZ(3) USING "resetTokenExpires" AT TIME ZONE 'UTC';

ALTER TABLE "public"."users" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."users" ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."users" ALTER COLUMN "last_login_at" TYPE TIMESTAMPTZ(3) USING "last_login_at" AT TIME ZONE 'UTC';
