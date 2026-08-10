# Promotion Module

Coupon/promo code management. Admins (and Marketing) create `FIXED` or `PERCENTAGE` discount codes with optional usage limits, minimum-order thresholds, and validity windows; customers preview a code's discount at cart/checkout time and it is re-validated and redeemed atomically when the order is placed.

Schema source: `prisma/schema/promotion.prisma` (`PromoCode`, `PromoCodeRedemption`; `DiscountType` is shared with `Product`/`ProductVariant` — defined in `shared.prisma`).
Module source: `src/modules/promotion/` (`promotion.controller.ts`, `promotion.service.ts`, `promotion.repository.ts`, `dto/`).

> **Scope note:** This module owns `PromoCode` CRUD and the read-only validate/preview endpoint. It does not itself touch `Order` — the actual redemption (guarded usage reservation + ledger write) happens from inside `OrderService.placeOrder`'s own transaction, which imports `PromotionModule` and calls back into `PromotionService`. See `docs/order.md`'s [Promo Code Integration](order.md#promo-code-integration) section for that side.

---

### DB Schema

#### Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    PROMO_CODE ||--o{ PROMO_CODE_REDEMPTION : "redeemed via"
    USER ||--o{ PROMO_CODE_REDEMPTION : "redeems (nullable — guest)"
    ORDER ||--|| PROMO_CODE_REDEMPTION : "redeemed on (unique)"

    PROMO_CODE {
        int id PK
        uuid sid UK "public identifier"
        string code UK "customer-facing, stored uppercase"
        enum discountType "FIXED | PERCENTAGE"
        decimal discountValue
        decimal minOrderAmount "nullable"
        decimal maxDiscountAmount "nullable — PERCENTAGE only"
        int usageLimit "nullable — total redemptions, null = unlimited"
        int usageLimitPerUser "nullable, default 1"
        int usedCount "denormalized counter"
        bool isActive
        datetime startsAt "nullable"
        datetime endsAt "nullable"
    }

    PROMO_CODE_REDEMPTION {
        int id PK
        int promoCodeId FK
        int userId FK "nullable — guest redemption"
        int orderId FK UK "one redemption per order"
        decimal discountApplied "snapshot, independent of later PromoCode edits"
        datetime redeemedAt
    }
```

**Cardinality legend:** `||--o{` = one-to-many, `||--||` = one-to-one. `PromoCodeRedemption.orderId` is `@unique` — a code is applied at most once per order. `userId` is nullable for guest checkouts; enforcing `usageLimitPerUser` for a guest falls back to matching on the order's `customerEmail` — see [Per-Customer Usage Limit](#per-customer-usage-limit).

---

#### Data Dictionary — PromoCode (selected fields; full list in `promotion.prisma`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `code` | `VARCHAR(50)` UNIQUE | Customer-facing, always stored/queried uppercase (app-layer convention, enforced by every DTO that accepts a code). |
| `discountType`/`discountValue` | `ENUM`/`DECIMAL(12,2)` | `FIXED` = flat currency amount; `PERCENTAGE` = percent of subtotal (0–100). Immutable after creation — see [Conventions](#conventions). |
| `minOrderAmount` | `DECIMAL(12,2)` NULLABLE | Subtotal must reach this before the code applies. |
| `maxDiscountAmount` | `DECIMAL(12,2)` NULLABLE | Caps the payout for a `PERCENTAGE` code. Rejected on `FIXED` (already a hard cap on its own — see [Conventions](#conventions)). |
| `usageLimit`/`usageLimitPerUser` | `INT` NULLABLE | Total redemptions across all customers / per customer. `null` = unlimited. |
| `usedCount` | `INT` | Denormalized counter, incremented once per successful redemption — same cache pattern as `Product.totalStock`. |
| `isActive` | `BOOLEAN` | An inactive code is treated as retired — see [Update Rules](#update-a-promo-code). |
| `startsAt`/`endsAt` | `TIMESTAMPTZ(3)` NULLABLE | Validity window. Either end may be open (`null`). |

#### Data Dictionary — PromoCodeRedemption

The authoritative ledger for enforcing `usageLimit`/`usageLimitPerUser` — `Order.appliedPromoCode` is only a denormalized display copy (see `order.prisma`). One row per order a code was applied to; `discountApplied` is a snapshot, independent of any later edit to `PromoCode.discountValue`/`maxDiscountAmount`.

---

#### Relationships and Cascading Rules

| Parent → Child | FK Column | On Delete | Effect |
| :--- | :--- | :--- | :--- |
| `PromoCode` → `PromoCodeRedemption` | `promoCodeId` | **CASCADE** | This is exactly why `PromoCode` has no hard-delete endpoint — deleting a code would silently erase its redemption history. Retire a code via `isActive: false` instead. |
| `User` → `PromoCodeRedemption` | `userId` | **SET NULL** | Deleting a user account does not delete their redemption history; the row survives with `userId: null`, indistinguishable from a guest redemption after the fact. |
| `Order` → `PromoCodeRedemption` | `orderId` | **CASCADE** | Orders are never deleted through the API (cancelled, not deleted — see `order.md`), so this only matters for data-layer consistency. |

---

#### Conventions

- **`code` and `discountType` are immutable after creation.** `UpdatePromoCodeDto` cannot change either — changing `discountType` after the code may have been redeemed would make the `PromoCodeRedemption.discountApplied` snapshots hard to reason about. Retire a code (`isActive: false`) and create a new one instead.
- **`maxDiscountAmount` is rejected on a `FIXED` code**, both at the DTO level (`CreatePromoCodeDto` uses `@IsEmptyWhen('discountType', DiscountType.FIXED)`) and again defensively in `PromotionService.updatePromoCode` — a flat discount is already a hard cap on its own, so a second cap is meaningless and only invites confusion.
- **An inactive code can only be reactivated, not edited.** `PromotionService.updatePromoCode` rejects any update to a code with `isActive: false` unless the same request also sets `isActive: true` — otherwise an admin could reshape a retired code (new limit, new dates) that no one intended to keep using.
- **`usageLimit` can never be lowered below the current `usedCount`.** Prevents retroactively invalidating redemptions that already happened.
- **Money math uses plain `Number` + `Math.round(x * 100) / 100`**, matching the repo-wide convention already established in `order.prisma`'s own docs (`round2` in both `PromotionService` and `OrderService`), not a `Decimal` arithmetic library.
- **Every DateTime column is `@db.Timestamptz(3)`** — repo-wide convention.

---

### API Endpoints & Business Logic

Every endpoint is served by `PromotionController` → `PromotionService` → `PromotionRepository`. All routes are prefixed `/api/v1/promotion/promo-codes`.

#### Endpoint Overview

| Method | Path | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/create-promo-code` | `ADMIN`, `MARKETING` | [Create a promo code](#create-a-promo-code) |
| `GET` | `/all-promo-codes` | `ADMIN`, `MARKETING` | List promo codes, paginated, filterable |
| `POST` | `/validate` | Public (optional JWT) | [Validate a promo code](#validate-a-promo-code-preview) |
| `GET` | `/:id` | `ADMIN`, `MARKETING` | One promo code by id |
| `PATCH` | `/update-promo-code/:id` | `ADMIN`, `MARKETING` | [Update a promo code](#update-a-promo-code) |

`/all-promo-codes` and `/validate` are declared before the bare `GET /:id` route so neither literal path is ever swallowed by the `:id` param match — same ordering discipline `OrderController` documents for its own routes.

There is deliberately **no delete endpoint** — see [Relationships and Cascading Rules](#relationships-and-cascading-rules).

---

#### Create a Promo Code

**`POST /api/v1/promotion/promo-codes/create-promo-code`**

Validates, in order:
1. A `PERCENTAGE` code's `discountValue` cannot exceed `100`.
2. `endsAt`, if given, cannot be in the past.
3. `code` must not already exist (`ConflictException` → `409`).

`usageLimitPerUser` defaults to `1` at the DB level (`promotion.prisma`) if omitted; `usageLimit` omitted means unlimited total redemptions.

| Status | Cause |
| :--- | :--- |
| `201` | Promo code created successfully. |
| `400` | Invalid input; percentage over 100; end date in the past. |
| `409` | A promo code with this `code` already exists. |

---

#### Validate a Promo Code (Preview)

**`POST /api/v1/promotion/promo-codes/validate`**

Works with or without a Bearer token (`@Public()` + `JwtAuthGuard`, same optional-auth shape as `POST /order/place-order`) — the cart/checkout page calls this on every "Apply Coupon" click, before an order exists. **Read-only**: it does not touch `usedCount` or write a `PromoCodeRedemption` row. Placing the order re-validates and actually reserves the code from scratch (see `order.md`) — a preview response is a hint to the UI, never a guarantee the code will still work by the time checkout completes.

**Checks, in order** (`PromotionService.previewDiscount` → shared `assertUsable`):
1. Code exists (unknown code → generic `400 "Invalid promo code"`, not `404` — a coupon code is treated as a credential-shaped input, not a resource lookup).
2. `isActive`.
3. Within `startsAt`/`endsAt` window (if set).
4. `subtotal >= minOrderAmount` (if set).
5. `usedCount < usageLimit` (if set).
6. Per-customer limit — see [Per-Customer Usage Limit](#per-customer-usage-limit).

**Response shape**: `PromoCodeValidationResponseDto` — deliberately leaner than the admin `PromoCodeResponseDto` (no `usageLimit`/`usedCount`/other back-office fields), same data-hygiene split as `SupportResponseDto`/`SupportResponsePublicDto`. Returns the resolved `discountAmount`, already capped.

| Status | Cause |
| :--- | :--- |
| `200` | Promo code is valid — discount preview returned. |
| `400` | Invalid, inactive, expired, or not-yet-started code; subtotal below `minOrderAmount`; usage limit reached (total or per-customer). |

---

#### Per-Customer Usage Limit

`usageLimitPerUser` is enforced by counting existing `PromoCodeRedemption` rows:

| Caller | Counted by |
| :--- | :--- |
| Logged-in customer | `PromoCodeRedemption.userId` |
| Guest, `email` provided | `PromoCodeRedemption.userId IS NULL AND order.customerEmail = email` |
| Guest, no `email` | Not counted — treated as `0` (permissive default; there is nothing to identify the customer by) |

This is the same "app-layer only, by email" contract documented on `PromoCodeRedemption` in `promotion.prisma` for guest redemptions — it is a soft constraint, not a hard security boundary. `POST /order/place-order` always has `dto.email` (a required checkout field), so this gap in practice only affects a guest calling the standalone `/validate` preview without supplying `email`.

---

#### Update a Promo Code

**`PATCH /api/v1/promotion/promo-codes/update-promo-code/:id`**

`code`/`discountType` are not accepted by `UpdatePromoCodeDto` at all — see [Conventions](#conventions). Business-rule checks in `PromotionService.updatePromoCode`, in order:
1. The code must exist (`404` otherwise).
2. If the code is currently `isActive: false`, the request must set `isActive: true` — any other edit to an inactive code is rejected.
3. `usageLimit` cannot be set below the current `usedCount`.
4. `maxDiscountAmount` cannot be set on a code whose (immutable) `discountType` is `FIXED`.
5. If `endsAt` is supplied: cannot be in the past, and cannot be earlier than the effective `startsAt` (the new one if also supplied, else the existing one).
6. If only `startsAt` is supplied: cannot be later than the existing `endsAt`.

| Status | Cause |
| :--- | :--- |
| `200` | Promo code updated successfully. |
| `400` | Invalid input; editing an inactive code without reactivating it; `usageLimit` below `usedCount`; `maxDiscountAmount` on a `FIXED` code; illegal date ordering. |
| `404` | Promo code not found. |

---

### Discount Computation

`PromotionService`'s private `computeDiscount`, shared by both the preview and order-reservation paths:

| `discountType` | Formula |
| :--- | :--- |
| `FIXED` | `min(discountValue, subtotal)` — a discount can never exceed the cart it's applied to. |
| `PERCENTAGE` | `min(subtotal * discountValue / 100, maxDiscountAmount ?? Infinity, subtotal)` |

Both branches round to 2 decimal places (`round2`) as the final step.

---

### Relationship to Order Placement

This module never calls into `OrderModule` — the dependency runs the other way. `OrderService.placeOrder` imports `PromotionModule` and calls two `PromotionService` methods from inside its own `$transaction`:

- **`validateAndReserveForOrder(code, subtotal, userId, email, tx)`** — re-runs every check above against the transaction's own view of the data, then atomically reserves one use via a guarded `UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ? AND (usage_limit IS NULL OR used_count < usage_limit)` (same shape as `InventoryRepository`'s guarded stock decrement). A lost race throws `400` instead of oversubscribing the code.
- **`recordRedemption(promoCodeId, userId, orderId, discountApplied, tx)`** — writes the `PromoCodeRedemption` ledger row once `Order.id` is known.

Full detail, including how the discount is split across `OrderItem` rows, lives in `docs/order.md`'s [Promo Code Integration](order.md#promo-code-integration) section.

---

### Known Gaps / Deferred Features

- **No hard delete.** By design — see [Relationships and Cascading Rules](#relationships-and-cascading-rules). Retire a code via `isActive: false`.
- **No "list active codes" public endpoint.** Deliberately absent — letting anyone browse every currently-working coupon code defeats the point of a coupon. Codes are looked up one at a time, by the exact string a customer typed in.
- **No stacking / combining multiple codes on one order.** `CreateOrderDto.promoCode` is a single optional string; `PromoCodeRedemption.orderId` is `@unique`, so the schema itself only allows one redemption per order.
- **No `SHIPPING`-type discount.** `DiscountType` (`shared.prisma`) only has `FIXED`/`PERCENTAGE` — a free-shipping coupon would need a schema change, not just a code change.
- **No admin analytics endpoint** (e.g. total discount payout, top codes by redemption count) beyond what `usedCount` and the paginated list already expose. `PromoCodeRedemption` carries everything needed to build one later; nothing here precludes it.
