# NestJS Codebase Backend (`thai-health-product-server`)

NestJS backend for the Thai Health Product (NestJS Codebase) e-commerce platform — Prisma ORM on PostgreSQL via the `pg` driver adapter, JWT auth, and modular domain services.

## Documentation

| Area | Doc |
| --- | --- |
| Prisma — file map & how the pieces connect | [docs/architecture/prisma.md](./docs/architecture/prisma.md) |
| Prisma — CLI commands (migrate, studio, reset, deploy) | [docs/commands/prisma.md](./docs/commands/prisma.md) |
| Prisma — concepts, conventions, developer guide | [docs/concepts/prisma.md](./docs/concepts/prisma.md) |
| Project setup from scratch | [documentations/PROJECT_SETUP.md](./documentations/PROJECT_SETUP.md) |
| Category module | [documentations/CATEGORY.md](./documentations/CATEGORY.md) |
| Product module | [documentations/PRODUCT.md](./documentations/PRODUCT.md) |
| Shared pagination pattern | [documentations/PAGINATION.md](./documentations/PAGINATION.md) |

## Environment & Running Commands

### Command Reference

| Command             | Env File Loaded                | Purpose                                                                    |
| ------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| `yarn start`        | _(none — reads compiled dist)_ | **Production start** — runs `node dist/main`. Requires `yarn build` first. |
| `yarn start:dev`    | `.env.development`             | Developer B shared config — standard watch-mode dev server                 |
| `yarn start:local`  | `.env.development.local`       | Developer A personal local config — watch-mode dev server                  |
| `yarn start:office` | `.env.office`                  | Office/internal environment — points to `192.168.0.221` DB                 |
| `yarn start:prod`   | `.env.production`              | Production config loaded locally — watch-mode, for staging verification    |
| `yarn build`        | _(none)_                       | Compiles TypeScript source to `dist/`                                      |

> **Warning:** `yarn start` runs the **compiled production build** (`node dist/main`).
> It does **not** compile the source. Always run `yarn build` before `yarn start`, otherwise you will execute stale or missing output.


### Running the app itself against a specific env

```bash
yarn start:dev      # .env.development
yarn start:local     # .env.development.local (your personal DB)
yarn start:office    # .env.office
yarn start:prod      # .env.production
```


### User
### Auth
### Category
### Product
### Inventory & Batch
### Home
### Combo Product
- [db schema](./docs/combo-product.md#db-schema)
  - [Entity-Relationship Diagram (ERD)](./docs/combo-product.md#entity-relationship-diagram-erd)
  - [Enum Definitions](./docs/combo-product.md#enum-definitions)
  - [Data Dictionary — ComboProduct](./docs/combo-product.md#data-dictionary--comboproduct)
  - [Data Dictionary — ComboItem](./docs/combo-product.md#data-dictionary--comboitem)
  - [Data Dictionary — ComboImage](./docs/combo-product.md#data-dictionary--comboimage)
  - [Availability Model (The Bottleneck Rule)](./docs/combo-product.md#availability-model-the-bottleneck-rule)
  - [Bundling Rules](./docs/combo-product.md#bundling-rules)
  - [Price Snapshot Dating](./docs/combo-product.md#price-snapshot-dating)
  - [Relationships and Cascading Rules](./docs/combo-product.md#relationships-and-cascading-rules)
  - [Indexes & Constraints](./docs/combo-product.md#indexes--constraints)
  - [Conventions](./docs/combo-product.md#conventions)
  - [Example Data](./docs/combo-product.md#example-data)
  - [Known Gaps / Recommended Hardening](./docs/combo-product.md#known-gaps--recommended-hardening)
- api end point and business logic
### Blog
### Support