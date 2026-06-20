# Pagination — Architecture & Workflow

This document is the single map of every pagination-related file in this service: where it lives, what owns it, and how to wire a new endpoint into it. Read this before adding a paginated list endpoint or changing the shared pagination contract.

> See also: [Prisma architecture](./prisma-architecture.md) for how `PrismaService`/`BaseRepository` fit in — `PaginationService` calls straight into a Prisma model delegate as its data source.

---

## 1. File map (at a glance)

```
src/shared/pagination/
├── index.ts                                  # Single public entrypoint — barrel re-export of everything below
├── pagination.module.ts                      # Plain (non-@Global) module — provides/exports PaginationService
├── pagination.service.ts                     # The engine: paginate() — offset + cursor pagination over any data source
├── constants/
│   └── pagination.constants.ts               # DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
├── dto/
│   └── pagination-query.dto.ts                # PaginationQueryDto — the @Query() shape every list endpoint accepts
├── interfaces/
│   ├── pagination-data-source.interface.ts   # IPaginationDataSource / TFindManyArgsOf — the ORM-agnostic port
│   └── pagination-result.interface.ts        # IPaginatedResult<T> / IPaginationMeta — the response shape
├── decorators/
│   └── paginated-response.decorator.ts        # @ApiPaginatedResponse(Model) — Swagger schema for {data, meta}
└── test/
    └── pagination.service.spec.ts             # Unit tests for paginate() (offset, cursor, search, sort, select/include)
```

---

## 2. How the pieces connect

```
HTTP GET /category/all-categories?page=2&limit=10&search=foo
   │
   ▼
@Query() paginationParams: PaginationQueryDto      (dto/pagination-query.dto.ts)
   - class-transformer coerces page/limit/cursor to numbers
   - class-validator enforces bounds (page ≥ 1, 1 ≤ limit ≤ MAX_PAGE_SIZE, sortOrder ∈ {asc, desc})
   │
   ▼
CategoryController.getAllCategories()
   │  passes paginationParams straight through, untouched
   ▼
CategoryService.getAllCategories(params)
   │  maps the eventual result.data through a Response DTO; never touches pagination internals
   ▼
CategoryRepository.findAllCategories(params)
   │  calls paginationService.paginate(client.category, params, { select, searchableFields, defaultSortField })
   ▼
PaginationService.paginate<T, TSource>()             (pagination.service.ts)
   - builds a `search` → `OR` where-clause from `searchableFields`
   - merges it with the caller's explicit `where`
   - branches: params.cursor set → cursor pagination | else → page/limit (skip/take) pagination
   - runs model.count() and model.findMany() in parallel
   - computes IPaginationMeta (totalItems, itemCount, totalPages, currentPage, nextCursor)
   │
   ▼
IPaginatedResult<T>  { data: T[], meta: IPaginationMeta }   (interfaces/pagination-result.interface.ts)
   │
   ▼
Controller forwards { data: result.data, meta: result.meta } via sendResponse()
   │
   ▼
@ApiPaginatedResponse(CategoryResponseDto)  (decorators/paginated-response.decorator.ts)
   - documents the exact { data: Model[], meta: {...} } shape in Swagger, keyed off IPaginationMeta
```

Key point: **`PaginationService` never imports Prisma.** It only knows about `IPaginationDataSource` (anything with `count()`/`findMany()`). A `PrismaClient['category']` delegate happens to satisfy that shape — so does any other repository, raw-SQL wrapper, or external API client that exposes the same two methods.

---

## 3. The data-source port (ORM-agnostic by design)

```ts
// interfaces/pagination-data-source.interface.ts
export interface IPaginationDataSource {
  count(args: { where?: any }): Promise<number>;
  findMany(args: any): Promise<any[]>;
}

export type TFindManyArgsOf<TSource extends IPaginationDataSource> =
  Parameters<TSource['findMany']>[0];
```

- `IPaginationDataSource` is the **port**. `PaginationService.paginate()` is generic over `TSource extends IPaginationDataSource`, so it compiles against anything shaped like a Prisma model delegate — `PrismaClient['category']`, `PrismaClient['user']`, a `Prisma.TransactionClient['category']`, or a hand-rolled adapter for a non-Prisma source.
- `TFindManyArgsOf<TSource>` extracts the **exact** `findMany` argument type the concrete source declares (e.g. Prisma's generated `Prisma.CategoryFindManyArgs`). This is why `options.where` / `options.select` / `options.include` in `paginate()` stay as strict as Prisma itself defines them instead of being hand-rolled `any` fields — a typo in a `select` key is still a compile error.
- Passing a `Prisma.TransactionClient`'s model delegate (instead of the top-level `PrismaService`'s) works transparently, since both satisfy the same shape. That's how `CategoryRepository.findAllCategories(params, tx?)` would extend to transactional reads if needed.

**Rule:** never special-case Prisma inside `pagination.service.ts`. If a future need (e.g. Elasticsearch-backed search) doesn't fit `count()`/`findMany()`, extend the interface rather than branching on source type.

---

## 4. `PaginationQueryDto` — the shared query contract

| Field | Type | Default | Validation | Notes |
|---|---|---|---|---|
| `page` | `number` | `DEFAULT_PAGE` (1) | `@Min(1)` | Ignored once `cursor` is set |
| `limit` | `number` | `DEFAULT_PAGE_SIZE` (10) | `@Min(1)`, `@Max(MAX_PAGE_SIZE)` (100) | Used as `take` in both modes |
| `sortOrder` | `'asc' \| 'desc'` | `'desc'` | `@IsIn(['asc','desc'])` | Applied to `defaultSortField` only — single-column sort |
| `search` | `string` | — | `@IsString()` | No-op unless the repository passes `searchableFields` |
| `cursor` | `number` | — | `@Min(1)` | **Presence flips the whole query into cursor mode** — see §5 |

- Every paginated controller method takes exactly one `@Query() params: PaginationQueryDto` parameter — never hand-roll `@Query('page') page: number` etc. This keeps validation, defaults, and Swagger docs centralized.
- `@Type(() => Number)` (class-transformer) is required on every numeric field because query strings arrive as strings; without it, `@IsNumber()` would reject `"2"`.

---

## 5. Offset vs. cursor pagination — the branch inside `paginate()`

`paginate()` supports two mutually exclusive modes, selected by a single runtime check: `const isCursorMode = cursor !== undefined`.

| | Offset mode (default) | Cursor mode (`cursor` provided) |
|---|---|---|
| Trigger | `cursor` query param absent | `cursor` query param present |
| Prisma args | `skip: (page - 1) * limit` | `cursor: { id: cursor }, skip: 1` |
| Use case | Page-number UI (`1 2 3 ... 10`) | Infinite scroll / "load more" on large tables |
| Cost on large tables | `skip` forces the DB to scan and discard N rows — gets slower as `page` grows | `cursor` seeks directly via the indexed `id` — constant-time regardless of how deep you page |
| `meta.currentPage` | Meaningful (`params.page`) | Present but **meaningless** — there's no fixed page index in cursor mode |
| `meta.nextCursor` | `null` unless the caller also happens to fill a full page | The `id` of the last row in the current page; `null` once `data.length < limit` (last page reached) |

**Cursor assumption:** cursor pagination hard-codes `id` as the cursor field (`cursor: { id: cursor }}` and reads `lastItem.id` for `nextCursor`). Every model used with `paginate()` must have a numeric, monotonically-ordered `id` column — this is not currently pluggable per call.

**Precedence:** per the DTO's own doc comment, `cursor` "takes precedence over `page`" — if both are sent, `page`/`skip` math is simply never computed because the `isCursorMode` branch short-circuits it.

---

## 6. Search — `searchableFields` and dot-path nesting

`paginate()` builds an `OR` where-clause from `options.searchableFields` only when `params.search` is non-empty *and* the array is non-empty. Each entry is a field name, optionally dotted to reach into a relation:

```ts
// CategoryRepository.findAllCategories
searchableFields: ['name', 'slug', 'nameTh']
// search = "foo" →
{ OR: [
  { name:   { contains: 'foo', mode: 'insensitive' } },
  { slug:   { contains: 'foo', mode: 'insensitive' } },
  { nameTh: { contains: 'foo', mode: 'insensitive' } },
] }
```

```ts
// dot-path → nested relation filter
searchableFields: ['profile.name']
// search = "bar" →
{ OR: [ { profile: { name: { contains: 'bar', mode: 'insensitive' } } } ] }
```

The generated `OR` clause is merged with the repository's own `where` via a plain object spread (`{ ...where, ...searchCondition }`). **This means a repository-supplied `where.OR` would be silently overwritten by the search condition** — if a repository needs both, it must combine them itself (e.g. nest its own `OR` inside an `AND`) before calling `paginate()`.

This merge is the one place the code intentionally widens past Prisma's strict `where` type (see the comment in `pagination.service.ts`) — a dynamically-keyed object built from `searchableFields` strings can't be statically checked against `Prisma.<Model>WhereInput`, so it's cast at that single point only.

---

## 7. Response shape — `IPaginatedResult<T>` and Swagger docs

```ts
// interfaces/pagination-result.interface.ts
interface IPaginationMeta {
  totalItems: number;     // COUNT(*) matching the filter
  itemCount: number;      // data.length for this response
  itemsPerPage: number;   // = limit, or totalItems if no limit was sent
  totalPages: number;     // ceil(totalItems / itemsPerPage), never 0
  currentPage: number;    // = page; not meaningful in cursor mode
  nextCursor: number | null;
}

interface IPaginatedResult<T> {
  data: T[];
  meta: IPaginationMeta;
}
```

- `T` is supplied explicitly by the caller at the `paginate<T, TSource>()` call site — typically `Prisma.<Model>GetPayload<{ select: typeof THE_SELECT_CONST }>` — so `result.data` is typed to the *exact* shape of the `select`/`include` that was passed, not a generic model type with extra fields the query never fetched.
- `@ApiPaginatedResponse(Model, description?)` (the decorator) generates the Swagger `{ data: Model[], meta: {...} }` schema for a controller method. Its `PAGINATION_META_SCHEMA` constant is typed as `Record<keyof IPaginationMeta, SchemaObject>` — **adding, renaming, or removing a field on `IPaginationMeta` without updating this map is a compile error**, not a silently-stale API doc.

**Rule:** any controller method returning a paginated list must use `@ApiPaginatedResponse(SomeResponseDto)` instead of hand-writing an `ApiOkResponse` schema, so the documented shape can never drift from what `paginate()` actually returns.

---

## 8. Wiring a new paginated endpoint (end-to-end recipe)

Using `CategoryModule` as the reference implementation:

1. **Module** — import `PaginationModule` alongside `PrismaModule` in the feature module (`PaginationModule` is **not** `@Global()` — every feature module that needs `PaginationService` must import it explicitly):
   ```ts
   @Module({ imports: [PrismaModule, PaginationModule], ... })
   ```
2. **Repository** — inject `PaginationService`, define a `<MODEL>_SELECT` const, and delegate:
   ```ts
   constructor(prisma: PrismaService, private readonly paginationService: PaginationService) {
     super(prisma);
   }

   async findAllCategories(params: PaginationQueryDto, tx?: Prisma.TransactionClient) {
     const client = tx || this.prisma;
     return this.paginationService.paginate<
       Prisma.CategoryGetPayload<{ select: typeof this.CATEGORY_SELECT }>,
       typeof client.category
     >(client.category, params, {
       select: this.CATEGORY_SELECT,
       searchableFields: ['name', 'slug', 'nameTh'],
       defaultSortField: 'createdAt',
     });
   }
   ```
3. **Service** — pass `PaginationQueryDto` straight through; only map `result.data` into a response DTO, never touch `meta`:
   ```ts
   async getAllCategories(params: PaginationQueryDto): Promise<IPaginatedResult<CategoryResponseDto>> {
     const result = await this.categoryRepository.findAllCategories(params);
     return { ...result, data: result.data.map((c) => new CategoryResponseDto(c, getBaseUrl())) };
   }
   ```
4. **Controller** — accept `@Query() params: PaginationQueryDto`, decorate with `@ApiPaginatedResponse(ResponseDto, '...')`, and forward both `data` and `meta` to `sendResponse()`:
   ```ts
   @Get('all-categories')
   @ApiPaginatedResponse(CategoryResponseDto, 'Categories retrieved successfully.')
   async getAllCategories(@Query() params: PaginationQueryDto, @Res() res: Response) {
     const result = await this.categoryService.getAllCategories(params);
     return sendResponse(res, { statusCode: HttpStatus.OK, success: true, data: result.data, meta: result.meta });
   }
   ```

---

## 9. Conventions to follow

- **Always** route list endpoints through `PaginationService.paginate()` — don't hand-roll `skip`/`take`/`count()` logic in a repository. `findAllActiveCategories()` and `findActiveRootCategories()` in `CategoryRepository` are the sanctioned exception: they're *unbounded* "give me everything matching this filter" reads with no UI pager, not paginated lists.
- **Always** type the `paginate<T, TSource>()` call explicitly with `Prisma.<Model>GetPayload<{ select: typeof YOUR_SELECT_CONST }>` as `T` — don't let it infer `any`, or the repository loses the compile-time link between its `select` and its return type.
- **Never** add a field to `IPaginationMeta` without also adding it to `PAGINATION_META_SCHEMA` in `paginated-response.decorator.ts` — the `Record<keyof IPaginationMeta, ...>` typing will fail to compile until you do, by design.
- **Never** rely on `meta.currentPage` or `meta.totalPages` in cursor mode — they're computed but not meaningful; cursor-mode clients should drive pagination off `meta.nextCursor` only.
- Cursor pagination requires the model to have a numeric `id` primary key ordered consistently with `defaultSortField`/`sortOrder` — don't wire cursor mode onto a model without one.
- If a repository needs its own `OR` clause *and* `searchableFields`, combine them manually before calling `paginate()` (see §6) — the library does a shallow merge and will let one `OR` clobber the other.
