# Overselling & Stock Race Conditions

Status: partially implemented — the cart page now blocks over-quantity checkout (Phase 1a + the
cart half of Phase 2). Phases 0, 1b–1d, 3, 4 and the PDP/checkout-page parts of Phase 2 are
still open; see the table in §4.
Scope: `thai-health-product-server` (order, inventory) + `thai-health-product-client` (cart, PDP, checkout)

---

## 1. What is actually broken today

The screenshot ("14 in cart, product is Low Stock") looks like an overselling bug, but the
server is already safe. The two halves are worth separating, because they need different fixes.

### The server is NOT oversellable

`OrderService.placeOrder` runs everything in one transaction:

1. `buildOrderItems` reads live stock and rejects the line if
   `item.quantity > product.quantity` / `> variant.quantity`
   (`src/modules/order/order.service.ts:487`, `:534`).
2. `InventoryService.deductStockForSale` then decrements through a **guarded conditional
   update** (`src/modules/inventory/inventory.repository.ts:337`):

   ```ts
   tx.product.updateMany({
     where: { id, quantity: { gte: amount } },
     data:  { quantity: { decrement: amount } },
   });
   ```

   `count === 0` means someone else took the stock between step 1 and step 2, and the whole
   transaction throws + rolls back.

That `WHERE quantity >= amount` is the important part: Postgres takes a row lock for the
update, so two concurrent orders for the last unit serialise — one wins, one gets
*"Insufficient stock … someone may have just purchased the last of it"*. **This is the
correct industry pattern** (atomic conditional decrement / compare-and-set). Do not replace
it with read-then-write.

### The client IS the bug

The cart is localStorage-only (`Cart` / `CartItem` exist in `cart.prisma` but are explicitly
not wired up) and it never learns what stock exists:

| Location | Problem |
|---|---|
| `client/src/features/cart/types/cart.types.ts` | `ICartItem` has no stock ceiling field at all |
| `client/src/features/cart/hooks/useCart.ts` — `updateQuantity` | only guards `quantity < 1`; no upper bound |
| `client/src/features/cart/hooks/useCart.ts` — `addToCart` | blindly sums `existing.quantity + qty` |
| `client/src/features/cart/public/CartItemRow.tsx` | the `+` button has no `disabled` condition |
| `client/src/modules/product/public/productDetails/ProductDetails.tsx:373` | passes `minValue={1}` but **not** `maxValue`, even though `QuantityCounter` already supports it |
| PDP | only blocks on `OUT_OF_STOCK`; `LOW_STOCK` with 5 left still allows 14 |

So the customer builds an impossible cart, walks the entire checkout funnel, and only
discovers the problem as a generic 400 toast on the final submit. That is the real defect:
**bad failure timing, not bad data**.

### Three genuine server-side gaps

1. **No release of stock for abandoned unpaid orders.** Stock is deducted the moment a
   `PENDING` order is created. For `CARD` / `SCANPAY` the customer may never pay. Nothing
   sweeps those orders, so the stock stays deducted indefinitely. Only a manual admin
   `CANCELLED` transition calls `restoreStockForOrder`.
2. **Deadlock risk under contention.** `deductStockForSale` iterates the deduction map in
   insertion order. Two concurrent orders containing products A and B in opposite order can
   deadlock on the row locks.
3. **No idempotency on `POST /order/place-order`.** `aggregateItems` merges duplicate lines
   *within* one request, but a double-clicked submit sends two requests and creates two
   orders (double stock deduction).

---

## 2. Design principle

> Stock is *checked* everywhere for UX, but *claimed* in exactly one place — the guarded
> decrement inside the order transaction. Every other layer is an early-warning system, and
> is allowed to be stale.

Never let a UI check be load-bearing. Never add a second place that mutates `quantity`.

---

## 3. The plan

### Phase 0 — Database invariant (last line of defence)

Migration adding a check constraint so no future code path can ever drive stock negative:

```sql
ALTER TABLE products         ADD CONSTRAINT products_quantity_non_negative CHECK (quantity >= 0);
ALTER TABLE product_variants ADD CONSTRAINT variants_quantity_non_negative CHECK (quantity >= 0);
```

Cheap, permanent, and turns any future bug into a loud failure instead of a silent oversell.

---

### Phase 1 — Server: make stock legible to the client

**1a. Cart validation endpoint** — `POST /order/validate-cart`

Takes the same `items[]` shape as `place-order`, runs the *read* half of `buildOrderItems`
in a dry run (no writes), and returns per line:

```jsonc
{
  "valid": false,
  "lines": [
    {
      "productId": 12, "variantId": null,
      "requested": 14,
      "available": 5,
      "status": "QUANTITY_REDUCED",  // OK | QUANTITY_REDUCED | OUT_OF_STOCK | UNAVAILABLE | PRICE_CHANGED
      "unitPrice": 400,               // live price, so a stale cart snapshot can be corrected
      "name": "Simple Product - 1"
    }
  ]
}
```

Implementation note: refactor `buildOrderItems` into a shared `resolveCartLines(items, tx)`
that returns per-line resolution + reason codes, then have both `placeOrder` (throws on any
non-OK line) and `validateCart` (returns them) consume it. One source of truth for the stock
rules — combos, retired variants, `hasVariants`, soft-deletes — instead of two drifting copies.

**1b. Structured 400 on `place-order`.** Today the failure is prose. Return a machine-readable
body so the client can auto-correct the cart instead of showing a dead-end toast:

```jsonc
{ "statusCode": 400, "errorCode": "INSUFFICIENT_STOCK", "lines": [ /* same shape as above */ ] }
```

**1c. Deterministic lock ordering.** In `deductStockForSale`, sort the deduction lines before
looping (e.g. by `variantId ?? -1`, then `productId`). Every transaction then takes row locks
in the same order, which makes the deadlock structurally impossible.

**1d. Idempotency on place-order.** Accept an `Idempotency-Key` header (client generates a
UUID per checkout attempt), store it unique-indexed on `Order`, and return the existing order
on replay. Kills double-submit double-deduction.

---

### Phase 2 — Client: fail early, fail specifically

**2a. Carry the ceiling in the cart line.**

```ts
export interface ICartItem {
  // …
  maxQuantity: number;   // available stock at add-to-cart time — a hint, revalidated server-side
  stockStatus: StockStatus;
}
```

**2b. Clamp in `useCart`** — the single choke point, so both the PDP and the cart page inherit it:

```ts
const clamp = (qty: number, max?: number) =>
  Math.max(1, max && max > 0 ? Math.min(qty, max) : qty);

// addToCart:      quantity: clamp(existing.quantity + qty, existing.maxQuantity)
// updateQuantity: quantity: clamp(quantity, entry.maxQuantity)
```

Have `updateQuantity` report whether it clamped, so the caller can toast *"Only 5 left in
stock"* rather than silently ignoring the click.

**2c. PDP** — pass the ceiling that already exists:

```tsx
<QuantityCounter value={quantity} valueChange={setQuantity} minValue={1}
                 maxValue={activeVariant?.quantity ?? product.quantity} />
```

and surface *"Only N left"* next to the Low Stock badge.

**2d. `CartItemRow`** — `disabled={item.quantity >= item.maxQuantity}` on the `+` button, plus
an inline hint on the line when it is at the ceiling.

**2e. Revalidate at the two moments that matter.** localStorage is a stale snapshot; the
server is the truth:

- on **cart page mount** (and on tab focus), and
- on **checkout page mount**, before the address form is shown.

Call `POST /order/validate-cart`, then reconcile: clamp reduced lines, mark out-of-stock lines
with a "Remove" affordance, refresh changed prices. Disable **Proceed to Checkout** while any
line is unresolved. This is what turns the screenshot bug into a non-event.

**2f. Handle `INSUFFICIENT_STOCK` on submit.** The race can still be lost at the last
millisecond — that is by design. On that error, apply the returned `lines` to the cart, show
*"Stock changed while you were checking out — we've updated your cart"*, and keep the customer
on the checkout page with everything they typed intact. Do **not** clear the cart, and do not
bounce them back to the cart page.

---

### Phase 3 — Release stock the customer never paid for

Add `@nestjs/schedule` and a job (every 5 min):

```
Find orders WHERE status = PENDING
             AND paymentStatus = PENDING
             AND paymentMethod != CASH_ON_DELIVERY
             AND createdAt < now() - 30 minutes
→ transition to CANCELLED (cancelReason: 'Payment window expired')
```

Reuse the existing `updateStatus` path so `restoreStockForOrder` and the status
history entry come for free. Keep the window configurable (`ORDER_PAYMENT_WINDOW_MINUTES`).

Without this, every abandoned card checkout permanently eats inventory.

COD orders are excluded — there is no payment step to time out; they stay `PENDING` until an
admin confirms or cancels.

---

### Phase 4 — Only if you need it: TTL reservations

Everything above is the **optimistic** model: nobody holds stock, the claim happens at order
creation, and the loser of a race gets a clear, correctable error. This is what Shopify,
WooCommerce and most storefronts do, and it is the right default — reservations cost real
complexity and make stock look scarcer than it is.

Adopt reservations only if you start running flash sales or single-digit-stock high-demand
drops, where losing the race after filling in an address becomes common enough to hurt
conversion.

Shape, when that day comes:

```prisma
model StockReservation {
  id        Int      @id @default(autoincrement())
  productId Int?
  variantId Int?
  quantity  Int
  sessionId String                       // or userId
  orderId   Int?                         // set when converted
  expiresAt DateTime @db.Timestamptz(3)
  @@index([expiresAt])
}
```

- add `reservedQuantity` to `Product` / `ProductVariant`; **available = quantity − reservedQuantity**
- create the reservation when the customer *enters* checkout, TTL 10–15 min, surfaced as a countdown
- at `placeOrder`, convert: decrement `quantity` and `reservedQuantity` together in one guarded update
- a cron sweeps expired rows and releases `reservedQuantity`
- every read path (`buildOrderItems`, `validate-cart`, PDP, cart) switches to the *available* figure

Strictly additive to Phases 0–3 — none of that work is wasted.

---

## 4. Ordering & effort

| Phase | Work | Effort | Status |
|---|---|---|---|
| 1a | `POST /order/validate-cart` + `resolveCartLine` extraction | ~1d | **Done** |
| 2d, 2e | Cart page revalidates, `+` capped, toast + Proceed disabled | ~1d | **Done** |
| 2b | Clamp inside `useCart.updateQuantity` | ~1h | **Done** |
| 2c | PDP `maxValue` — **blocked**, see note below | ~2h | Open |
| 2f | Checkout page revalidate + `INSUFFICIENT_STOCK` handling | ~1d | **High** |
| 1b, 1c | Structured error body, deterministic lock order | ~3h | Medium |
| 0 | CHECK constraints | ~30m | Medium |
| 3 | Abandoned-order sweeper | ~4h | Medium — blocks online-payment launch |
| 1d | Idempotency key | ~4h | Medium |
| 4 | TTL reservations | ~1w | Deferred |

**Why 2c is blocked.** Capping the PDP stepper needs a number the PDP does not have:
`ProductResponsePublicDto` withholds `quantity`/`totalStock` on purpose. Two ways out, both a
deliberate product call rather than a refactor:

- expose a **capped** `availableQuantity = min(realStock, PURCHASE_CAP)` on the public DTO —
  reveals "only 3 left" without revealing "we hold 4,382", which is how Amazon and Shopify
  handle it; or
- have the PDP call `validate-cart` speculatively on quantity change — no schema change, but
  a round trip per click.

Until one is picked, the cart page is the first place an over-quantity line is caught. That is
late but not harmful: nothing can be *ordered* over stock either way.

## 5. Tests worth writing

- **Concurrency**: N parallel `placeOrder` calls for a product with stock 1 → exactly one 201,
  N−1 × 400, and `quantity` lands at 0 (never negative). The repo already has
  `verify-race.tmp.ts` scratch files — promote that into a real e2e test.
- Guarded decrement returns `false` when stock drops between validation and deduction.
- A combo line expands to component deductions and is rejected when one component is short.
- Cancel → restore returns stock exactly once (no double restore on re-cancel).
- Sweeper cancels only non-COD `PENDING`/`PENDING` orders past the window.
- Client: `updateQuantity` clamps to `maxQuantity`; `addToCart` on an existing line clamps too.
