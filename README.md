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
| Delivery module — schema design + API plan | [docs/delivery.md](./docs/delivery.md) |

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
  - [Availability Model (The Bottleneck Rule)](./docs/combo-product.md#availability-model-the-bottleneck-rule)
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
### Delivery (External Delivery Service) — schema design, not yet implemented
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
- [api end point and business logic (planned)](./docs/delivery.md#api-end-point--business-logic-planned)
  - [Endpoint Overview](./docs/delivery.md#endpoint-overview)
  - [Get Delivery Quote (Public)](./docs/delivery.md#get-delivery-quote-public)
  - [Book a Shipment](./docs/delivery.md#book-a-shipment)
  - [Update Shipment Status](./docs/delivery.md#update-shipment-status)
  - [Public Tracking Lookup](./docs/delivery.md#public-tracking-lookup)
  - [Inbound Courier Webhook](./docs/delivery.md#inbound-courier-webhook)
### Delivery Man (In-House Delivery Staff) — schema design, not yet implemented
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