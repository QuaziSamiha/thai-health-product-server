# Order Placement — Implementation Plan

Status: **implemented (v1)**. This document was the original planning blueprint; `AddressModule` and `OrderModule` are both now built. For the as-built reference (schema, endpoints, business logic, known gaps), see [docs/order.md](./order.md) and [docs/address.md](./address.md) — this file is kept as historical design context, not a live spec.

## 0. What this plan is based on

- **Schema already in place**: [order.prisma](../prisma/schema/order.prisma) (`Address`, `Order`, `OrderAddress`, `OrderItem`, `OrderStatusHistory`, `Payment`), [promotion.prisma](../prisma/schema/promotion.prisma) (`PromoCode`, `PromoCodeRedemption` — not wired yet), [cart.prisma](../prisma/schema/cart.prisma) (`Cart`, `CartItem` — not wired yet).
- **Reference implementation studied**: `natura-care-server/src/modules/order/*` and `natura-care-server/src/modules/address/*` — a working NestJS + Prisma order flow for a sibling project. Its shape (transaction structure, address XOR logic, stock/inventory bookkeeping, status-history audit trail, admin item-edit reconciliation) is the main input to this plan. Its Achilles' heels (flat address columns instead of a snapshot table, discount recomputed from scratch at every edit, no combo/bundle support, courier-specific fields baked into `Order`) are deliberately **not** carried over — THP's schema already avoids them.
- **THP's own conventions**: the plan follows the repository/service/controller/DTO layering, `Prisma.TransactionClient`-based transactions, and DB-trigger-driven stock status already established in `modules/inventory` and `modules/combo-product`.

## 1. Scope for v1

Building now:
- `AddressModule` — standalone address-book CRUD.
- `OrderModule` — place order, list/view orders, admin status + item edits, payment-status updates.
- Stock deduction wired through the **existing** `InventoryModule` (no parallel stock-math implementation).

Explicitly deferred (schema already supports them, nothing here should block adding them later):
- **Cart** (`cart.prisma`) — checkout in v1 takes a flat `items[]` array in the request body, the same way natura's `CreateOrderDto` does. Wiring `Cart`/`CartItem` in later just means a new `POST /cart/checkout` that reads a `Cart` row and builds the same `items[]` shape internally — the `OrderService.placeOrder` core does not change.
- **PromoCode** (`promotion.prisma`) — `Order.appliedPromoCode` / `discountAmount` / `PromoCodeRedemption` exist and `placeOrder` reserves a `promoCode?: string` field in the DTO, but the validation branch is stubbed (see §8) until a `PromotionModule` exists.
- **Delivery pricing engine** (natura's `DeliveryPricingService` + `FreeDeliverySettingsService`) — v1 takes `deliveryCharge` as a small server-side rule (flat rate, or free above a threshold read from config), not a full admin-configurable delivery-pricing module. `Order.deliveryCharge` is already its own column, so swapping the rule for a real module later is a one-function change.
- **Tax/VAT** — `Order.taxAmount` exists and defaults to 0; Thai VAT rules are out of scope until Finance defines them.
- **Courier integration** (natura's Steadfast calls) and the **Socket.IO live-status gateway** — no courier is chosen yet for THP. `Order.status`/`OrderStatusHistory` are courier-agnostic already, so bolting one on later is additive (see §11).

## 2. Module boundaries

```
AddressModule            (standalone — owns Address CRUD only)
        ▲
        │ imported by
OrderModule  ──depends on──▶  InventoryModule (stock decrement + movement ledger)
        │              └────▶  ProductModule (product/variant lookups)
        │              └────▶  ComboProductModule (combo lookups + availability)
        └────(future)──▶  PromotionModule, CartModule
```

Mirrors natura's separation (`OrderModule` imports `AddressModule`, `ProductModule`, `PromotionModule`, `DeliveryPricingModule` as siblings rather than reimplementing their logic) — the one deliberate change is that **address stays entirely out of `OrderModule`**, per your instruction. `OrderService` only ever talks to `AddressService`'s public methods, never to `AddressRepository` or the `Address` Prisma model directly.

## 3. Guest vs. logged-in checkout

THP already has the building block natura solved with a bespoke `OptionalAuthGuard`: **`@Public()` + `JwtAuthGuard`**. Per [jwt-auth.guard.ts](../src/modules/auth/guards/jwt-auth.guard.ts), a route marked `@Public()` still runs passport-jwt if a token is present (attaching `req.user`), and only swallows the *failure* to authenticate. So:

```ts
@Public()
@UseGuards(JwtAuthGuard)
@Post()
async placeOrder(@Body() dto: CreateOrderDto, @Req() req: Request & { user?: User }) {
  const userId = req.user?.id ?? null;
  return this.orderService.placeOrder(dto, userId);
}
```

- Token present + valid → `req.user` set → logged-in checkout path.
- No token / invalid token → route still resolves → guest checkout path.

This one guard combo replaces natura's separate `OptionalAuthGuard`. One gap worth closing later (not a v1 blocker): natura also blocks *staff* accounts from placing customer orders via `NoAdminEmployeeGuard`. THP can add an equivalent `@Roles(UserRole.CUSTOMER)`-shaped check *inside* `OrderService.placeOrder` (reject if `req.user` is set and its role isn't `CUSTOMER`/`GUEST`) rather than a new guard class, since the check only applies when a user *is* present — a guard alone can't express "optional, but if present must be X".

## 4. Address flow (`AddressModule`)

Standalone module: `address.controller.ts`, `address.service.ts`, `address.repository.ts`, `dto/`. No dependency on `OrderModule` in either direction beyond `OrderService` calling `AddressService`'s public API.

**Endpoints** (fill the gaps natura left commented-out/unimplemented):

| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/addresses` | `JwtAuthGuard` | Create address for the logged-in user |
| GET | `/addresses` | `JwtAuthGuard` | List the caller's own addresses |
| GET | `/addresses/:id` | `JwtAuthGuard` | One address (ownership-checked) |
| PATCH | `/addresses/:id` | `JwtAuthGuard` | Update (ownership-checked) |
| DELETE | `/addresses/:id` | `JwtAuthGuard` | Delete (ownership-checked) |
| PATCH | `/addresses/:id/default` | `JwtAuthGuard` | Set as default — clears `isDefault` on the user's other addresses of the same `type` first |

**Service contract `OrderService` relies on:**
- `getAddressById(userId, addressId): Address` — throws `NotFoundException`/`BadRequestException` on missing/not-owned, same as natura's `getAddressById`.
- `createAddressWithTransaction(tx, userId, dto): Address` — creates inside the caller's transaction so a new checkout address is only persisted if the whole order commits (identical to natura's pattern, just typed against `Prisma.TransactionClient` instead of `any`).

**Request-DTO XOR rule** (same custom `class-validator` constraint idea as natura's `AddressValidationConstraint`, adapted):

```ts
class CreateOrderDto {
  @IsOptional() @IsInt() @Min(1)
  addressId?: number;              // use a saved Address

  @IsOptional() @ValidateNested() @Type(() => NewAddressDto)
  newAddress?: NewAddressDto;       // ad-hoc address, matches Address's own fields
                                    // (recipientName, phone, addressLine, state, region, postalCode, country?)

  @Validate(AddressXorConstraint)   // exactly one of the two must be present
  private _addressCheck?: unknown;
}
```

Placement-time branching (inside `OrderService.placeOrder`, ported from natura's `placeOrder` address block, adapted to THP's userId-optional signature):

1. **Guest** (`userId` is `null`): `addressId` is rejected (`BadRequestException` — guests have no address book); `newAddress` is required.
2. **Logged-in, `addressId` given**: `AddressService.getAddressById(userId, addressId)` — 404/ownership-checked.
3. **Logged-in, `newAddress` given**: `AddressService.createAddressWithTransaction(tx, userId, newAddress)` — saved to their address book *and* used for this order.
4. **Both or neither given**: `BadRequestException`.

Whichever branch resolves, the result becomes the input to an **`OrderAddress`** row (see §5 step 6) — not flat columns on `Order` like natura, and not a live FK to `Address` either. `OrderAddress.sourceAddressId` best-effort-links back for "reorder" UX, matching the schema's documented contract.

## 5. `placeOrder` — the transaction, step by step

Single `prisma.$transaction`, mirroring natura's `orderRepository.withTransaction` wrapper.

1. **Resolve address** → produces one address-shaped object (§4). Not yet persisted as `OrderAddress` — that needs `order.id`, which doesn't exist yet.
2. **Aggregate line items** — port natura's `aggregateOrderItems`: merge duplicate `(productId, variantId)` or `comboId` entries client-side-in-request into one line with a summed quantity, so a client that double-submits the same product doesn't get double stock validation/decrement. THP's version needs a third key shape for combos: `combo-{comboId}`.
3. **Per item, validate + build an `OrderItem` snapshot row** (no DB writes yet):
   - **Simple/variable product** (`productId` [+ `variantId`]): fetch via `ProductService`/`InventoryRepository`'s existing stock-info lookups, inside the transaction. Reject if `product.status !== 'ACTIVE'`. Effective available stock is `variant.quantity` when `variantId` is given, else `product.quantity` (SIMPLE) — **THP already stores the correct sale price on `Product.salePrice`/`ProductVariant.salePrice`** (server-derived at write time from `discountType`/`discountValue`), so unlike natura there is **no** "compare lowest of basePrice/discountPrice" recomputation at order time — just read `salePrice`.
   - **Combo** (`comboId`): fetch `ComboProduct` + its `items` (each `ComboItem.productId`/`variantId`/`quantity`) inside the transaction. Effective sellable bundles = `min(comboProduct.quantity, comboProduct.offeredQuantity ?? Infinity)` — the exact formula `ComboProductService.resolveComboAvailability`/`assertOfferedQuantityFits` already use. Reject if requested quantity exceeds that. Unit price = `comboProduct.comboPrice`.
   - Build the `OrderItem` snapshot: `name`/`nameTh` (from product or combo `title`/`titleTh`), `sku`, `imageUrl` (primary image), `attributes` (variant's `attributes` JSON, e.g. `{"size":"30ml"}` — matches the cart mockup's "Size: 30ml"), `quantity`, `unitPrice`, `totalPrice = unitPrice * quantity`.
   - Accumulate `subtotal += totalPrice`.
   - **For a combo item**, also stage the *underlying* stock deduction: `ComboItem.quantity * purchasedBundles` per bundled product/variant — a combo purchase decrements the real product/variant stock, never `ComboProduct.quantity` directly (that column is trigger-derived and recomputes itself once the underlying stock changes, exactly as documented in `combo-product.prisma`).
4. **Promo code** — see §8. In v1 this step is a no-op unless `PromotionModule` exists; `discountAmount` stays `0`, `appliedPromoCode` stays `null`.
5. **Compute totals**: `deliveryCharge` from the v1 delivery rule (§1); `taxAmount = 0`; `totalAmount = subtotal - discountAmount + deliveryCharge + taxAmount`. Reject if `totalAmount <= 0`.
6. **Write, in order**:
   1. `Order.create` — `status: PENDING`, `paymentStatus: PENDING`, `orderNumber` generated (see below), customer snapshot fields, all pricing fields, `userId` (nullable).
   2. `OrderAddress.create` — one row, `type: SHIPPING`, copied from the resolved address, `sourceAddressId` set when it came from the address book. (A second `BILLING` row is schema-ready for whenever checkout grows a "different billing address" toggle — not in the current Figma, so not built now.)
   3. `OrderItem.createMany` — the snapshot rows from step 3.
   4. **Stock deduction + inventory ledger**, per real product/variant touched (a combo item expands into its underlying products/variants first, per step 3): reuse `InventoryRepository.incrementProductQuantity(id, -qty, undefined, tx)` / `incrementVariantQuantity(...)` **and** `InventoryRepository.createMovement({ changeType: 'SALE', quantity: -qty, referenceId: order.orderNumber, ... }, tx)` — do **not** hand-roll stock math in `OrderService`; the DB triggers that keep `stockStatus`/`totalStock` in sync only fire correctly through the paths `InventoryModule` already owns. This is the same call shape `InventoryService.removeStock` uses internally.
   5. `OrderStatusHistory.create` — `status: PENDING`, `note: 'Order placed'`, `changedBy: null` (customer/system-initiated, matches the column's own documented contract).
   6. `Payment.create` — `type: CHARGE`, `method: dto.paymentMethod`, `status: PENDING`, `amount: totalAmount`, `provider: null` for `CASH_ON_DELIVERY`.
7. **Commit.**
8. **After commit, best-effort, non-blocking** (mirrors natura's "call the courier after the transaction, swallow failures" philosophy — a 3rd-party hiccup must never roll back an already-placed order):
   - `CASH_ON_DELIVERY`: nothing further in v1 (no courier chosen yet — see §1). When one is added, this is where it's called, exactly where Steadfast is called in natura.
   - `CARD` / `SCANPAY`: call the payment gateway to create a charge/intent; update the `Payment` row's `transactionId`/`gatewayResponse`/`status` with the result. If the gateway call itself fails, log it — the `Order` stays `PENDING`/`Payment` stays `PENDING`, reconciled later by the webhook or a support agent. Do not throw back to the client after commit.

**`orderNumber` generation**: port natura's `generateOrderId` idea but keyed off `Order.id` + creation date (e.g. `THP-{yyMMdd}-{id.padStart(5,'0')}`), written in the same create call rather than as a post-hoc patch — natura's version recomputes it on every `updateOrder` call, which is unnecessary churn; THP's should be set once at creation and never touched again.

## 6. Stock validation & decrement — reuse, don't duplicate

This is the biggest structural deviation from natura, and deliberate: natura's `OrderRepository` hand-writes `tx.product.update({ data: { quantity: { decrement } } })` and a raw `tx.inventory.create(...)`, bypassing whatever the product module itself considers "the" way to move stock. THP's `InventoryModule` already centralizes that (with weighted-average cost tracking, DB-trigger-driven `stockStatus`/`totalStock` sync, and an append-only movement ledger) — `OrderService` should be a **consumer** of `InventoryRepository`'s existing `incrementProductQuantity`/`incrementVariantQuantity`/`createMovement`, not a second implementation of the same math.

Practically: `OrderModule` imports `InventoryModule` and injects `InventoryRepository` (exported already, per `inventory.module.ts`) directly for the sale-time decrement + ledger entry, the same way `OrderService` in natura injects `ProductService`. If a reusable "decrement N items for a sale, log SALE movements, roll back cleanly on failure" helper turns out to be needed by more than one caller later, it can be extracted into `InventoryService` as a public method (`recordSale(userId, items, referenceId, tx)`) — not designed pre-emptively here since `OrderModule` is currently its only caller.

Race-condition guard: natura's `updateProductStock` does `where: { id, quantity: { gte: quantity } }` so a concurrent decrement can't push stock negative. THP's `InventoryRepository.incrementProductQuantity` doesn't currently have that guard (it's used from admin-only `add-stock`/`remove-stock` flows where over-drawing throws its own pre-check instead) — **this needs the same `gte` guard added for the order path**, since checkout is the one place stock is decremented under real concurrent-customer pressure. Flagged here as a required addition, not assumed already covered.

## 7. Pricing computation — what's different from natura

| | natura | THP |
|---|---|---|
| Item unit price | Recomputed at order time: `min(price, comparePrice)` | Read directly from `Product.salePrice` / `ProductVariant.salePrice` / `ComboProduct.comboPrice` — already server-derived at write time |
| Discount | Percentage/fixed computed fresh from the promo row every time | Same idea, deferred to `PromotionModule` (§8); computed once at placement, stored in `PromoCodeRedemption.discountApplied` as an immutable snapshot |
| Delivery | Full `DeliveryPricingService` + `FreeDeliverySettingsService` | v1: a small server-side rule (§1); same total-formula slot |
| Tax | Not modeled | `Order.taxAmount` column exists, `0` until VAT rules are defined |

`totalAmount = subtotal - discountAmount + deliveryCharge + taxAmount`, computed once, stored, and **never** recomputed from current product prices later — an order is a frozen financial record from the moment it's placed. This matches both natura's and THP's own `ComboItem.unitPrice`/`pricedAt` snapshot philosophy.

## 8. Promo code — interface now, wiring later

Not built in v1, but the `CreateOrderDto` reserves the field (`promoCode?: string`) and `OrderService.placeOrder` has a clearly marked no-op branch, so adding `PromotionModule` later doesn't touch the DTO or the call sites — only fills in the branch:

```ts
// v1: always skipped (dto.promoCode is accepted but ignored)
// future: once PromotionModule exists —
if (dto.promoCode) {
  const promo = await this.promotionService.findActiveByCode(dto.promoCode); // 404/inactive/expired
  // window: promo.startsAt/endsAt: null = unbounded, both may be set
  // constraints: subtotal >= promo.minOrderAmount, promo.usageLimit/usageLimitPerUser vs usedCount
  discountAmount = promo.discountType === 'PERCENTAGE'
    ? min(subtotal.mul(promo.discountValue).div(100), promo.maxDiscountAmount ?? Infinity)
    : promo.discountValue;
  // after totals: create PromoCodeRedemption { promoCodeId, userId, orderId, discountApplied: discountAmount }
  // and increment PromoCode.usedCount — both inside the same order transaction
}
```

This is a direct port of natura's promo validation branch (active/date-window/min-purchase/usage-limit checks), re-targeted at THP's `PromoCode` schema (`minOrderAmount`/`maxDiscountAmount`/`usageLimit`/`usageLimitPerUser` vs. natura's `minPurchase`/`maxPurchase`/`usageLimit`-only), with one behavioral upgrade: THP's `PromoCodeRedemption` ledger is the source of truth for limits (§ "PromoCode" in `promotion.prisma`), so `usageLimitPerUser` — which natura's schema can't express at all — comes for free once this branch is filled in.

## 9. Order status lifecycle (admin)

`OrderStatus`: `PENDING → CONFIRMED → PROCESSING → PACKED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED`, with `CANCELLED`/`RETURNED`/`REFUNDED`/`FAILED` as exits. Port natura's one hard guard (`CONFIRMED`/`CANCELLED` can never move back to `PENDING`) and generalize it slightly: build a small `ALLOWED_TRANSITIONS` map rather than natura's single if-statement, since THP has more intermediate statuses (`PROCESSING`/`PACKED`/`OUT_FOR_DELIVERY`) that also shouldn't be reachable from a terminal state.

Every status change writes an `OrderStatusHistory` row (`changedBy` = admin's `userId`, or `null` for a system/webhook-driven change — e.g. a future payment webhook flipping `PENDING → CONFIRMED`). Status-specific lifecycle timestamps get stamped on the same update: `status → CONFIRMED` sets `confirmedAt`, `→ SHIPPED` sets `shippedAt`, `→ OUT_FOR_DELIVERY`/`→ DELIVERED` sets `deliveredAt`, `→ CANCELLED` sets `cancelledAt` (+ requires `cancelReason`). Natura only special-cases `DELIVERED`; THP's schema already has columns for every stage, so all of them should be stamped, not just one.

## 10. Editing a placed order (admin)

Port natura's `updateOrder` reconciliation logic essentially as-is — it's solid:

- **Customer info / address edits**: free-form admin correction. THP applies this to the `OrderAddress` row (`type: SHIPPING`) rather than flat `Order` columns.
- **Item removal** (`itemsToRemove: number[]`): reject if it would leave zero items (cancel the whole order instead); for each removed `OrderItem`, restore stock via `InventoryRepository.incrementProductQuantity/incrementVariantQuantity` (positive delta this time) + a `RESTOCK` movement with `reason: 'Item removed from order {orderNumber}'`; subtract the item's `totalPrice` from a running adjustment.
- **Item quantity updates** (`itemsToUpdate: { itemId, quantity }[]`): reject a `(itemId)` that also appears in `itemsToRemove` (natura's conflict check); re-validate stock for an *increase*; decrement/restore stock + a `SALE_ADJUSTMENT`/`RESTOCK` movement per changed line, same as natura.
- **Discount recompute**: natura recomputes the order's discount *proportionally* (`newDiscount = newSubtotal * (oldDiscount / oldSubtotal)`) after an item edit shifts `subtotal`. THP should do the same against `Order.discountAmount`, but only when `PromotionModule` is wired (§8) — until then `discountAmount` is always `0`, so this branch is inert but present.
- **Recompute `totalAmount`**, reject if `<= 0`.
- **One `OrderStatusHistory` entry per update call**, summarizing what changed (status/removed-count/updated-count), same message-building approach as natura's `historyMessages` array.

## 11. Payment handling

- `PATCH /orders/:id/payment-status` (admin) — direct port of natura's `updatePaymentStatus`: sets `Payment.status`/`Order.paymentStatus`, stamps `Payment.paidAt` when transitioning to `PAID`, optional note → `OrderStatusHistory`.
- **Webhook endpoint** (future, once a gateway is chosen) — `POST /payments/webhook/:provider`, `@Public()`, signature-verified inside the handler (not by a guard — each provider's verification is provider-specific). Finds the `Payment` row by `transactionId`, updates `Payment.status`/`gatewayResponse` + `Order.paymentStatus`, and — for `CASH_ON_DELIVERY` there is no webhook; payment status there is only ever moved by an admin action (delivery confirmation) or a future courier-COD-remittance integration.
- **Live status push** (natura's Socket.IO `OrderGateway`) — deferred with the courier integration itself (§1); when added, it's additive: a `orders` WebSocket namespace, clients join a room keyed by `Order.sid`, `OrderService` emits on every `OrderStatusHistory` write it already does.

## 12. API surface

| Method | Path | Guard | Notes |
|---|---|---|---|
| POST | `/orders` | `@Public()` + `JwtAuthGuard` | Place order — guest or logged-in (§3) |
| GET | `/orders` | `JwtAuthGuard`, `RolesGuard`, `@Roles(ADMIN)` | All orders, paginated, admin |
| GET | `/orders/my-orders` | `JwtAuthGuard` | Caller's own orders, paginated |
| GET | `/orders/:id` | `JwtAuthGuard` | Owner-or-admin ownership check inside the service (natura's `findOrderWithLiveStatus` pattern) |
| GET | `/orders/:id/history` | `JwtAuthGuard`, `RolesGuard`, `@Roles(ADMIN)` | Full detail + `OrderStatusHistory`, admin |
| PATCH | `/orders/:id` | `JwtAuthGuard`, `RolesGuard`, `@Roles(ADMIN)` | Status/address/item edits (§10) |
| PATCH | `/orders/:id/payment-status` | `JwtAuthGuard`, `RolesGuard`, `@Roles(ADMIN)` | §11 |

Response shape follows THP's existing convention — controllers return plain data/DTOs, `ResponseInterceptor` + `@ResponseMessage('...')` wrap the envelope — **not** natura's manual `sendResponse(res, {...})` calls, since THP already standardized on the interceptor.

## 13. File layout

Mirrors `modules/inventory` and `modules/combo-product`:

```
src/modules/address/
  address.controller.ts
  address.service.ts
  address.repository.ts
  address.module.ts
  dto/
    create-address.dto.ts
    update-address.dto.ts
    address-response.dto.ts

src/modules/order/
  order.controller.ts
  order.service.ts
  order.repository.ts
  order.module.ts
  order.select.ts          //* prisma `select` projections, same role as combo-product.select.ts
  dto/
    create-order.dto.ts     //* + NewAddressDto, OrderItemDto, AddressXorConstraint
    update-order.dto.ts
    order-response.dto.ts
```

## 14. Extensibility already banked into the schema

- **Cart**: `Cart`/`CartItem` exist, unused. Wiring them means a `CartModule` (its own CRUD) plus one new controller method, `POST /cart/checkout`, that loads the caller's `Cart.items`, shapes them into the same `OrderItemDto[]` the direct-checkout path already builds, and calls the same `OrderService.placeOrder`. No change to `placeOrder` itself.
- **Promotion**: schema and the `placeOrder` branch point are ready (§8); needs a `PromotionModule` (CRUD + `findActiveByCode`) and filling in one `if` block.
- **Billing address ≠ shipping address**: `OrderAddress` already supports a second `BILLING` row per order (`@@unique([orderId, type])`); needs a `billingAddressId`/`newBillingAddress` pair added to `CreateOrderDto` whenever the checkout UI grows a "different billing address" toggle.
- **Delivery pricing module / courier / live tracking**: additive, no `Order`/`OrderItem` schema changes needed — see §1, §11.

## 15. Open decisions before implementation starts

1. **Delivery charge rule for v1** — flat rate, or free-above-threshold? Needs a number/config source.
2. **Payment gateway for `CARD`/`SCANPAY`** — which provider (Omise/2C2P/Stripe are the common Thailand-compatible options)? Blocks §11's webhook shape until chosen.
3. **`NoStaffGuard`-equivalent** (§3) — worth building now, or acceptable for staff accounts to place customer orders through the storefront endpoint in v1?
4. **Admin roles allowed read access to orders** — `ADMIN` only (matches natura), or also `MANAGER`/`SUPPORT` per THP's richer `UserRole` enum?
