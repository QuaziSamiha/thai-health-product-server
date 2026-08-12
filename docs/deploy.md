# Deployment Notes — Prisma Scripts & Production Seeding

This document records the environment/seeding changes made to this backend so far, why they were made, and what still needs attention before/after deploying.

## 1. Environment-aware Prisma scripts

`package.json` scripts now consistently load the right `.env.*` file via `dotenv-cli` (matching the existing `start:dev` / `start:prod` pattern), instead of relying on `prisma.config.ts`'s default `NODE_ENV`-based resolution (which was silently loading `.env.development.local` even when you wanted production).

| Script | Env file | Purpose |
|---|---|---|
| `yarn studio` | `.env.development` | Prisma Studio against dev DB |
| `yarn studio:prod` | `.env.production` | Prisma Studio against **production** DB |
| `yarn generate` | `.env.development` | `prisma generate` |
| `yarn generate:prod` | `.env.production` | `prisma generate` |
| `yarn db:deploy` | `.env.development` | `prisma migrate deploy` |
| `yarn db:deploy:prod` | `.env.production` | `prisma migrate deploy` against production |
| `yarn db:seed` | `.env.development` | Run `prisma/seed.ts` (user seed) |
| `yarn db:seed:prod` | `.env.production` | Run `prisma/seed.ts` against production |
| `yarn db:seed-products` | `.env.production` | Run `prisma/seed-products.ts` (product seed) against production |
| `yarn db:export-products` | `.env.production` | Dump categories/products from whatever DB is targeted to `prisma/seed-data/products.json` (currently unused — see §4) |

**Important quirk:** `dotenv-cli -e <file>` loads *only the exact file passed* — unlike `prisma.config.ts`'s own loader, it does **not** cascade to a `.local` override. Any secret that needs to reach these scripts must live directly in the exact file referenced above (e.g. `.env.production`, not `.env.production.local`).

**Runner:** seed/studio scripts run via `tsx`, not `ts-node`. Prisma 7's generated client (`src/generated/prisma/`) uses `.js`-extension imports that resolve to `.ts` files — `ts-node`'s per-file CJS transpilation can't follow that; `tsx` (esbuild-based) can.

## 2. User seed — `prisma/seed.ts`

Creates/updates exactly 3 users via `upsert` (idempotent, keyed by email):

| Email | Role |
|---|---|
| `quazisamiha@gmail.com` | `ADMIN` |
| `mahfuzislam1695@gmail.com` | `SUPER_ADMIN` |
| `mahfuzislam@gmail.com` | `CUSTOMER` |

Passwords are read from env vars (`SEED_ADMIN_PASSWORD`, `SEED_SUPER_ADMIN_PASSWORD`, `SEED_CUSTOMER_PASSWORD`) — never hardcoded in the script — and hashed with bcrypt (10 salt rounds, matching `src/shared/hash/hash.service.ts`). These currently live in `.env.production` (see the `SEED —` block near the bottom of that file) all set to `Ati@12345`.

**Status:** already run successfully against production (`yarn db:seed:prod`). All 3 accounts exist live.

**Action item before/soon after go-live:** rotate these passwords, especially the `SUPER_ADMIN` one — they're one-off seed values, not meant to be long-term credentials.

## 3. Product seed — `prisma/seed-products.ts`

Reads a flat JSON array of products from `prisma/seed-data/products.json` (each with a nested `category` object, `images[]`, and `variants[]`) and upserts:

- **Categories** — upserted by `slug` in two passes: pass 1 creates/updates every category referenced by a product (without `parentId`), pass 2 resolves `parent` relations for any category whose parent was *also* present in the source data. If a parent isn't in the source data, the category is left unparented with a console warning (safe — resolves itself once the parent is added and the script is re-run).
- **Products** — upserted by `slug`.
- **Images** — no natural unique key, so they're deleted and recreated per product on every run (still idempotent — same end state either way).
- **Variants** — upserted by `slug`.

All `createdBy`/`updatedBy` attribution (on both categories and products) points at the `SUPER_ADMIN` seed user (`mahfuzislam1695@gmail.com`), looked up by email at runtime — so `yarn db:seed:prod` must have been run at least once before this script (it has been).

**Prisma 7 gotchas fixed in this script** (all discovered via runtime `PrismaClientValidationError`s, since `tsx` doesn't type-check):
- Foreign keys must be written as relation `connect` objects, not bare scalar IDs — e.g. `category: { connect: { id } } }` instead of `categoryId: id`, and `createdByUser: { connect: { id } } }` instead of `createdBy: id`.
- `salePrice` (on both `Product` and `ProductVariant`) is **server-derived** from `basePrice` + `discountType`/`discountValue` — the schema comment explicitly says "never client input." The script no longer sets it directly; the database computes it.

**Data source & current status:** the full product dataset was pasted into chat but chat input has a hard ~50,000-character limit, which cut it off mid-record every time. What made it through cleanly was **9 complete products** (source `id` 3–11): Calclum Plus Vitamin D, Astaxanthin, Magnesium Plus Vitamin, Acerola Cherry Plus, Collagen Tripeptide 600 Plus Co Q10, Grape Seed Extract - 60, B-Complex Plus Mineral, Fish Oil Plus, Zinccap. These 9 are saved to `prisma/seed-data/products.json` and have been seeded into production and verified:

```
categories: 7   products: 9   variants: 13   images: 9
```

(Confirmed via a direct query against `192.168.0.221`, and via re-running `yarn db:seed-products` a second time with zero changes — proving the upserts are idempotent.)

**Remaining work:** the rest of the product catalog (product 12 onward, and whatever comes after it) still isn't in `prisma/seed-data/products.json`. Because of the chat paste limit, that data needs to reach this file some other way — e.g. saving the full JSON export directly to `prisma/seed-data/products.json` outside of chat, or pasting it in smaller chunks to append. Once appended, just re-run `yarn db:seed-products` — it will only add what's new (existing 9 products/7 categories won't be duplicated or altered beyond upserted fields).

## 4. `prisma/export-products.ts` (currently unused)

Dumps `{ categories, products }` from whatever `DATABASE_URL` is active into `prisma/seed-data/products.json`. Built while investigating whether the pasted product JSON might have been an export *from* production — it wasn't (production was empty at the time). Left in place; harmless, and may be useful later for backing up production once it has real data, but it's not part of the current seeding flow (its output shape doesn't match what `seed-products.ts` consumes).

## Quick reference — order of operations for a fresh production setup

```bash
yarn db:deploy:prod        # apply migrations
yarn db:seed:prod          # create ADMIN / SUPER_ADMIN / CUSTOMER users
yarn db:seed-products      # seed categories/products/variants/images (needs prisma/seed-data/products.json)
yarn studio:prod           # spot-check the result
```
