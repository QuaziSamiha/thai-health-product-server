# Blog API — Endpoint ↔ Business Logic Reference

This document maps every **currently exposed** `blog` HTTP endpoint (`BlogController`) to the business logic behind it (`BlogService`) and the DB operation it ultimately runs (`BlogRepository`). For the DTO/Swagger contract see `src/modules/blog/dto/`; for the Prisma `select` shapes behind each read see `src/modules/blog/blog.select.ts`.

> Image URLs: `Blog.imageUrl` is stored as a relative path (e.g. `/uploads/blogs/images/abc.webp`). Unlike the `product` module (which prefixes via a shared `toAbsoluteUrl()` helper), both `BlogResponseDto` and `BlogResponsePublicDto` do this inline in their own constructors: `imageUrl.startsWith('http') ? imageUrl : `${baseUrl}${imageUrl}``, so a value already starting with `http` is left untouched.

---

## `POST /api/v1/blog/create-blog`

**Purpose**: Create a new blog post, optionally with a cover image, authored by the requesting user.

**Access**: `JwtAuthGuard` + `RolesGuard` + `@Roles(UserRole.ADMIN, UserRole.MARKETING)`, `multipart/form-data` (cover image uploaded via the `image` field, max 1, handled by `FileFieldsInterceptor`).

| Layer | What happens |
| :--- | :--- |
| Controller | `BlogController.createBlog(dto, files, req)` — reads the acting user's id off `req.user.id` (`UnauthorizedException` if missing); no other logic. |
| Service | `BlogService.createBlog(authorId, dto, image)` — derives/checks the slug, uploads the image if provided, computes `publishedAt`, creates the row, rolls back the uploaded file if the DB write fails. |
| Repository | `findSlugConflict(slug)` (uniqueness) → `createBlog(data)` — a single `blog.create()`. |

**Business logic — in order:**

1. **Slug derivation + uniqueness check.** `generateSlug(title)`, then `findSlugConflict(slug)` (the cheap `{ id, slug, title }` projection, no joins) → `409 Conflict` if any existing row already resolves to this slug.
2. **Image uploaded to disk *before* the DB write** (folder `blogs/images`) — the create call needs the final path as a plain column, there's no "create empty then attach" step.
3. **`publishedAt` is computed, never taken from the client** — `status === BlogStatus.PUBLISHED ? new Date() : null`. There is no field on `CreateBlogDto` for submitting an explicit publish timestamp: creating a post with `status: PUBLISHED` always stamps "now" as its publish time.
4. **The DB write is one `blog.create()` call** with the derived `slug`, the authenticated user as `authorId`, the optional `imageUrl`, and the computed `publishedAt`.
5. **Rollback on failure**: if step 4 throws (e.g. a slug race lost between step 1's check and the actual insert — the global exception filter maps the resulting Prisma `P2002` to a `409` regardless), the file uploaded in step 2 is deleted before the error propagates, so a failed create never leaves an orphaned file on disk.

**Response shape**: `BlogResponseDto` (admin/full detail — `status`, raw `authorId`, the full `author` object with `id`/`name`/`role`, `metaTitle`/`metaDescription`, `publishedAt`).

| Status | Cause |
| :--- | :--- |
| `201` | Blog post created successfully. |
| `400` | DTO validation failed (see `CreateBlogDto` — e.g. `title` under 3 or over 255 chars, `content` under 20 chars, invalid `status` enum value). |
| `401` | Missing/invalid JWT. |
| `403` | Authenticated but not `ADMIN`/`MARKETING`. |
| `409` | A blog post with this title (i.e. its derived slug) already exists. |

---

## `GET /api/v1/blog/all-blogs`

**Purpose**: Admin management-dashboard blog listing — paginated, searchable, with **no visibility filter at all**.

**Access**: `JwtAuthGuard` + `RolesGuard` + `@Roles(UserRole.ADMIN, UserRole.MARKETING)`.

| Layer | What happens |
| :--- | :--- |
| Controller | `BlogController.getAllBlogs(query)` — binds the shared `PaginationQueryDto` off the query string; no other logic. |
| Service | `BlogService.getAllBlogs(params)` — passes the params straight through to the repository, wraps each row in `BlogResponseDto`. |
| Repository | `findAllBlogsAdmin(params)` — no `where` clause; `PaginationService.paginate()` runs against every row regardless of status. |

**Business logic:**

1. **No visibility filtering, by design.** `DRAFT`, `ARCHIVED`, and `PUBLISHED` posts are all included — a management dashboard needs to see and act on everything, not just what the storefront shows.
2. **Search** — `search` matches `title`/`slug` (`searchableFields`), handled inside `PaginationService.paginate()`.
3. **Sorting/pagination** — standard `page`/`limit` or `cursor`-based, default sort field `createdAt`, direction from `sortOrder` (default `desc`).
4. **Response mapping** — every row wrapped in `new BlogResponseDto(blog, baseUrl)`, the full admin shape.

**Response shape**: `{ data: BlogResponseDto[], meta: IPaginationMeta }`.

| Status | Cause |
| :--- | :--- |
| `200` | Always — an empty `data` array is a valid response, not a `404`. |
| `401` | Missing/invalid JWT. |
| `403` | Authenticated but not `ADMIN`/`MARKETING`. |

---

## `GET /api/v1/blog/published-blogs`

**Purpose**: Paginated public storefront blog listing (the public "Blog" grid).

**Access**: Public — no auth guard, no role restriction.

| Layer | What happens |
| :--- | :--- |
| Controller | `BlogController.getAllPublishedBlogs(query)` — binds the shared `PaginationQueryDto`; no other logic. |
| Service | `BlogService.getAllPublishedBlogs(params)` — passes params straight through, wraps each row in `BlogResponsePublicDto`. |
| Repository | `findAllPublishedBlogs(params)` — `where: { status: PUBLISHED }`, `PaginationService.paginate()`. |

**Business logic:**

1. **Visibility gate is a single condition** — `status = PUBLISHED`. Unlike `product`'s public listing (which additionally requires `publishedAt <= now()` and `deletedAt IS NULL`), there is no separate `publishedAt` check here and blogs have no soft-delete column at all. In practice this rarely matters — `createBlog`/`updateBlog` always stamp `publishedAt` to "now" the moment `status` flips to `PUBLISHED` — but the query itself doesn't independently gate on the timestamp the way `product`'s does, so there's no way to schedule a "publish in the future" post through this endpoint's filtering alone.
2. **Search** — `search` matches `title`/`slug`.
3. **Sorting/pagination** — default sort field is **`publishedAt`**, not `createdAt` (most-recently-published leads by default); direction from `sortOrder` (default `desc`).
4. **Response mapping** — every row wrapped in `new BlogResponsePublicDto(blog, baseUrl)` — no `status`, no raw `authorId`/full `author`, just `authorName`.

**Response shape**: `{ data: BlogResponsePublicDto[], meta: IPaginationMeta }`.

| Status | Cause |
| :--- | :--- |
| `200` | Always — an empty `data` array (with accurate `meta.totalItems: 0`) is a valid response. |
| `400` | Query validation failed (e.g. `limit` over the max). |

---

## `GET /api/v1/blog/blog-by-slug/:slug`

**Purpose**: Public blog-detail page lookup.

**Access**: Public — no auth guard, no role restriction.

| Layer | What happens |
| :--- | :--- |
| Controller | `BlogController.getBlogBySlug(slug)` — takes the raw `:slug` path param, no validation pipe beyond the implicit string type. |
| Service | `BlogService.getBlogBySlug(slug)` — calls the repository, throws `NotFoundException('Blog post not found')` if nothing comes back, otherwise wraps the row in `BlogResponsePublicDto`. |
| Repository | `findBySlugPublic(slug)` — `blog.findUnique()` using `BLOG_SELECT_PUBLIC`, matched purely on `slug`. |

**Business logic — the visibility gate that isn't there:**

Unlike `product-by-slug`, this lookup applies **no filter on `status`**. A `DRAFT` or `ARCHIVED` post is returned exactly the same as a `PUBLISHED` one, as long as the slug matches — the only thing keeping an unpublished post out of casual discovery is that its slug never appears in `published-blogs`; a leaked or guessed slug for a draft is still fully fetchable through this route. `404` is reserved solely for a slug that matches **no row at all**, not for a row that exists but isn't published.

**Response shape**: `BlogResponsePublicDto` — no `status`, no raw `authorId`/full `author`; just `authorName`.

| Status | Cause |
| :--- | :--- |
| `200` | A row with this slug exists, regardless of its `status`. |
| `404` | Slug matches no row. |

---

## `PATCH /api/v1/blog/update-blog/:id`

**Purpose**: Partially update an existing blog post — only the fields present in the request body are touched.

**Access**: `JwtAuthGuard` + `RolesGuard` + `@Roles(UserRole.ADMIN, UserRole.MARKETING)`, `multipart/form-data` (new cover image uploaded via the `image` field, replaces the old one).

| Layer | What happens |
| :--- | :--- |
| Controller | `BlogController.updateBlog(id, dto, files)` — `ParseIntPipe` on `:id`; unlike `create`, there is **no** `req.user.id` check — the editor performing the update is never recorded anywhere (`Blog` has no `updatedByUser`/audit column). |
| Service | `BlogService.updateBlog(id, dto, image)` — existence check, conditional slug re-check, `publishedAt` transition logic, uploads the new image and deletes the old one, single scalar update. |
| Repository | `findByIdAdmin(id)` (existence + current state) → `findSlugConflict(newSlug)` (conditional) → `updateBlog(id, data)`. |

**Business logic — in order:**

1. **Existence check.** `findByIdAdmin(id)` → `404` if missing. Its result supplies the *current* `title`, `status`, and `imageUrl` needed by the steps below.
2. **Conditional slug re-check** — only runs if `dto.title` is present **and** differs from the current title. The new slug is re-checked via `findSlugConflict`, but only counts as a conflict if it belongs to a *different* row (`existingSlug.id !== id`) — otherwise a post would conflict with itself on every update that resends its own unchanged title.
3. **`publishedAt` transition** — stamped to `new Date()` only on an actual `DRAFT`/`ARCHIVED` → `PUBLISHED` transition (`status === PUBLISHED && blog.status !== PUBLISHED`); cleared to `null` if `status` moves to anything other than `PUBLISHED`. Re-saving an already-`PUBLISHED` post — with the same status or no status change at all — leaves `publishedAt` completely untouched; its original publish time is never reset.
4. **Image replacement ordering** — if a new image is uploaded, it's saved to disk and `updateData.imageUrl` is set immediately, and the **old** image file is deleted right after — **before** the DB update in step 5 actually runs. If that DB write then fails, the old file has already been permanently removed while the new file has no DB row referencing it yet; this endpoint does not currently guard against that window (contrast with `createBlog`, which only deletes an uploaded file *after* a confirmed failure, never before a write succeeds).
5. **Single `blog.update()` call** applies everything computed above at once. Any field absent from `dto` and untouched by steps 2–4 stays exactly as it was — Prisma ignores `undefined` keys in the update payload.

**Response shape**: `BlogResponseDto` (full admin detail), reflecting the row after the write.

| Status | Cause |
| :--- | :--- |
| `200` | Blog post updated successfully. |
| `400` | DTO validation failed (see `UpdateBlogDto`). |
| `401` | Missing/invalid JWT. |
| `403` | Authenticated but not `ADMIN`/`MARKETING`. |
| `404` | Blog post doesn't exist. |
| `409` | The new title's derived slug collides with a *different* post. |

---

## `DELETE /api/v1/blog/delete-blog/:id`

**Purpose**: Permanently remove a blog post and its stored cover image — a hard delete, not a status flip.

**Access**: `JwtAuthGuard` + `RolesGuard` + `@Roles(UserRole.ADMIN)` only — stricter than create/update, which also allow `MARKETING`.

| Layer | What happens |
| :--- | :--- |
| Controller | `BlogController.deleteBlog(id)` — `ParseIntPipe` on `:id`, no user-identity requirement (a hard delete isn't attributed to an actor). |
| Service | `BlogService.deleteBlog(id)` — existence check (and captures `imageUrl` before it's gone), deletes the row, then best-effort deletes the image file. |
| Repository | `findByIdAdmin(id)` (existence + current `imageUrl`) → `deleteBlog(id)` (`blog.delete()`). |

**Business logic — in order:**

1. **Existence check.** `findByIdAdmin(id)` → `404` if missing — also the only chance to read `imageUrl` before the row disappears.
2. **`blog.delete()`** — a genuine hard delete. `Blog.author`'s `onDelete: SetNull` is declared on the *User* side of the relation, not `Blog`'s — deleting a post has no cascading effect on its author's row; the reverse (deleting the author's user account nulling out `authorId` on their posts) is a separate, pre-existing behavior this endpoint doesn't trigger.
3. **File cleanup** — if the deleted row had an `imageUrl`, the file is removed from disk. Best-effort: a failed unlink is caught and logged (`logger.warn`), never thrown — the row is already gone from the DB by this point, so failing the HTTP response over a stray file would be misleading.

**Why there's no cascade to worry about**: unlike `product` (which cascades into `ProductVariant`/`ProductImage` rows on hard delete), `Blog` has no child tables. `totalComments` is a denormalized counter column on the row itself, not a relation to a separate `Comment` table, so nothing else in the schema references a blog post's id.

| Status | Cause |
| :--- | :--- |
| `204` | Delete succeeded (no response body). File-cleanup failures do not change this — they're logged, not surfaced. |
| `401` | Missing/invalid JWT. |
| `403` | Authenticated but not `ADMIN`. |
| `404` | Blog post doesn't exist. |

---

## Built but not yet exposed

None — every `BlogRepository` method (`findByIdAdmin`, `findBySlugPublic`, `findSlugConflict`, `findAllBlogsAdmin`, `findAllPublishedBlogs`, `createBlog`, `updateBlog`, `deleteBlog`) is called by exactly one `BlogService` method, and every service method is reachable through exactly one route above.
