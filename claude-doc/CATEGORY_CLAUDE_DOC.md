# Category Module — Code Review & Activity Log

**Date:** 2026-06-06
**Scope:** `src/modules/category/`
**Files touched:** controller, service, repository, create-category.dto, update-category.dto, test/category.service.spec.ts, test/category.controller.spec.ts

---

## 1. Files Reviewed

| File | Role |
|---|---|
| `category.controller.ts` | HTTP layer — routes, guards, file interceptors, Swagger |
| `category.service.ts` | Business logic — slug generation, image upload, level calculation |
| `category.repository.ts` | Prisma data access — queries, select shapes |
| `dto/create-category.dto.ts` | Validation and transform for POST body |
| `dto/update-category.dto.ts` | Validation and transform for PATCH body |
| `dto/category-response.dto.ts` | Response shape — URL resolution, relational mapping |

---

## 2. Issues Found

### 2.1 Critical — Controller catch blocks sent wrong HTTP status codes

**Files:** `category.controller.ts` (all 5 endpoints)

**Problem:** Every `catch` block hardcoded `HttpStatus.BAD_REQUEST` (400) regardless of what the service actually threw. When the service raised a `NotFoundException` (404) or `ConflictException` (409), the caller received a misleading `400`. This broke the API contract and made client-side error handling unreliable.

**Fix:** Import `HttpException` from `@nestjs/common`. In every catch block, resolve the status code with:
```typescript
const statusCode =
  error instanceof HttpException
    ? error.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;
```
Unknown/unexpected errors now correctly return `500 INTERNAL_SERVER_ERROR` instead of `400`.

---

### 2.2 Bug — `isFeatured` boolean silently rejected in multipart/form-data

**Files:** `dto/create-category.dto.ts`, `dto/update-category.dto.ts`

**Problem:** `multipart/form-data` encodes all field values as strings. The class-validator `@IsBoolean()` decorator rejects the strings `"true"` and `"false"` — it only accepts a native JS `boolean`. Without a `@Transform`, submitting `isFeatured=true` from Swagger UI or any form client would always fail validation with a misleading error.

**Fix:** Added a `@Transform` before `@IsBoolean` in both DTOs:
```typescript
@Transform(({ value }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
})
@IsBoolean({ message: 'Is featured must be either true or false' })
isFeatured?: boolean;
```
Note: `parentId` and `displayOrder` already had `@Type(() => Number)` for the same reason.

---

### 2.3 Bug — Orphaned DB record left behind when image upload fails

**File:** `category.service.ts` → `createCategory`

**Problem:** The service creates the category DB record first, then uploads images. If any upload threw (e.g. S3 timeout), the catch block cleaned up partially uploaded files but did **not** delete the category row. The database was left with a ghost record that had no images and could not be re-created (slug uniqueness would block it).

**Fix:** Call `repo.deleteCategory(newCategory.id)` before cleaning up orphaned files in the catch block:
```typescript
} catch (uploadError) {
  await this.categoryRepository
    .deleteCategory(newCategory.id)
    .catch((e) => this.logger.warn(`Could not delete orphaned category: ${e}`));
  // ... then clean up uploaded files
  throw uploadError;
}
```
Also added `deleteCategory(id)` method to `category.repository.ts`.

---

### 2.4 Missing Swagger Decorators

**File:** `category.controller.ts`

**Problem:**
- `updateCategory` had **zero** Swagger decorators — it was invisible and undocumented in Swagger UI.
- `createCategory` was missing `@ApiUnauthorizedResponse`, `@ApiForbiddenResponse`, `@ApiNotFoundResponse`, `@ApiConflictResponse`.
- `getAllCategories` was missing `@ApiUnauthorizedResponse` and used `@ApiResponse` instead of the typed `@ApiOkResponse`.
- `getCategoryBySlug` was missing `@ApiNotFoundResponse`.
- Response decorators used `@ApiResponse` (generic) instead of `@ApiOkResponse` / `@ApiCreatedResponse` (typed, schema-aware).
- `createCategory`'s `FileFieldsInterceptor` included an `'image'` field that the DTO and service never used.

**Fix:** Full decorator set added to every endpoint. `updateCategory` now has:
```typescript
@ApiOperation({ summary: 'Update a category', description: '...' })
@ApiBody({ type: UpdateCategoryDto })
@ApiOkResponse({ type: CategoryResponseAdminDto })
@ApiBadRequestResponse(...)
@ApiUnauthorizedResponse(...)
@ApiForbiddenResponse(...)
@ApiNotFoundResponse(...)
@ApiConflictResponse(...)
```
The unused `'image'` field was removed from `createCategory`'s interceptor. The `'image'` field is intentionally kept only on `updateCategory` where the service uses it as a `bannerImage` alias.

---

## 3. Changes Made

### `category.controller.ts`

- Added `HttpException` import.
- Replaced all hardcoded `HttpStatus.BAD_REQUEST` in catch blocks with dynamic `error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR`.
- Removed `ApiResponse` import (replaced with specific decorators).
- Added imports: `ApiUnauthorizedResponse`, `ApiForbiddenResponse`, `ApiNotFoundResponse`, `ApiConflictResponse`, `ApiOkResponse`.
- Added full Swagger decoration to `updateCategory`.
- Completed Swagger decoration on all other endpoints.
- Removed unused `'image'` field from `createCategory` FileFieldsInterceptor.
- Fixed `req?.user?.id` to `req.user.id` in `updateCategory` (unnecessary optional chaining after the guard check).

### `category.service.ts`

- In `createCategory` catch block: added `repo.deleteCategory(newCategory.id)` call before file cleanup to prevent orphaned DB records.

### `category.repository.ts`

- Added `deleteCategory(id, tx?)` method:
```typescript
async deleteCategory(id: number, tx?: Prisma.TransactionClient) {
  const client = tx || this.prisma;
  return await client.category.delete({ where: { id } });
}
```

### `dto/create-category.dto.ts`

- Added `Transform` to imports from `class-transformer`.
- Added `@Transform` decorator to `isFeatured` to convert `"true"`/`"false"` strings to native booleans.

### `dto/update-category.dto.ts`

- Same `Transform` import and `@Transform` on `isFeatured` as above.

---

## 4. Test Cases Written

### `test/category.service.spec.ts` — 25 test cases

All repository and storage calls are mocked. `getBaseUrl` is mocked to return `http://localhost:3000`.

#### `createCategory`
| # | Description |
|---|---|
| 1 | Creates root category (no parent, no images) — verifies level=0 |
| 2 | Creates child category — verifies level = parent.level + 1 |
| 3 | Throws `NotFoundException` when parentId points to non-existent category |
| 4 | Throws `ConflictException` when slug already exists |
| 5 | Uploads all 3 images, calls `updateCategory` with all 3 URLs |
| 6 | Uploads only `iconImage` — only one `saveFile` call, only icon URL updated |
| 7 | Upload failure → deletes orphaned DB record + cleans partial uploads |
| 8 | No images provided → `saveFile` and `updateCategory` never called |

#### `getAllCategories`
| # | Description |
|---|---|
| 9 | Returns paginated result with mapped DTOs and meta |

#### `getAllActiveCategories`
| # | Description |
|---|---|
| 10 | Returns all active categories as DTOs |
| 11 | Returns empty array when no active categories exist |

#### `getActiveRootCategories`
| # | Description |
|---|---|
| 12 | Returns minimal `{ id, name }` DTOs for root categories |

#### `getCategoryBySlug`
| # | Description |
|---|---|
| 13 | Returns `CategoryResponseAdminDto` when slug exists |
| 14 | Throws `NotFoundException` when slug does not exist |

#### `updateCategory`
| # | Description |
|---|---|
| 15 | Throws `NotFoundException` when category id does not exist |
| 16 | Throws `BadRequestException` when `parentId === id` (self-parent) |
| 17 | Generates new slug when name changes |
| 18 | Does NOT regenerate slug when name is unchanged |
| 19 | Throws `ConflictException` when new name collides with another category's slug |
| 20 | Does NOT throw conflict when slug matches own record (idempotent rename) |
| 21 | Sets `level = 0` when `parentId` is explicitly `null` (promote to root) |
| 22 | Sets `level = parent.level + 1` when `parentId` changes |
| 23 | Throws `NotFoundException` when new `parentId` does not exist |
| 24 | Uploads new `bannerImage`, saves URL, deletes old file |
| 25 | `image` field treated as alias for `bannerImage` during update |
| 26 | Uploads new `iconImage`, deletes old icon file |
| 27 | Uploads new `thumbnailImage`, deletes old thumbnail file |
| 28 | Skips `deleteFile` when no previous image URL exists |
| 29 | Returns updated `CategoryResponseAdminDto` |

---

### `test/category.controller.spec.ts` — 22 test cases

Service is fully mocked. `makeMockResponse()` returns a chainable `res.status().json()` spy. No NestJS guards are loaded — auth is tested by injecting an `{ user: undefined }` request object.

#### `createCategory`
| # | Description |
|---|---|
| 1 | `201` + `success: true` + data on success |
| 2 | `401` when `req.user` is undefined |
| 3 | `404` when service throws `NotFoundException` |
| 4 | `409` when service throws `ConflictException` |
| 5 | `500` for unexpected errors |
| 6 | Forwards uploaded files to service correctly |

#### `getAllCategories`
| # | Description |
|---|---|
| 7 | `200` with data and meta |
| 8 | `500` on unexpected service error |

#### `getAllActiveCategories`
| # | Description |
|---|---|
| 9 | `200` with category list |
| 10 | `500` on unexpected service error |

#### `getRootCategories`
| # | Description |
|---|---|
| 11 | `200` with root category list |
| 12 | `500` on unexpected service error |

#### `getCategoryBySlug`
| # | Description |
|---|---|
| 13 | `200` with category DTO |
| 14 | `404` when service throws `NotFoundException` |

#### `updateCategory`
| # | Description |
|---|---|
| 15 | `200` with updated DTO |
| 16 | `401` when `req.user` is undefined |
| 17 | `404` when service throws `NotFoundException` |
| 18 | `409` when service throws `ConflictException` |
| 19 | `401` when service throws `UnauthorizedException` |
| 20 | Forwards all 4 uploaded files to service |
| 21 | `500` on unexpected service error |

---

## 5. What Was Already Well-Done

- **Repository select shapes** (`CATEGORY_SELECT`, `ROOT_ACTIVE_CATEGORY_SELECT`) are defined as `const` objects — prevents field drift between queries.
- **Slug generation utility** handles Unicode normalization, diacritics, spaces, and consecutive dashes correctly.
- **Image URL resolution** in `CategoryResponseAdminDto` correctly handles both absolute URLs (already starts with `http`) and relative paths (prepends `BASE_URL`).
- **Pagination** is cleanly delegated to `PaginationService` — single responsibility.
- **Error message constants** are centralized in `ERROR_MESSAGES` — no magic strings in service or controller.
- **Storage abstraction** behind `IStorageService` interface — storage provider can be swapped without touching business logic.
- **Transaction client (`tx?`) pattern** on every repository method — ready for transactional use.
- **Level calculation** is correct — traverses parent chain and sets `level = parent.level + 1`.
- **Old file cleanup on update** — deletes stale images from storage when replaced.

---

## 6. Remaining Recommendations (Not Implemented)

These are architectural suggestions for future consideration, not bugs:

1. **Circular parent detection in `updateCategory`** — if A's parent is B and B's parent is C, setting C's parent to A creates a cycle. A recursive ancestry check should be added.

2. **Transactional category creation** — wrap the `createCategory` + `updateCategory` (for image URLs) in a single Prisma transaction so image URLs are atomically committed with the category.

3. **File size / MIME type validation** — the `FileFieldsInterceptor` accepts any file type. Add `fileFilter` and `limits.fileSize` to restrict to images only.

4. **`UpdateCategoryDto.parentId` cannot be set to `null` via form-data** — `@Min(1)` blocks `null`/`0`. To support "detach from parent", a dedicated `removeParent: boolean` field or a separate endpoint would be cleaner than relying on the service-level `parentId === null` check.

5. **`image` alias for `bannerImage` in update** — `images.bannerImage || images.image` is implicit. Either document it explicitly in Swagger (`@ApiProperty({ description: 'Alias for bannerImage' })`) or remove the alias and use `bannerImage` exclusively.
