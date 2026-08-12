# Database Seeding

This project has two independent seeding concerns, backed by two separate scripts. They are not run together and don't share a code path — keep that in mind when reading `package.json`.

| Concern | Script | Data source | Idempotent |
|---|---|---|---|
| Baseline users (admin / super admin / customer) | `prisma/seed.ts` | Hardcoded list + passwords from env vars | Yes (`upsert` by email) |
| Real product catalog (categories, products, variants, images) | `prisma/seed-products.ts` | `prisma/seed-data/products.json` | Yes (`upsert` by slug) |

A third script, `prisma/export-products.ts`, produces the JSON file `seed-products.ts` consumes — see [Product catalog seeding](#product-catalog-seeding) below.

## User seeding

`prisma/seed.ts` upserts a fixed set of accounts, defined in the `SEED_USERS` array at the top of the file:

- `quazisamiha@gmail.com` — `ADMIN`
- `mahfuzislam1695@gmail.com` — `SUPER_ADMIN`
- `mahfuzislam@gmail.com` — `CUSTOMER`

Each user's password is **not** hardcoded in the script. It's read from an environment variable named on the `SeedUser` object (`passwordEnvVar`, e.g. `SEED_ADMIN_PASSWORD`), hashed with bcrypt, and only then written to the DB. If any of the required env vars are missing, `resolvePasswords()` throws before touching the database — the script fails fast instead of silently seeding a user with an undefined password.

To add a new seed user: add an entry to `SEED_USERS` and set the matching `<X>_PASSWORD` env var wherever the script will run. There is no `.env.example` yet listing these — check `SEED_USERS` in `seed.ts` for the exact env var names currently required (`SEED_ADMIN_PASSWORD`, `SEED_SUPER_ADMIN_PASSWORD`, `SEED_CUSTOMER_PASSWORD`).

Run:

```bash
yarn db:seed        # loads .env.development, seeds via tsx
yarn db:seed:prod   # loads .env.production
```

Because it's an `upsert` on `email`, rerunning it is safe — it resets role/password/status on existing rows rather than erroring on conflict.

## Product catalog seeding

Unlike the user seed, this isn't synthetic test data — it's a snapshot of the **real** product catalog (categories + products + variants + images), captured from a live database and replayed elsewhere.

**Export** (`prisma/export-products.ts`): connects to a DB, reads all categories and all non-deleted products (with images and variants included), and writes them to `prisma/seed-data/products.json`.

**Seed** (`prisma/seed-products.ts`): reads `prisma/seed-data/products.json` and upserts everything into the target DB:

1. Deduplicates categories by source ID across all products, upserts each by `slug` (pass 1), then resolves `parentId` links in a second pass once every category has a target-DB ID (this two-pass approach is required because a child category can appear before its parent in the source data).
2. Looks up a fixed super-admin user (`mahfuzislam1695@gmail.com`) by email and attributes every created/updated row to them via `createdByUser`/`updatedByUser` — **this user must already exist in the target DB**, so `db:seed` (or an equivalent) has to run before `db:seed-products`.
3. Upserts each product by `slug`, using `deleteMany` + `createMany` for images (they have no natural unique key, so full replace is the simplest way to keep reruns idempotent) and `upsert` by `slug` for variants.
4. `salePrice` is intentionally never set from the source data on either product or variant — it's a server-derived field (see `prisma/schema/product.prisma`), so setting it here would just be overwritten or drift out of sync.

Run:

```bash
yarn db:export-products   # dumps from .env.production into seed-data/products.json
yarn db:seed-products      # loads .env.production, replays seed-data/products.json into the DB
```

**Note both scripts are currently wired to `.env.production` only.** There's no `db:seed-products:dev` equivalent — if you need this catalog data in a local/office database, run `tsx` directly with a different `-e` flag rather than relying on an npm script that doesn't exist yet.

### Known gap: export/seed shape mismatch

`export-products.ts` writes `{ categories, products }` (a wrapper object with both arrays as sibling keys). `seed-products.ts`'s `loadProducts()` does `JSON.parse(...) as SourceProduct[]` and expects a **plain array of products** (with `category` nested inside each product, not a separate top-level `categories` array). The `products.json` file actually checked into the repo matches the *seed* script's expectation (a bare array), not the *export* script's current output shape.

In other words: as written today, running `export-products.ts` would **not** produce a file `seed-products.ts` can consume as-is. Whoever produced the current `seed-data/products.json` either used an older version of `export-products.ts` or transformed the output by hand. If you need to refresh this fixture from a live DB, fix this mismatch first (either change the export to emit a bare product array, or change the seed script to read `.products` off the wrapper object) rather than assuming the two scripts are still round-trip compatible.

## Fixture data location

`prisma/seed-data/products.json` holds the large (tens of KB) static fixture the product seed reads. It's deliberately kept out of the `.ts` logic files and is **not** gitignored (`.gitignore` only excludes `*.seed`, which doesn't match this filename) — it's committed as real catalog data, not a local scratch file.

## Running order for a fresh database

```bash
yarn db:deploy          # apply migrations
yarn db:seed             # baseline users — required before the next step
yarn db:seed-products    # real catalog data (attributes rows to the super admin seeded above)
```

## Design notes

- **Everything is `upsert`-based.** Both scripts key off a natural unique field (`email` for users, `slug` for categories/products/variants) specifically so they're safe to rerun against a DB that already has data, rather than being one-shot "only works on empty DB" scripts.
- **No plaintext secrets in source.** User passwords come from env vars resolved at runtime, checked before any DB write.
- **Separate scripts instead of one seed.ts.** Users and product catalog are unrelated concerns with very different data lifecycles (a handful of hardcoded accounts vs. a large, periodically-refreshed real catalog dump) — splitting them keeps each script simple and lets them be run independently and pointed at different environments.
