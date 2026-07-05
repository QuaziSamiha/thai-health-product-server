# Product API — Endpoint ↔ Business Logic Reference

This document maps every **currently exposed** `product` HTTP endpoint (`ProductController`) to the business logic behind it (`ProductService`) and the DB operation it ultimately runs (`ProductRepository`). For the DTO/Swagger contract see `src/modules/product/dto/`; for the Prisma `select` shapes behind each read see `src/modules/product/product.select.ts`.

> Scope note: the repository/service layer already has more capability than is wired to a route today (admin/public listing, standalone image/variant management). Those are listed at the bottom under [Built but not yet exposed](#built-but-not-yet-exposed) — this document only describes what's actually reachable over HTTP right now.

---

## `POST /api/v1/product/create-product`

**Purpose**: Create a product (`SIMPLE` or `VARIABLE`) with optional gallery images and variants.

**Access**: Admin only — `JwtAuthGuard` + `RolesGuard` + `@Roles(UserRole.ADMIN)`, `multipart/form-data` (images uploaded via the `images` field, up to 10, handled by `FilesInterceptor`).

| Layer | What happens |
| :--- | :--- |
| Controller | `ProductController.createProduct(dto, images, req)` — reads the acting admin's id off `req.user.id` (`UnauthorizedException` if missing); no other logic. |
| Service | `ProductService.createProduct(userId, dto, images)` — uniqueness checks, uploads images, computes derived fields, builds variant inputs, creates the row, rolls back uploaded files if anything downstream fails. |
| Repository | `findByName` / `findBySlugAdmin` (uniqueness) → `createProduct(data)` — a single `product.create()` with nested `images`/`variants`, atomic as one Prisma call. |

**Business logic — in order:**

1. **Uniqueness checks.** `findByName(dto.name)` → `409` if taken. Slug is derived via `generateSlug(dto.name)`, then `findBySlugAdmin(slug)` → `409` if that collides too (only possible if two different names sanitize to the same slug, since name itself is already unique).
2. **Images are uploaded to disk *before* the DB write**, because the nested `images` create needs each file's final path as input — there's no "create empty then attach" step. If upload of any file fails partway, whatever succeeded so far is deleted immediately and the error propagates.
3. **Derived fields, computed regardless of what the client sent** (`buildStockAndVariants`):
   - `hasVariants` — `true` if `dto.variants` is a non-empty array, otherwise `false`. Never taken from the request directly (the DTO doesn't even expose this field).
   - `quantity` / `totalStock` — enforces the same invariant documented for the model: **SIMPLE** → `dto.quantity` (default `0`) is authoritative, `totalStock` mirrors it. **VARIABLE** → `quantity` is forced to `0` and `totalStock` is the sum of every variant's `quantity`, even if the client also sent a top-level `quantity` (it's discarded).
   - `stockStatus` — `IN_STOCK` if the effective stock count (`totalStock` for VARIABLE, `quantity` for SIMPLE) is `> 0`, else `OUT_OF_STOCK`. No `LOW_STOCK` computation — the schema has no `lowStockThreshold` column to compute it against.
4. **Per-variant computation** (`buildVariantInput`), for each entry in `dto.variants`:
   - `name` — the client's value, or `"${productName} ${size}"` if omitted.
   - `slug` — `${productSlug}-${generateSlug(name ?? size ?? 'variant-N')}`. `ProductVariant.slug` is unique **globally**, not scoped per product (a known schema characteristic, not something this endpoint changes) — prefixing with the parent's own already-unique slug keeps this collision-free in practice without altering the schema.
   - `stockStatus` — computed from that variant's own `quantity`, independently of the aggregate.
   - `attributes` — defaults to `{}` if omitted; passed through `toPlainJson()` to strip it down to a plain serializable value.
   - Everything else (`price`, `discountType`, `discountPrice`, `costPerItem`, `sku`, `barcode`, `weight`, `size`, `isDefault`) passes through as given.
5. **Default-variant guarantee**: if `type = VARIABLE` and no variant in the payload has `isDefault: true`, the **first** variant is forced to `isDefault: true` after the fact. The storefront always needs some variant pre-selected; the DTO doesn't require the client to mark one.
6. **The DB write itself is one atomic call** — `product.create({ data: { ..., images: { createMany }, variants: { createMany } } })`. Prisma wraps a single `create()` with nested writes in one transaction; there's no window where the product row exists without its images/variants or vice versa.
7. **Rollback on DB failure**: if step 6 throws (e.g. a category FK violation), every file uploaded in step 2 is deleted before the error propagates — otherwise a failed create would leave orphaned files with no DB row pointing at them.

**Response shape**: `ProductResponseDto` (full admin detail — the creator needs to see everything just created, including `costPrice`, the audit trail, and the raw `categoryId`), with the newly created `images` and `variants` nested in.

| Status | Cause |
| :--- | :--- |
| `201` | Product created successfully. |
| `400` | DTO validation failed (see `CreateProductDto`/`CreateProductVariantDto` — e.g. `salePrice > basePrice`, a `VARIABLE` product with no `variants`, malformed `dimensions`/`seoMetadata`). |
| `401` | Missing/invalid JWT. |
| `403` | Authenticated but not `ADMIN`. |
| `409` | A product with this name (or the derived slug) already exists. |

---

## `PATCH /api/v1/product/update-product/:id`

**Purpose**: Partially update an existing product — only the fields present in the request body are touched.

**Access**: Admin only — same guard/role stack as create, `multipart/form-data` (new images uploaded via the `images` field, up to 10).

| Layer | What happens |
| :--- | :--- |
| Controller | `ProductController.updateProduct(id, dto, images, req)` — reads the acting admin's id off `req.user.id` (`UnauthorizedException` if missing); no other logic. |
| Service | `ProductService.updateProduct(id, userId, dto, images)` — existence check, conditional name/slug re-check, uploads new images, resolves which stock fields (if any) need recomputing, runs the DB writes in one transaction, rolls back uploaded files if anything downstream fails. |
| Repository | `findByIdAdmin` (existence + current state) → `findByName` / `findBySlugAdmin` (conflict re-check) → `withTransaction(async tx => { replaceVariants?; createImages?; updateProduct })`. |

**Business logic — in order:**

1. **Existence check.** `findByIdAdmin(id)` → `404` if missing. Its result also supplies the *current* `name`, `slug`, `type`, `quantity`, and `images` needed by the steps below — this endpoint never blindly trusts the request for anything comparative.
2. **Conditional name/slug conflict check** — only runs if `dto.name` is present **and** differs from the current name. `findByName(dto.name)` and `findBySlugAdmin(newSlug)` are both re-checked, but a match only counts as a conflict if it belongs to a *different* row (`match.id !== id`) — otherwise a product would conflict with itself on every update that includes its own unchanged name.
3. **New images are uploaded to disk before the transaction**, same rollback-on-failure behavior as create. Unlike create, there's no "attach to the create call" step — they're inserted via `createImages` inside the transaction below, with `displayOrder` continuing from `existing.images.length` (never `0`), and `isPrimary: false` (existing primary image is never silently displaced by an update).
4. **`resolveStockUpdate(existing, dto, slug)`** decides whether `hasVariants`/`quantity`/`totalStock`/`stockStatus` need recomputing at all:
   - **Not touched** unless the request includes `type`, `quantity`, or `variants` — otherwise these fields are omitted from the update payload entirely (Prisma ignores `undefined` keys, so whatever was already stored stays exactly as it was).
   - **Effective type** = `dto.type ?? existing.type`.
   - If effective type is `VARIABLE` **and** `dto.variants` is provided: every entry is rebuilt via the same `buildVariantInput` used by create (own slug/stockStatus/attributes computation, first-variant-default fallback), `totalStock` becomes the sum of the new set, `quantity` is forced to `0`.
   - If effective type is `VARIABLE` but `variants` is *not* provided (e.g. only `isFeatured` changed): only `hasVariants: true, quantity: 0` are set — existing variants and `totalStock` are left alone.
   - If effective type is `SIMPLE`: `quantity = dto.quantity ?? existing.quantity`, `totalStock` mirrors it, `stockStatus` recomputed.
   - **Known limitation, by design**: flipping `type` between `SIMPLE` and `VARIABLE` without also sending `variants` does **not** itself create or delete variant rows — that's treated as a separate, more destructive operation this endpoint won't trigger implicitly.
5. **`variants`, if provided, is a full replacement** — `replaceVariants` wipes the existing set and inserts the new one (the same repository method already built for this exact purpose). Omitting `variants` entirely leaves the current variants completely untouched.
6. **One transaction** wraps `replaceVariants` (if applicable) → `createImages` (if applicable) → the scalar `updateProduct` call, via `productRepository.withTransaction(...)` called from the service layer (per the documented `withTransaction` convention — see `docs/concepts/prisma-concepts.md`). A failure partway never leaves new variants committed alongside stale scalar fields, or new images attached to a row whose other fields never actually updated.
7. **Rollback on transaction failure**: if any step inside the transaction throws, every file uploaded in step 3 is deleted before the error propagates — same reasoning as create.

**Response shape**: `ProductResponseDto` (full admin detail), reflecting the row *after* all of the above — including newly appended images and/or the replaced variant set.

| Status | Cause |
| :--- | :--- |
| `200` | Product updated successfully. |
| `400` | DTO validation failed (see `UpdateProductDto` — e.g. `salePrice > basePrice`, malformed `dimensions`/`seoMetadata`/`variants`). |
| `401` | Missing/invalid JWT. |
| `403` | Authenticated but not `ADMIN`. |
| `404` | Product doesn't exist. |
| `409` | The new `name` (or its derived slug) collides with a *different* product. |

---

## `GET /api/v1/product/published-products`

**Purpose**: Paginated, filterable storefront product listing (search/category/type), for category pages, search results, and browse grids.

**Access**: Public — no auth guard, no role restriction.

| Layer | What happens |
| :--- | :--- |
| Controller | `ProductController.getPublishedProducts(query)` — binds `PublishedProductsQueryDto` off the query string; no other logic. |
| Service | `ProductService.getPublishedProducts(query)` — the only work done here is parsing the CSV `categoryIds` string into `number[]`; everything else passes straight through to the repository, then each row is wrapped in `ProductResponsePublicDto`. |
| Repository | `ProductRepository.findAllProductsPublic(paginationParams, { categoryIds, type })` — already-existing method; builds the `where` from `publicVisibilityWhere()` plus the optional `categoryId: { in }` / `type` filters, and calls the shared `PaginationService.paginate()`. |

**Business logic — in order:**

1. **Query binding.** `PublishedProductsQueryDto` extends the shared `PaginationQueryDto` (`page`, `limit`, `sortOrder`, `search`, `cursor`) with two storefront-only filters: `categoryIds` (a comma-separated string of positive integers, validated with a regex — e.g. `"1,2,3"`) and `productType` (`SIMPLE` / `VARIABLE` / `COMBO`, validated with `@IsEnum`).
2. **CSV parsing happens in the service, not the repository** — `findAllProductsPublic`'s own contract explicitly expects already-parsed `number[]` filters, so this is the one place request-shape parsing belongs. `categoryIds` is split on `,`, each piece `Number()`-coerced and trimmed, and any non-integer result is filtered out defensively.
3. **Visibility gate** — identical to `product-by-slug`: `deletedAt IS NULL`, `status = ACTIVE`, `publishedAt <= now()`. Applied unconditionally; the extra filters only ever narrow this further, never bypass it.
4. **Search** — `search` matches against `name`, `slug`, `sku`, `nameTh` (the same `searchableFields` used by the admin list), handled entirely inside `PaginationService.paginate()`.
5. **Sorting/pagination** — standard offset pagination (`page`/`limit`) or cursor-based (`cursor`, which takes precedence over `page` when present), default sort field `createdAt`, direction from `sortOrder` (default `desc`, so newest products lead).
6. **Response mapping** — every row in `paginated.data` is wrapped in `new ProductResponsePublicDto(product)` (same shape as `product-by-slug`), while `meta` (`totalItems`/`itemCount`/`itemsPerPage`/`totalPages`/`currentPage`/`nextCursor`) passes through unchanged from the repository.

**Response shape**: `{ data: ProductResponsePublicDto[], meta: IPaginationMeta }` — see `ApiPaginatedResponse` for the exact Swagger schema.

| Status | Cause |
| :--- | :--- |
| `200` | Always — an empty `data` array (with accurate `meta.totalItems: 0`) is a valid, successful response, not a `404`. |
| `400` | Query validation failed (e.g. `categoryIds` not a comma-separated list of integers, `productType` not one of the enum values, `limit` over the max). |

---

## `GET /api/v1/product/product-by-slug/:slug`

**Purpose**: Storefront product detail page lookup.

**Access**: Public — no auth guard, no role restriction.

| Layer | What happens |
| :--- | :--- |
| Controller | `ProductController.getProductBySlug(slug)` — takes the raw `:slug` path param, no validation pipe beyond the implicit string type. |
| Service | `ProductService.getProductBySlug(slug)` — calls the repository, throws `NotFoundException('Product not found')` if nothing comes back, otherwise wraps the row in `ProductResponsePublicDto`. |
| Repository | `ProductRepository.findBySlugPublic(slug)` — `product.findFirst()` using `PRODUCT_SELECT_PUBLIC`, filtered by `publicVisibilityWhere()`. |

**Business logic — the visibility gate.** A product is only returned if **all three** hold:
- `deletedAt IS NULL` (not soft-deleted)
- `status = ACTIVE`
- `publishedAt <= now()` — a `NULL` `publishedAt` never satisfies this, so a product with no publish date set stays hidden until an admin explicitly schedules/publishes it.

A product that's `DRAFT`, `ARCHIVED`, `HIDDEN`, `INACTIVE`, soft-deleted, or scheduled for a future date returns **404**, identical to a genuinely nonexistent slug — this is intentional: the response never reveals *why* a product isn't visible, only that it isn't.

**Response shape**: `ProductResponsePublicDto` — includes `id`/`sid`; excludes `barcode`, `status`, `costPrice`, `discountType`, `discountValue`, exact `quantity`/`totalStock` (only the `stockStatus` badge), the raw `categoryId`, and the entire audit trail (`createdBy`/`updatedBy`/`deletedBy` + user snapshots). Includes nested `images` (`ProductImageDto[]`) and `variants` (`ProductVariantPublicDto[]`, itself excluding `barcode`/`costPerItem`/raw `quantity`).

| Status | Cause |
| :--- | :--- |
| `200` | Product exists and passes the visibility gate. |
| `404` | Slug doesn't exist, or exists but fails the visibility gate (deleted/draft/archived/hidden/inactive/not-yet-published). |

---

## `DELETE /api/v1/product/soft-delete-product/:id`

**Purpose**: Retire a product without destroying it — reversible.

**Access**: Admin only — `JwtAuthGuard` + `RolesGuard` + `@Roles(UserRole.ADMIN)`, requires a valid Bearer token.

| Layer | What happens |
| :--- | :--- |
| Controller | `ProductController.softDeleteProduct(id, req)` — `ParseIntPipe` on `:id`; reads the acting admin's id off `req.user.id` (guaranteed present past `JwtAuthGuard`, but still explicitly re-checked and thrown as `UnauthorizedException` if somehow missing). |
| Service | `ProductService.softDeleteProduct(id, deletedBy)` — existence check via `findByIdAdmin`, idempotency check (`ConflictException` if `deletedAt` is already set), then delegates. |
| Repository | `ProductRepository.softDeleteProduct(id, deletedBy)` — a transaction: updates the `Product` row (`deletedAt`, `deletedBy`, `status → ARCHIVED`) **and** `productImage.updateMany({ where: { productId: id } }, { isActive: false })` in the same transaction. |

**Business logic — what "soft delete" actually touches:**
- **Product**: `deletedAt` set to now, `deletedBy` set to the acting admin, `status` forced to `ARCHIVED` regardless of its previous value.
- **Images**: every image belonging to the product — both product-level and variant-level, since both are scoped by the same `productId` — gets `isActive: false`. This is a single `updateMany`, not per-image calls.
- **Variants**: **deliberately untouched**. `ProductVariant` has no soft-delete-capable column (no `deletedAt`, no `isActive`). This isn't a gap: nothing in the codebase queries a variant independently of its parent product, so once the parent fails `publicVisibilityWhere()`, its variants become unreachable through the public API regardless of their own row state.
- Both DB writes run in one transaction — a failure partway never leaves the product archived with its images still visible, or vice versa.

**Idempotency**: calling this twice on the same product returns `409 Conflict` the second time, not a silent no-op or a 500.

| Status | Cause |
| :--- | :--- |
| `204` | Soft delete succeeded (no response body). |
| `401` | Missing/invalid JWT. |
| `403` | Authenticated but not `ADMIN`. |
| `404` | Product doesn't exist. |
| `409` | Product's `deletedAt` is already set. |

---

## `DELETE /api/v1/product/permanently-delete-product/:id`

**Purpose**: Irreversibly remove a product, its variants, its images (DB rows), and the underlying image files on disk.

**Access**: Admin only — same guard/role stack as soft delete.

| Layer | What happens |
| :--- | :--- |
| Controller | `ProductController.permanentlyDeleteProduct(id)` — `ParseIntPipe` on `:id`, no user-identity requirement (nothing is attributed to an actor for a hard delete). |
| Service | `ProductService.hardDeleteProduct(id)` — fetches image paths first, deletes the row, then best-effort cleans up files. |
| Repository | `findImagePathsForDeletion(id)` (lean pre-delete lookup) → `hardDeleteProduct(id)` (`product.delete()`). |

**Business logic — the three-step sequence, in order:**
1. **`findImagePathsForDeletion(id)`** — a lean `findUnique` selecting only `{ id, images: { url, thumbnailUrl, bannerUrl, iconUrl } }`. This both confirms the product exists (`null` → `404`) and captures every stored file path *before* anything is deleted, since the rows won't exist to query afterward.
2. **`hardDeleteProduct(id)`** — `product.delete()`. The schema's `onDelete: Cascade` on both `ProductImage.product` and `ProductVariant.product` means Postgres removes every associated `product_images` and `product_variants` row automatically — the application does not issue separate deletes for them.
3. **File cleanup** — for every collected path (`url`, `thumbnailUrl`, `bannerUrl`, `iconUrl` across all images), `parseStoragePath()` splits it back into `{filename, folder}` and `StorageService.deleteFile()` removes it from disk. This step is **best-effort**: a failed unlink is caught and logged (`logger.warn`), never thrown — the DB delete has already committed by this point, so failing the HTTP request over a stray file would be misleading. All file deletions run concurrently via `Promise.all`.

**Why cascade isn't enough on its own**: `ON DELETE CASCADE` only removes database rows. The actual image files live on disk (or would live in S3/a CDN in a future storage backend) and are never touched by a SQL cascade — step 3 exists specifically to prevent orphaned files accumulating with every hard delete.

| Status | Cause |
| :--- | :--- |
| `204` | Hard delete succeeded (no response body). File-cleanup failures do not change this — they're logged, not surfaced. |
| `401` | Missing/invalid JWT. |
| `403` | Authenticated but not `ADMIN`. |
| `404` | Product doesn't exist. |

---

## Built but not yet exposed

These exist in `ProductRepository`/`ProductService` (or a matching DTO already exists in `dto/`) but have no `ProductController` route yet:

| Capability | Repository method | Notes |
| :--- | :--- | :--- |
| Admin product list (paginated) | `findAllProductsAdmin` | |
| Admin single lookups | `findByIdAdmin`, `findBySlugAdmin` | No route restricts these to admin yet. |
| Dropdown/autocomplete list | `findProductDropdownOptions` | |
| Minified lookups (cart/order/wishlist embedding) | `findByIdMinified`, `findByIdPublic` | |
| Standalone image management | `findImagesByIds`, `deleteImages` | `createImages` is now used internally by both create and update. |

---

## Repository organization — why `ProductVariant`/`ProductImage` live in `ProductRepository`

`ProductVariant` and `ProductImage` are separate tables but deliberately **don't** get their own repository classes today, unlike the `user` module (`UserRepository` / `ProfileRepository` / `UserSecurityRepository` are already three separate classes for what is also a 1:1/1:many child-table relationship).

The difference: `Profile`/`UserSecurity` represent genuinely distinct concerns accessed in their own right. `ProductVariant`/`ProductImage` have no standalone access pattern — nothing outside `ProductService` queries them directly, and every endpoint above only touches them *as part of* a product's own lifecycle (nested create, cascade delete, `updateMany` scoped by `productId`). Splitting them out now would just move ~5 methods into new files with no behavior change.

**Revisit this if**: variant/image methods grow enough to need their own standalone endpoints (e.g. a dedicated `GET /product-variant/:id`, bulk image reordering, variant search) — at that point, mirror the `user` module's exact structure: `repositories/product-variant.repository.ts` + `repositories/product-image.repository.ts`.
