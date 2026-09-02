# Thai Health Product Backend (`thai-health-product-server`)

NestJS backend for the Thai Health Product (Thai Health Product) e-commerce platform — Prisma ORM on PostgreSQL via the `pg` driver adapter, JWT auth, and modular domain services.

## Documentation

| Area | Doc |
| --- | --- |
| Prisma — file map & how the pieces connect | [docs/architecture/prisma-architecture.md](./docs/architecture/prisma-architecture.md) |
| Prisma — CLI commands (migrate, studio, reset, deploy) | [docs/commands/prisma.md](./docs/commands/prisma.md) |
| Prisma — concepts, conventions, developer guide | [docs/concepts/prisma-concepts.md](./docs/concepts/prisma-concepts.md) |
| Project setup from scratch | [documentations/PROJECT_SETUP.md](./documentations/PROJECT_SETUP.md) |
| Category module — taxonomy tree, schema + endpoints | [docs/category.md](./docs/category.md) |
| Category module (legacy schema notes) | [documentations/CATEGORY.md](./documentations/CATEGORY.md) |
| Product module — schema + endpoints | [docs/product.md](./docs/product.md) |
| Shared pagination pattern | [docs/architecture/pagination-architecture.md](./docs/architecture/pagination-architecture.md) |
| Delivery module — third-party couriers (what a courier charges **us**) | [docs/delivery.md](./docs/delivery.md) |
| Delivery Charge module — shipping rate card (what the **customer** pays) | [docs/delivery-charge.md](./docs/delivery-charge.md) |
| Delivery Man module — in-house delivery staff | [docs/delivery-man.md](./docs/delivery-man.md) |
| User module — identity schema, endpoints, security model | [docs/user.md](./docs/user.md) |
| Support module — policy/info pages, schema + endpoints | [docs/support.md](./docs/support.md) |

## Environment & Running Commands

### The four environment files

Every env-aware script is `dotenv-cli` loading exactly one file, so **the script suffix decides which database and port you hit**. Nothing is inherited or merged between files.

| Env file                 | Script suffix | `NODE_ENV`  | Port   | Database                                      |
| ------------------------ | ------------- | ----------- | ------ | --------------------------------------------- |
| `.env.development`       | `:dev`        | development | `5001` | `localhost:5432/thp_ecommerce`                |
| `.env.development.local` | `:local`      | development | `8000` | `localhost:5432/thp_ecommerce_local`          |
| `.env.office`            | `:office`     | production  | `4036` | `192.168.0.221:5432/thp_ecommerce` (office server) |
| `.env.production`        | `:prod`       | production  | `4036` | `192.168.0.107:5432/thp_ecommerce` (**LIVE**)      |

> **`:office` and `:prod` are two different databases on two different hosts** — office is `192.168.0.221`, live is `192.168.0.107`. They still share the same `PORT` (`4036`), the same `BASE_URL`/`ALLOWED_ORIGINS`, and the same JWT secrets, so a token issued by one is accepted by the other. Check the suffix before running any `db:*` command.

Other differences worth knowing:

- `GOOGLE_CLIENT_ID` is set **only** in `.env.development`. Google sign-in will not verify ID tokens under `:local`, `:office`, or `:prod` until it is added to those files.
- `SEED_ADMIN_PASSWORD` / `SEED_SUPER_ADMIN_PASSWORD` / `SEED_CUSTOMER_PASSWORD` exist **only** in `.env.office` and `.env.production` — `prisma/seed.ts` reads them, so seeding under `:dev` / `:local` falls back to whatever defaults the seed script defines.
- The `LOG_*` block is **commented out** in `.env.development` (defaults apply) and active in the other three.
- `DATABASE_POOL_*` sizing vars are commented out everywhere; uncomment them in `.env.production` to tune the live pool.

---

### Full command matrix

Every cell is a `yarn <script>`. A `—` means the command is intentionally not provided for that environment.

| What it does                    | `.env.development`        | `.env.development.local`        | `.env.office`                    | `.env.production`              |
| ------------------------------- | ------------------------- | ------------------------------- | -------------------------------- | ------------------------------ |
| **Run the server** (watch mode) | `start:dev`               | `start:local`                   | `start:office`                   | `start:prod`                   |
| **Prisma generate**             | `generate`                | `generate:local`                | `generate:office`                | `generate:prod`                |
| **Create a migration**          | `db:migrate`              | `db:migrate:local`              | — *(never)*                      | — *(never)*                    |
| **Apply migrations**            | `db:deploy`               | `db:deploy:local`               | `db:deploy:office`               | `db:deploy:prod`               |
| **Prisma Studio**               | `studio`                  | `studio:local`                  | `studio:office`                  | `studio:prod`                  |
| **Seed core data**              | `db:seed`                 | `db:seed:local`                 | `db:seed:office`                 | `db:seed:prod`                 |
| **Seed delivery rate card**     | `db:seed-delivery-charge` | `db:seed-delivery-charge:local` | `db:seed-delivery-charge:office` | `db:seed-delivery-charge:prod` |
| **Export products to JSON**     | —                         | —                               | —                                | `db:export-products`           |
| **Import/seed products**        | —                         | —                               | —                                | `db:seed-products`             |

Environment-independent scripts (no env file is loaded):

| Command            | Purpose                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| `yarn build`       | Compile TypeScript to `dist/`                                                  |
| `yarn start`       | **Production start** — runs `node dist/main`. Requires `yarn build` first.      |
| `yarn start:debug` | `nest start --debug --watch` — reads the ambient environment, not an env file   |
| `yarn lint`        | ESLint with `--fix`                                                            |
| `yarn format`      | Prettier over `src/` and `test/`                                               |
| `yarn test`        | Jest unit tests (`test:watch`, `test:cov`, `test:debug`, `test:e2e` also exist) |

> **Warning:** `yarn start` runs the **compiled build** (`node dist/main`) and does **not** compile anything.
> Always `yarn build` first, or you will execute stale or missing output.
> Note also that `start:prod` runs `nest start --watch` — it is for verifying production config *locally*, not for serving live traffic.

---

### Per-environment quick reference

**`.env.development` — shared developer config (port 5001, local `thp_ecommerce`)**

```bash
yarn generate                     # regenerate the Prisma client
yarn db:migrate --name my_change  # create + apply a new migration
yarn db:deploy                    # apply existing migrations
yarn db:seed                      # seed core data
yarn db:seed-delivery-charge      # seed the delivery rate card
yarn studio                       # browse the DB
yarn start:dev                    # run the API on :5001
```

**`.env.development.local` — personal local config (port 8000, local `thp_ecommerce_local`)**

```bash
yarn generate:local
yarn db:migrate:local --name my_change
yarn db:deploy:local
yarn db:seed:local
yarn db:seed-delivery-charge:local
yarn studio:local
yarn start:local                  # run the API on :8000
```

**`.env.office` — office/internal server (port 4036, `192.168.0.221:5432`)**

```bash
yarn generate:office
yarn db:deploy:office             # apply existing migrations only
yarn db:seed:office
yarn db:seed-delivery-charge:office
yarn studio:office                # read carefully, write rarely
yarn start:office
```

> There is no `db:migrate:office` by design — migrations are authored on dev and **deployed** here.

**`.env.production` — LIVE (port 4036, `192.168.0.107:5432`)**

```bash
yarn build                        # compile first
yarn generate:prod
yarn db:deploy:prod               # apply pending migrations to the LIVE DB
yarn db:seed:prod                 # uses SEED_* passwords — rotate after first login
yarn db:seed-delivery-charge:prod
yarn db:export-products           # export live products to JSON
yarn db:seed-products             # import products into the live DB
yarn studio:prod                  # read carefully, write rarely
yarn start                        # serve the compiled build
```

---

### Authoring and deploying a migration

`prisma migrate deploy` only applies migration folders that **already exist** in `prisma/migrations/`. It never creates a migration and never resets the database. So the order is always: author on dev → commit the generated folder → deploy outward.

```bash
yarn db:migrate --name your_migration_name   # 1. author against .env.development
git add prisma/migrations && git commit       # 2. commit the generated folder
yarn db:deploy:office                         # 3. roll out to office
yarn db:deploy:prod                           # 4. then to live
yarn generate:prod                            # 5. regenerate the client for prod
```

> **Never run `prisma migrate dev`, `prisma migrate reset`, or `prisma db push` against `.env.office` or `.env.production`** — each can drop or rewrite live data. That is why no `:office` / `:prod` variants of those commands exist.

Need a one-off Prisma command that has no script? Run `dotenv-cli` directly against the env file you want:

```bash
npx dotenv -e .env.development       -- npx prisma migrate status
npx dotenv -e .env.development.local -- npx prisma migrate status
npx dotenv -e .env.office            -- npx prisma migrate status
npx dotenv -e .env.production        -- npx prisma migrate status
```

See [docs/commands/prisma.md](./docs/commands/prisma.md) for the full Prisma CLI reference and [docs/deploy.md](./docs/deploy.md) for the deployment sequence.


### User
- [db schema](./docs/user.md#db-schema)
  - [Entity-Relationship Diagram (ERD)](./docs/user.md#entity-relationship-diagram-erd)
  - [Enum Definitions](./docs/user.md#enum-definitions)
  - [Data Dictionary — User](./docs/user.md#data-dictionary--user)
  - [Data Dictionary — Profile](./docs/user.md#data-dictionary--profile)
  - [Data Dictionary — UserSecurity](./docs/user.md#data-dictionary--usersecurity)
  - [Data Dictionary — OTP](./docs/user.md#data-dictionary--otp)
  - [Relationships and Cascading Rules](./docs/user.md#relationships-and-cascading-rules)
  - [Indexes & Constraints](./docs/user.md#indexes--constraints)
  - [Conventions](./docs/user.md#conventions)
  - [Example Data](./docs/user.md#example-data)
  - [Known Gaps / Recommended Hardening](./docs/user.md#known-gaps--recommended-hardening)
- [api end point and business logic](./docs/user.md#api-end-point--business-logic)
  - [Endpoint Overview](./docs/user.md#endpoint-overview)
  - [Response Shapes & Select Projections](./docs/user.md#response-shapes--select-projections)
  - [Register a User — `POST /user/create-user`](./docs/user.md#register-a-user)
  - [Password Reset Flow](./docs/user.md#password-reset-flow)
  - [Forgot Password — `POST /user/forgot-password`](./docs/user.md#forgot-password)
  - [Reset a Password — `POST /user/reset-password`](./docs/user.md#reset-a-password)
  - [Get All Users (Admin) — `GET /user/all-user`](./docs/user.md#get-all-users-admin)
  - [Get My Profile — `GET /user/my-profile`](./docs/user.md#get-my-profile)
  - [Update a Profile — `PATCH /user/update-profile/:id`](./docs/user.md#update-a-profile)
  - [Update a User's Role — `PATCH /user/update-user-role/:id`](./docs/user.md#update-a-users-role)
  - [Update a User's Assigned IP — `PATCH /user/update-user-security/:id`](./docs/user.md#update-a-users-assigned-ip)
  - [Deactivate a User — `DELETE /user/deactivate-user/:id`](./docs/user.md#deactivate-a-user)
  - [Update a Password — `PATCH /user/update-password/:id`](./docs/user.md#update-a-password)
  - [Password/Security Handling](./docs/user.md#passwordsecurity-handling)
  - [Rate Limiting](./docs/user.md#rate-limiting)
  - [Internal Service API (Not HTTP-Exposed)](./docs/user.md#internal-service-api-not-http-exposed)
  - [Auth & OTP Coupling](./docs/user.md#auth--otp-coupling)
### Auth
### Category
- [db schema](./docs/category.md#db-schema)
  - [Entity-Relationship Diagram (ERD)](./docs/category.md#entity-relationship-diagram-erd)
  - [Enum Definitions](./docs/category.md#enum-definitions)
  - [Data Dictionary — Category](./docs/category.md#data-dictionary--category)
  - [Relationships and Cascading Rules](./docs/category.md#relationships-and-cascading-rules)
  - [Performance Optimizations (Indexes)](./docs/category.md#performance-optimizations-indexes)
  - [Conventions](./docs/category.md#conventions)
  - [Example Data](./docs/category.md#example-data)
  - [Example Usage (JSON Response)](./docs/category.md#example-usage-json-response)
  - [Implementation & Best Practices](./docs/category.md#implementation--best-practices)
    - [The Hierarchy Model](./docs/category.md#the-hierarchy-model)
    - [Slug Handling](./docs/category.md#slug-handling)
    - [Image Upload & Rollback](./docs/category.md#image-upload--rollback)
    - [Admin-Form UX (multipart/form-data)](./docs/category.md#admin-form-ux-multipartform-data)
    - [Validation](./docs/category.md#validation)
  - [Known Gaps / Recommended Hardening](./docs/category.md#known-gaps--recommended-hardening)
- [api end point and business logic](./docs/category.md#api-end-point--business-logic)
  - [Endpoint Overview](./docs/category.md#endpoint-overview)
  - [Response Shapes & Select Projections](./docs/category.md#response-shapes--select-projections)
  - [Create a Category — `POST /category/create-category`](./docs/category.md#create-a-category)
  - [List All Categories (Admin) — `GET /category/all-categories`](./docs/category.md#list-all-categories-admin)
  - [List All Active Categories (Public) — `GET /category/all-active-categories`](./docs/category.md#list-all-active-categories-public)
  - [List Active Root Categories (Public) — `GET /category/active-root-categories`](./docs/category.md#list-active-root-categories-public)
  - [List Product-Assignable Categories (Admin) — `GET /category/product-categories`](./docs/category.md#list-product-assignable-categories-admin)
  - [Get a Category by Slug (Public) — `GET /category/category-by-slug/:slug`](./docs/category.md#get-a-category-by-slug-public)
  - [Update a Category — `PATCH /category/update-category/:id`](./docs/category.md#update-a-category)
  - [Built but Not Yet Exposed](./docs/category.md#built-but-not-yet-exposed)
### Product
- [db schema](./docs/product.md#db-schema)
  - [Entity-Relationship Diagram (ERD)](./docs/product.md#entity-relationship-diagram-erd)
  - [Enum Definitions](./docs/product.md#enum-definitions)
  - [Data Dictionary — Product](./docs/product.md#data-dictionary--product)
  - [Data Dictionary — ProductVariant](./docs/product.md#data-dictionary--productvariant)
  - [Data Dictionary — ProductImage](./docs/product.md#data-dictionary--productimage)
  - [Detailed Field Examples (JSON Objects)](./docs/product.md#detailed-field-examples-json-objects)
  - [Relationships and Cascading Rules](./docs/product.md#relationships-and-cascading-rules)
  - [Performance Optimizations (Indexes & Views)](./docs/product.md#performance-optimizations-indexes--views)
  - [Conventions](./docs/product.md#conventions)
  - [Example Data](./docs/product.md#example-data)
  - [Example Usage (JSON Response)](./docs/product.md#example-usage-json-response)
  - [Implementation & Best Practices](./docs/product.md#implementation--best-practices)
  - [Known Gaps / Recommended Hardening](./docs/product.md#known-gaps--recommended-hardening)
- [api end point and business logic](./docs/product.md#api-end-point--business-logic)
  - [Endpoint Overview](./docs/product.md#endpoint-overview)
  - [Response Shapes & Select Projections](./docs/product.md#response-shapes--select-projections)
  - [Create a Product — `POST /product/create-product`](./docs/product.md#create-a-product)
  - [List All Products (Admin) — `GET /product/all-product`](./docs/product.md#list-all-products-admin)
  - [List Active Products (Public) — `GET /product/active-products`](./docs/product.md#list-active-products-public)
  - [Get Product Dropdown Options (Admin) — `GET /product/product-inventory`](./docs/product.md#get-product-dropdown-options-admin)
  - [Get Product by ID (Admin) — `GET /product/product-by-id/:id`](./docs/product.md#get-product-by-id-admin)
  - [Get Product by Slug (Public) — `GET /product/product-by-slug/:slug`](./docs/product.md#get-product-by-slug-public)
  - [Update a Product — `PATCH /product/update-product/:id`](./docs/product.md#update-a-product)
  - [Soft Delete a Product — `DELETE /product/soft-delete-product/:id`](./docs/product.md#soft-delete-a-product)
  - [Permanently Delete a Product — `DELETE /product/permanently-delete-product/:id`](./docs/product.md#permanently-delete-a-product)
  - [Built but Not Yet Exposed](./docs/product.md#built-but-not-yet-exposed)
  - [Repository Organization](./docs/product.md#repository-organization)
### Inventory & Batch
- [db schema](./docs/inventory.md#db-schema)
  - [Entity-Relationship Diagram (ERD)](./docs/inventory.md#entity-relationship-diagram-erd)
  - [Enum Definitions](./docs/inventory.md#enum-definitions)
  - [Data Dictionary — Batch](./docs/inventory.md#data-dictionary--batch)
  - [Data Dictionary — Inventory](./docs/inventory.md#data-dictionary--inventory)
  - [Relationships and Cascading Rules](./docs/inventory.md#relationships-and-cascading-rules)
  - [Performance Optimizations (Indexes)](./docs/inventory.md#performance-optimizations-indexes)
  - [Conventions](./docs/inventory.md#conventions)
  - [Example Data](./docs/inventory.md#example-data)
  - [Example Usage (JSON Response)](./docs/inventory.md#example-usage-json-response)
  - [Implementation & Best Practices](./docs/inventory.md#implementation--best-practices)
  - [Known Gaps / Recommended Hardening](./docs/inventory.md#known-gaps--recommended-hardening)
- [api end point and business logic](./docs/inventory.md#api-end-point--business-logic)
### Home
### Combo Product
- [db schema](./docs/combo-product.md#db-schema)
  - [Entity-Relationship Diagram (ERD)](./docs/combo-product.md#entity-relationship-diagram-erd)
  - [Enum Definitions](./docs/combo-product.md#enum-definitions)
  - [Data Dictionary — ComboProduct](./docs/combo-product.md#data-dictionary--comboproduct)
  - [Data Dictionary — ComboItem](./docs/combo-product.md#data-dictionary--comboitem)
  - [Data Dictionary — ComboImage](./docs/combo-product.md#data-dictionary--comboimage)
  - [Availability Model (Three Numbers)](./docs/combo-product.md#availability-model-three-numbers)
  - [Bundling Rules](./docs/combo-product.md#bundling-rules)
  - [Price Snapshot Dating](./docs/combo-product.md#price-snapshot-dating)
  - [Relationships and Cascading Rules](./docs/combo-product.md#relationships-and-cascading-rules)
  - [Indexes & Constraints](./docs/combo-product.md#indexes--constraints)
  - [Conventions](./docs/combo-product.md#conventions)
  - [Example Data](./docs/combo-product.md#example-data)
  - [Known Gaps / Recommended Hardening](./docs/combo-product.md#known-gaps--recommended-hardening)
- [api end point and business logic](./docs/combo-product.md#api-end-point--business-logic)
  - [Endpoint Overview](./docs/combo-product.md#endpoint-overview)
  - [Response Shapes & Select Projections](./docs/combo-product.md#response-shapes--select-projections)
  - [Get All Combos (Admin) — `GET /combo/all-combo`](./docs/combo-product.md#get-all-combos-admin)
  - [Create a Combo Product — `POST /combo/create-combo`](./docs/combo-product.md#create-a-combo-product)
  - [Update a Combo Product — `PATCH /combo/update/:id`](./docs/combo-product.md#update-a-combo-product)
  - [Built but Not Yet Exposed](./docs/combo-product.md#built-but-not-yet-exposed)
### Blog
- [db schema](./docs/blog.md#db-schema)
  - [Entity-Relationship Diagram (ERD)](./docs/blog.md#entity-relationship-diagram-erd)
  - [Enum Definitions](./docs/blog.md#enum-definitions)
  - [Data Dictionary — Blog](./docs/blog.md#data-dictionary--blog)
  - [Relationships and Cascading Rules](./docs/blog.md#relationships-and-cascading-rules)
  - [Performance Optimizations (Indexes)](./docs/blog.md#performance-optimizations-indexes)
  - [Conventions](./docs/blog.md#conventions)
  - [Example Data](./docs/blog.md#example-data)
  - [Example Usage (JSON Response)](./docs/blog.md#example-usage-json-response)
  - [Implementation & Best Practices](./docs/blog.md#implementation--best-practices)
  - [Known Gaps / Recommended Hardening](./docs/blog.md#known-gaps--recommended-hardening)
- [api end point and business logic](./docs/blog.md#api-end-point--business-logic)
  - [Endpoint Overview](./docs/blog.md#endpoint-overview)
  - [Response Shapes & Select Projections](./docs/blog.md#response-shapes--select-projections)
  - [Create a Blog Post — `POST /blog/create-blog`](./docs/blog.md#create-a-blog-post)
  - [List All Blogs (Admin) — `GET /blog/all-blogs`](./docs/blog.md#list-all-blogs-admin)
  - [List Published Blogs (Public) — `GET /blog/published-blogs`](./docs/blog.md#list-published-blogs-public)
  - [Get Blog by Slug (Public) — `GET /blog/blog-by-slug/:slug`](./docs/blog.md#get-blog-by-slug-public)
  - [Update a Blog Post — `PATCH /blog/update-blog/:id`](./docs/blog.md#update-a-blog-post)
  - [Delete a Blog Post — `DELETE /blog/delete-blog/:id`](./docs/blog.md#delete-a-blog-post)
  - [Built but Not Yet Exposed](./docs/blog.md#built-but-not-yet-exposed)
### Support
- [db schema](./docs/support.md#db-schema)
  - [Entity-Relationship Diagram (ERD)](./docs/support.md#entity-relationship-diagram-erd)
  - [Enum Definitions](./docs/support.md#enum-definitions)
  - [Data Dictionary — Support](./docs/support.md#data-dictionary--support)
  - [Relationships and Cascading Rules](./docs/support.md#relationships-and-cascading-rules)
  - [Performance Optimizations (Indexes)](./docs/support.md#performance-optimizations-indexes)
  - [Conventions](./docs/support.md#conventions)
  - [Example Data](./docs/support.md#example-data)
  - [Example Usage (JSON Response)](./docs/support.md#example-usage-json-response)
  - [Implementation & Best Practices](./docs/support.md#implementation--best-practices)
    - [The One-Live-Page-Per-Type Rule](./docs/support.md#the-one-live-page-per-type-rule)
    - [Slug Handling](./docs/support.md#slug-handling)
    - [Admin-Form UX (multipart/form-data)](./docs/support.md#admin-form-ux-multipartform-data)
    - [Validation](./docs/support.md#validation)
  - [Known Gaps / Recommended Hardening](./docs/support.md#known-gaps--recommended-hardening)
- [api end point and business logic](./docs/support.md#api-end-point--business-logic)
  - [Endpoint Overview](./docs/support.md#endpoint-overview)
  - [Response Shapes & Select Projections](./docs/support.md#response-shapes--select-projections)
  - [Create a Support Page — `POST /support/create-support-page`](./docs/support.md#create-a-support-page)
  - [List All Support Pages (Admin) — `GET /support/all-support-pages`](./docs/support.md#list-all-support-pages-admin)
  - [List Active Pages (Public) — `GET /support/active-tabs`](./docs/support.md#list-active-pages-public)
  - [Get the Active Page for a Type (Public) — `GET /support/active-page/:type`](./docs/support.md#get-the-active-page-for-a-type-public)
  - [Get an Active Page by Slug (Public) — `GET /support/page/:slug`](./docs/support.md#get-an-active-page-by-slug-public)
  - [Update a Support Page — `PATCH /support/update-support-page/:id`](./docs/support.md#update-a-support-page)
  - [Delete a Support Page — `DELETE /support/delete-support-page/:id`](./docs/support.md#delete-a-support-page)
  - [Built but Not Yet Exposed](./docs/support.md#built-but-not-yet-exposed)
### Delivery (External Delivery Service)

> **Provider/zone CRUD is implemented; shipments/tracking are still schema-only.** Three delivery-related modules, easy to confuse: **this one** is the third-party courier directory (what a courier charges *us*, and where a parcel is). [Delivery Charge](#delivery-charge-shipping-rate-card) is the merchant's own rate card (what the *customer* pays). [Delivery Man](#delivery-man-in-house-delivery-staff) is in-house staff accounts.

- [topics covered](./docs/delivery.md#topics-covered)
- [db schema](./docs/delivery.md#db-schema)
  - [Entity-Relationship Diagram (ERD)](./docs/delivery.md#entity-relationship-diagram-erd)
  - [Enum Definitions](./docs/delivery.md#enum-definitions)
  - [Data Dictionary — DeliveryProvider](./docs/delivery.md#data-dictionary--deliveryprovider)
  - [Data Dictionary — DeliveryZone](./docs/delivery.md#data-dictionary--deliveryzone)
  - [Data Dictionary — DeliveryShipment](./docs/delivery.md#data-dictionary--deliveryshipment)
  - [Data Dictionary — DeliveryStatusHistory](./docs/delivery.md#data-dictionary--deliverystatushistory)
  - [Relationships and Cascading Rules](./docs/delivery.md#relationships-and-cascading-rules)
  - [Performance Optimizations (Indexes)](./docs/delivery.md#performance-optimizations-indexes)
  - [Conventions](./docs/delivery.md#conventions)
  - [Example Data](./docs/delivery.md#example-data)
  - [Example Usage (JSON Response)](./docs/delivery.md#example-usage-json-response)
  - [Implementation & Best Practices](./docs/delivery.md#implementation--best-practices)
  - [Known Gaps / Recommended Hardening](./docs/delivery.md#known-gaps--recommended-hardening)
- [api end point and business logic](./docs/delivery.md#api-end-point--business-logic)
  - [Implemented Today](./docs/delivery.md#implemented-today) — the four live routes
    - [The flat-row abstraction](./docs/delivery.md#the-flat-row-abstraction)
    - [Create — `POST /delivery/create-external-delivery-service`](./docs/delivery.md#create-an-external-delivery-service)
    - [List — `GET /delivery/all-external-delivery-services`](./docs/delivery.md#list-external-delivery-services)
    - [Update — `PATCH /delivery/update-external-delivery-service/:id`](./docs/delivery.md#update-an-external-delivery-service)
    - [Delete — `DELETE /delivery/delete-external-delivery-service/:id`](./docs/delivery.md#delete-an-external-delivery-service)
  - [Endpoint Overview](./docs/delivery.md#endpoint-overview) — Phase 2 plan, **not** implemented
  - [Get Delivery Quote (Public)](./docs/delivery.md#get-delivery-quote-public)
  - [Book a Shipment](./docs/delivery.md#book-a-shipment)
  - [Update Shipment Status](./docs/delivery.md#update-shipment-status)
  - [Public Tracking Lookup](./docs/delivery.md#public-tracking-lookup)
  - [Inbound Courier Webhook](./docs/delivery.md#inbound-courier-webhook)
### Delivery Charge (Shipping Rate Card)

> What the **customer** is charged to ship an order, and when it is waived. Not the same thing as [Delivery](#delivery-external-delivery-service), which is what a **courier** charges us.

- [What this replaced](./docs/delivery-charge.md#what-this-replaced)
- [db schema](./docs/delivery-charge.md#db-schema)
- [How a charge is calculated](./docs/delivery-charge.md#how-a-charge-is-calculated)
- [Where the quote route lives](./docs/delivery-charge.md#where-the-quote-route-lives)
- [api end points](./docs/delivery-charge.md#api-end-points)
- [Security](./docs/delivery-charge.md#security)
- [The order snapshot](./docs/delivery-charge.md#the-order-snapshot)
- [Admin UI](./docs/delivery-charge.md#admin-ui)
- [Storefront behaviour](./docs/delivery-charge.md#storefront-behaviour)
- [Seeded Thailand rate card](./docs/delivery-charge.md#seeded-thailand-rate-card)
- [Known Gaps / Recommended Hardening](./docs/delivery-charge.md#known-gaps--recommended-hardening)

### Delivery Man (In-House Delivery Staff)
- [db schema](./docs/delivery-man.md#db-schema)
  - [Entity-Relationship Diagram (ERD)](./docs/delivery-man.md#entity-relationship-diagram-erd)
  - [Enum Definitions](./docs/delivery-man.md#enum-definitions)
  - [Data Dictionary — DeliveryManProfile](./docs/delivery-man.md#data-dictionary--deliverymanprofile)
  - [Relationships and Cascading Rules](./docs/delivery-man.md#relationships-and-cascading-rules)
  - [Performance Optimizations (Indexes)](./docs/delivery-man.md#performance-optimizations-indexes)
  - [Conventions](./docs/delivery-man.md#conventions)
  - [Example Data](./docs/delivery-man.md#example-data)
  - [Example Usage (JSON Response)](./docs/delivery-man.md#example-usage-json-response)
  - [Implementation & Best Practices](./docs/delivery-man.md#implementation--best-practices)
  - [Known Gaps / Recommended Hardening](./docs/delivery-man.md#known-gaps--recommended-hardening)
- [api end point and business logic (planned)](./docs/delivery-man.md#api-end-point--business-logic-planned)
  - [Reuse, Don't Duplicate](./docs/delivery-man.md#reuse-dont-duplicate)
  - [Endpoint Overview](./docs/delivery-man.md#endpoint-overview)
  - [Onboard a New Delivery Man](./docs/delivery-man.md#onboard-a-new-delivery-man)
  - [List Delivery Men (Admin)](./docs/delivery-man.md#list-delivery-men-admin)
  - [Toggle Dispatch Availability](./docs/delivery-man.md#toggle-dispatch-availability)
  - [Verify / Reject NID](./docs/delivery-man.md#verify--reject-nid)
  - [Open Questions](./docs/delivery-man.md#open-questions)