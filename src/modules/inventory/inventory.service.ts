import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../../generated/prisma/client';
import { InventoryRepository } from './inventory.repository';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { AddStockDto } from './dto/add-stock.dto';
import { RemoveStockDto, RemoveStockItemDto } from './dto/remove-stock.dto';
import { BatchResponseDto } from './dto/batch-response.dto';
import { InventoryResponseDto } from './dto/inventory-response.dto';
import { InventoryExchangeType } from '../../generated/prisma/enums';
import { PaginationQueryDto, IPaginatedResult } from '../../shared/pagination';

//* PREFIX FOR A GENERATED BATCH NUMBER — SKU WHEN SET (ALREADY GUARANTEED
//* UNIQUE/STABLE), ELSE THE PRODUCT NAME UPPERCASED WITH EVERY
//* NON-ALPHANUMERIC CHARACTER STRIPPED (SPACES, HYPHENS, ETC.)
function buildProductCode(product: {
  name: string;
  sku: string | null;
}): string {
  return (product.sku ?? product.name).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

//* yyyyMMdd IN SERVER LOCAL TIME — PURELY FOR HUMAN TRACEABILITY ON THE
//* PRINTED BATCH LABEL. UNIQUENESS ITSELF IS GUARANTEED BY THE TRAILING
//* batch.id (POSTGRES' OWN ATOMIC AUTO-INCREMENT), NOT BY THIS DATE, SO
//* MULTIPLE BATCHES CREATED ON THE SAME DAY NEVER COLLIDE.
function formatBatchDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

//* {CODE}-{yyyyMMdd}-P{productId}[V{variantId}]-{batch.id} — DEPENDS ON
//* THE BATCH ROW'S OWN id, SO THIS CAN ONLY BE COMPUTED *AFTER* THE ROW
//* EXISTS (SEE THE PLACEHOLDER-THEN-UPDATE TWO-STEP IN
//* createBatchWithGeneratedNumber BELOW). target.productId IS OPTIONAL SINCE
//* Batch.productId ITSELF IS NULLABLE (A GENERIC, PRODUCT-LESS BATCH) —
//* THE P{id}[V{id}] SEGMENT IS SIMPLY OMITTED WHEN THERE'S NO PRODUCT.
function buildBatchNo(
  product: { name: string; sku: string | null },
  target: { productId?: number; variantId?: number },
  batchId: number,
  dateTag: string,
): string {
  const code = buildProductCode(product);
  const targetTag = target.productId
    ? target.variantId
      ? `P${target.productId}V${target.variantId}`
      : `P${target.productId}`
    : undefined;
  return [code, dateTag, targetTag, String(batchId)].filter(Boolean).join('-');
}

@Injectable()
export class InventoryService {
  constructor(private readonly inventoryRepository: InventoryRepository) {}

  // ─── Batch ───────────────────────────────────────────────────────────────

  /**
   * Creates a batch with a server-generated batch number — `Batch` has no
   * client-facing `batchNo` input anywhere in this module (see
   * `CreateBatchDto`), so both the direct manual-create path and each item
   * of the `addStock` bulk workflow share this one implementation rather
   * than duplicating the placeholder-then-update dance.
   *
   * The generated number depends on the row's own id (see `buildBatchNo`),
   * so the batch is first created with a throwaway placeholder and
   * immediately updated to its real number — that placeholder is never
   * returned to the caller.
   *
   * `resolvedProduct` lets a caller that already has the product row (e.g.
   * `addStock`, which fetches it anyway to validate the item) pass it
   * straight through instead of triggering a redundant lookup here.
   */
  private async createBatchWithGeneratedNumber(
    input: {
      quantity: number;
      costPrice: number;
      manufacturingDate?: string;
      expiryDate?: string;
      productId?: number;
      variantId?: number;
      resolvedProduct?: { name: string; sku: string | null } | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<BatchResponseDto> {
    const created = await this.inventoryRepository.createBatch(
      {
        //* SATISFIES batchNo's NOT NULL + UNIQUE CONSTRAINTS FOR THE INSTANT
        //* BEFORE THE REAL NUMBER IS WRITTEN BELOW.
        batchNo: `PENDING-${randomUUID()}`,
        quantity: input.quantity,
        remaining: input.quantity,
        costPrice: input.costPrice,
        manufacturingDate: input.manufacturingDate
          ? new Date(input.manufacturingDate)
          : undefined,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
        ...(input.productId && {
          product: { connect: { id: input.productId } },
        }),
        ...(input.variantId && {
          variant: { connect: { id: input.variantId } },
        }),
      },
      tx,
    );

    const productForCode = input.resolvedProduct ??
      (input.productId
        ? await this.inventoryRepository.findProductStockInfo(
            input.productId,
            tx,
          )
        : null) ??
        //* GENERIC FALLBACK PREFIX FOR THE RARE PRODUCT-LESS BATCH — Batch.productId
        //* IS NULLABLE IN THE SCHEMA, SO THIS PATH IS REACHABLE.
        { name: 'BATCH', sku: null };

    const batchNo = buildBatchNo(
      productForCode,
      { productId: input.productId, variantId: input.variantId },
      created.id,
      formatBatchDate(new Date()),
    );

    const batch = await this.inventoryRepository.updateBatch(
      created.id,
      { batchNo },
      tx,
    );
    return new BatchResponseDto(batch);
  }

  async createBatch(createBatchDto: CreateBatchDto): Promise<BatchResponseDto> {
    return this.createBatchWithGeneratedNumber(createBatchDto);
  }

  async getBatchById(id: number): Promise<BatchResponseDto> {
    const batch = await this.inventoryRepository.findBatchById(id);
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${id} not found`);
    }
    return new BatchResponseDto(batch);
  }

  async getAllBatches(
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<BatchResponseDto>> {
    const paginatedBatches =
      await this.inventoryRepository.findAllBatches(params);

    return {
      ...paginatedBatches,
      data: paginatedBatches.data.map((batch) => new BatchResponseDto(batch)),
    };
  }

  async updateBatch(
    id: number,
    updateBatchDto: UpdateBatchDto,
  ): Promise<BatchResponseDto> {
    const batch = await this.inventoryRepository.findBatchById(id);
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${id} not found`);
    }

    const updatedBatch = await this.inventoryRepository.updateBatch(
      id,
      updateBatchDto,
    );
    return new BatchResponseDto(updatedBatch);
  }

  async deleteBatch(id: number): Promise<void> {
    const batch = await this.inventoryRepository.findBatchById(id);
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${id} not found`);
    }
    await this.inventoryRepository.deleteBatch(id);
  }

  // ─── Inventory (stock-movement ledger) ──────────────────────────────────

  async recordMovement(
    userId: number | undefined,
    createInventoryDto: CreateInventoryDto,
  ): Promise<InventoryResponseDto> {
    const { productId, variantId, ...restData } = createInventoryDto;

    const movement = await this.inventoryRepository.createMovement({
      ...restData,
      ...(productId && { product: { connect: { id: productId } } }),
      ...(variantId && { variant: { connect: { id: variantId } } }),
      ...(userId && { InventoryRecordedBy: { connect: { id: userId } } }),
    });

    return new InventoryResponseDto(movement);
  }

  /**
   * Single-record detail view — unlike the list endpoint, this also attaches
   * every batch for the movement's own product/variant (the admin "view"
   * modal shows batch history alongside the movement itself). Omitted on
   * `getAllMovements` since fetching batches per row there would be an
   * N+1 query for no benefit — nothing in the list view renders them.
   */
  async getMovementById(id: number): Promise<InventoryResponseDto> {
    const movement = await this.inventoryRepository.findMovementById(id);
    if (!movement) {
      throw new NotFoundException(`Inventory movement with ID ${id} not found`);
    }
    const batches = movement.productId
      ? await this.inventoryRepository.findBatchesForProduct(
          movement.productId,
          movement.variantId,
        )
      : [];
    return new InventoryResponseDto(
      movement,
      batches.map((batch) => new BatchResponseDto(batch)),
    );
  }

  async getAllMovements(
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<InventoryResponseDto>> {
    const paginatedMovements =
      await this.inventoryRepository.findAllMovements(params);

    return {
      ...paginatedMovements,
      data: paginatedMovements.data.map(
        (movement) => new InventoryResponseDto(movement),
      ),
    };
  }

  /** Paginated inventory history for one product, optionally narrowed to one variant. */
  async getMovementsForProduct(
    productId: number,
    variantId: number | undefined,
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<InventoryResponseDto>> {
    const paginatedMovements =
      await this.inventoryRepository.findMovementsForProduct(
        productId,
        variantId,
        params,
      );

    return {
      ...paginatedMovements,
      data: paginatedMovements.data.map(
        (movement) => new InventoryResponseDto(movement),
      ),
    };
  }

  /** Every batch for one product (optionally narrowed to one variant) — feeds the "remove stock" batch picker. */
  async getBatchesForProduct(
    productId: number,
    variantId?: number,
  ): Promise<BatchResponseDto[]> {
    const batches = await this.inventoryRepository.findBatchesForProduct(
      productId,
      variantId,
    );
    return batches.map((batch) => new BatchResponseDto(batch));
  }

  /**
   * Removes stock for one or more items in a single, atomic call — the
   * counterpart to `addStock`. For each item:
   *
   *  - **Specific batch** (`item.batchId` given): validates the batch belongs
   *    to the given product/variant and has enough `remaining`, then
   *    decrements just that one batch.
   *  - **FIFO** (`item.batchId` omitted): validates the product/variant
   *    pairing itself (same invariants as `addStock` — a VARIABLE product
   *    requires a `variantId` that belongs to it, a SIMPLE product must not
   *    receive one), then walks every batch for that product/variant
   *    oldest-first (`findBatchesForProduct`'s own ordering), consuming each
   *    batch's `remaining` in turn until `item.quantity` is fully accounted
   *    for. Rejects outright if the combined remaining across every batch
   *    falls short — no partial removal is ever applied.
   *
   * Cost price is deliberately left untouched — that's an intake-time
   * concept (see `addStock`), not a removal-time one. Each item's own
   * product/variant `quantity` is decremented exactly once by that item's
   * full `quantity` (not once per batch touched within it), but one
   * `Inventory` movement is written **per batch actually touched**, each
   * carrying only that batch's own share and its own `referenceId`, so the
   * ledger still attributes exactly how much came from which batch instead
   * of collapsing a multi-batch FIFO draw into one misleading entry.
   *
   * `validateItems` rejects the whole request up front (before the
   * transaction even opens) if the same product/variant appears in more than
   * one item without every one of those items pinning a distinct `batchId` —
   * two FIFO draws (or two draws from the same batch) against the same
   * product/variant in one request would double-count against the same
   * pool, which no ordering of independent per-item processing can resolve
   * correctly on its own.
   */
  async removeStock(
    userId: number,
    dto: RemoveStockDto,
  ): Promise<BatchResponseDto[]> {
    this.validateRemoveStockItems(dto.items);

    return this.inventoryRepository.withTransaction(async (tx) => {
      const updated: BatchResponseDto[] = [];

      for (const item of dto.items) {
        const touchedBatches =
          item.batchId !== undefined
            ? [await this.resolveSpecificBatch(item, tx)]
            : await this.resolveFifoBatches(item, tx);

        for (const { batch, drawn, reasonFallback } of touchedBatches) {
          const updatedBatch = await this.inventoryRepository.updateBatch(
            batch.id,
            { remaining: batch.remaining - drawn },
            tx,
          );
          updated.push(new BatchResponseDto(updatedBatch));

          await this.inventoryRepository.createMovement(
            {
              quantity: drawn,
              changeType: item.changeType ?? InventoryExchangeType.ADJUSTMENT,
              reason: item.reason ?? reasonFallback,
              referenceId: String(batch.id),
              product: { connect: { id: item.productId } },
              ...(item.variantId && {
                variant: { connect: { id: item.variantId } },
              }),
              InventoryRecordedBy: { connect: { id: userId } },
            },
            tx,
          );
        }

        if (item.variantId) {
          await this.inventoryRepository.incrementVariantQuantity(
            item.variantId,
            -item.quantity,
            undefined,
            tx,
          );
        } else {
          await this.inventoryRepository.incrementProductQuantity(
            item.productId,
            -item.quantity,
            undefined,
            tx,
          );
        }
      }

      return updated;
    });
  }

  /**
   * Cross-item guard `resolveSpecificBatch`/`resolveFifoBatches` can't see on
   * their own, since each only looks at its own item: groups the request's
   * items by (productId, variantId) and, for any group with more than one
   * item, requires every item in it to name a `batchId` and every one of
   * those `batchId`s to be distinct. A single-item group is unrestricted
   * (FIFO is fine when there's only one draw against that product/variant in
   * this request).
   */
  private validateRemoveStockItems(items: RemoveStockItemDto[]): void {
    const groups = new Map<string, RemoveStockItemDto[]>();
    for (const item of items) {
      const key = `${item.productId}:${item.variantId ?? ''}`;
      const group = groups.get(key);
      if (group) {
        group.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    for (const group of groups.values()) {
      if (group.length <= 1) continue;

      const { productId, variantId } = group[0];
      const label = variantId
        ? `product ${productId} variant ${variantId}`
        : `product ${productId}`;

      if (group.some((item) => item.batchId === undefined)) {
        throw new BadRequestException(
          `${label} appears more than once in this request — each occurrence must specify a distinct batchId`,
        );
      }

      const batchIds = group.map((item) => item.batchId);
      if (new Set(batchIds).size !== batchIds.length) {
        throw new BadRequestException(
          `${label} appears more than once in this request with the same batchId — each occurrence must draw from a different batch`,
        );
      }
    }
  }

  /** Single-batch removal path — validates ownership and capacity against exactly the batch the caller picked. */
  private async resolveSpecificBatch(
    item: RemoveStockItemDto,
    tx: Prisma.TransactionClient,
  ): Promise<{
    batch: { id: number; batchNo: string; remaining: number };
    drawn: number;
    reasonFallback: string;
  }> {
    const batch = await this.inventoryRepository.findBatchById(
      item.batchId!,
      tx,
    );
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${item.batchId} not found`);
    }
    if (batch.productId !== item.productId) {
      throw new BadRequestException(
        `Batch ${item.batchId} does not belong to product ${item.productId}`,
      );
    }
    if ((batch.variantId ?? undefined) !== item.variantId) {
      throw new BadRequestException(
        `Batch ${item.batchId} does not belong to variant ${item.variantId ?? 'none'}`,
      );
    }
    if (item.quantity > batch.remaining) {
      throw new BadRequestException(
        `Only ${batch.remaining} unit(s) remaining in batch ${batch.batchNo}`,
      );
    }

    return {
      batch,
      drawn: item.quantity,
      reasonFallback: `Stock removed from batch ${batch.batchNo}`,
    };
  }

  /**
   * FIFO removal path — validates the product/variant pairing itself (no
   * chosen batch to anchor that check against, unlike `resolveSpecificBatch`),
   * then greedily draws from the oldest non-empty batch first, spilling into
   * the next one as each is exhausted, until `item.quantity` is fully spoken
   * for. Throws rather than applying a partial removal if every batch
   * combined can't cover the requested quantity.
   */
  private async resolveFifoBatches(
    item: RemoveStockItemDto,
    tx: Prisma.TransactionClient,
  ): Promise<
    {
      batch: { id: number; batchNo: string; remaining: number };
      drawn: number;
      reasonFallback: string;
    }[]
  > {
    const product = await this.inventoryRepository.findProductStockInfo(
      item.productId,
      tx,
    );
    if (!product || product.deletedAt) {
      throw new NotFoundException(`Product ${item.productId} not found`);
    }
    if (item.variantId !== undefined) {
      const variant = await this.inventoryRepository.findVariantStockInfo(
        item.variantId,
        tx,
      );
      if (!variant) {
        throw new NotFoundException(`Variant ${item.variantId} not found`);
      }
      if (variant.productId !== item.productId) {
        throw new BadRequestException(
          `Variant ${item.variantId} does not belong to product ${item.productId}`,
        );
      }
    }
    if (product.hasVariants && item.variantId === undefined) {
      throw new BadRequestException(
        `Product ${item.productId} has variants — a variantId is required`,
      );
    }
    if (!product.hasVariants && item.variantId !== undefined) {
      throw new BadRequestException(
        `Product ${item.productId} does not use variants`,
      );
    }

    const batches = await this.inventoryRepository.findBatchesForProduct(
      item.productId,
      item.variantId,
      tx,
    );

    let remainingToDraw = item.quantity;
    const touched: {
      batch: { id: number; batchNo: string; remaining: number };
      drawn: number;
      reasonFallback: string;
    }[] = [];

    for (const batch of batches) {
      if (remainingToDraw <= 0) break;
      if (batch.remaining <= 0) continue;

      const drawn = Math.min(batch.remaining, remainingToDraw);
      touched.push({
        batch,
        drawn,
        reasonFallback: `Stock removed via FIFO from batch ${batch.batchNo}`,
      });
      remainingToDraw -= drawn;
    }

    if (remainingToDraw > 0) {
      const totalAvailable = item.quantity - remainingToDraw;
      throw new BadRequestException(
        `Only ${totalAvailable} unit(s) available across all batches for this ${item.variantId ? 'variant' : 'product'} — cannot remove ${item.quantity}`,
      );
    }

    return touched;
  }

  // ─── Add stock (batch intake) ────────────────────────────────────────────────

  /**
   * Consolidates items that represent the same physical intake — same
   * product/variant AND the same `costPrice` — into a single item with their
   * `quantity`s summed, rather than creating a redundant extra batch at an
   * identical cost. A different `costPrice` for the same product/variant is
   * treated as a genuinely different intake (e.g. a new supplier price) and
   * is left alone, becoming its own batch. Grouping key deliberately omits
   * `sellingPrice`/dates/etc — only product/variant/costPrice determine
   * whether two items are "the same" batch; a merged group keeps the first
   * item's own `sellingPrice`/`manufacturingDate`/`expiryDate`/`changeType`/
   * `reason`, only `quantity` is combined. Order-preserving (first
   * occurrence of each key wins its position) so batch/item numbering stays
   * predictable.
   */
  private mergeAddStockItems(items: CreateBatchDto[]): CreateBatchDto[] {
    const merged = new Map<string, CreateBatchDto>();
    const order: string[] = [];

    for (const item of items) {
      const key = `${item.productId ?? ''}:${item.variantId ?? ''}:${item.costPrice}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        merged.set(key, { ...item });
        order.push(key);
      }
    }

    return order.map((key) => merged.get(key)!);
  }

  /**
   * Records one or more stock intakes in a single, atomic call. Items are
   * first consolidated by `mergeAddStockItems` (see there), then for each
   * merged item:
   *
   *  1. Validates the product/variant pairing — a VARIABLE product (has
   *     variants) requires a `variantId` that actually belongs to it; a
   *     SIMPLE product must not receive one. An invalid pairing is rejected
   *     outright rather than silently resolving to "no variant".
   *  2. Creates a `Batch` row — the permanent historical record of this
   *     specific intake — with a server-generated, collision-free batch
   *     number (see `buildBatchNo`). The number depends on the row's own
   *     id, so the batch is created with a throwaway placeholder first and
   *     immediately updated to its real number.
   *  3. Increments the product's or variant's own `quantity` column and
   *     overwrites its `costPrice` with this item's cost — the product/
   *     variant's cost basis always reflects its most recently received
   *     batch (see `incrementProductQuantity`/`incrementVariantQuantity`).
   *     The DB's stock-sync triggers recompute stockStatus/totalStock from
   *     the quantity change — nothing else is written for that here.
   *  4. Appends a new `Inventory` row. Inventory is an append-only product
   *     log/history, never an upsert — every intake gets its own immutable
   *     entry rather than updating a running total.
   *
   * Every item runs inside one transaction: if any item fails, the whole
   * request rolls back — no partial batches/log entries are left behind.
   */
  async addStock(
    userId: number,
    dto: AddStockDto,
  ): Promise<BatchResponseDto[]> {
    const items = this.mergeAddStockItems(dto.items);

    return this.inventoryRepository.withTransaction(async (tx) => {
      const results: BatchResponseDto[] = [];

      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const itemLabel = `Item ${index + 1}`;

        //* productId IS OPTIONAL ON THE SHARED CreateBatchDto (A GENERIC
        //* BATCH CAN LEGALLY HAVE NO PRODUCT ATTACHED), BUT add-stock's OWN
        //* BUSINESS RULE REQUIRES ONE — ENFORCED HERE, NOT AT THE DTO LEVEL.
        if (item.productId === undefined) {
          throw new BadRequestException(`${itemLabel}: productId is required`);
        }
        const productId = item.productId;

        const product = await this.inventoryRepository.findProductStockInfo(
          productId,
          tx,
        );
        if (!product || product.deletedAt) {
          throw new NotFoundException(
            `${itemLabel}: product ${productId} not found`,
          );
        }

        let variant: { id: number; productId: number } | null = null;
        if (item.variantId !== undefined) {
          variant = await this.inventoryRepository.findVariantStockInfo(
            item.variantId,
            tx,
          );
          if (!variant) {
            throw new NotFoundException(
              `${itemLabel}: variant ${item.variantId} not found`,
            );
          }
          if (variant.productId !== productId) {
            throw new BadRequestException(
              `${itemLabel}: variant ${item.variantId} does not belong to product ${productId}`,
            );
          }
        }

        if (product.hasVariants && !variant) {
          throw new BadRequestException(
            `${itemLabel}: product ${productId} has variants — a variantId is required`,
          );
        }
        if (!product.hasVariants && variant) {
          throw new BadRequestException(
            `${itemLabel}: product ${productId} does not use variants`,
          );
        }

        //* MANUFACTURING/EXPIRY DATE ORDERING (EXPIRY MUST BE STRICTLY AFTER
        //* MANUFACTURING — EQUAL DATES ARE REJECTED TOO) IS NOW ENFORCED BY
        //* @IsAfter ON CreateBatchDto.expiryDate ITSELF, SO IT'S ALREADY
        //* GUARANTEED BY THE TIME THIS SERVICE METHOD RUNS — NO NEED TO
        //* RE-CHECK IT PER ITEM HERE.

        const batch = await this.createBatchWithGeneratedNumber(
          {
            quantity: item.quantity,
            costPrice: item.costPrice,
            manufacturingDate: item.manufacturingDate,
            expiryDate: item.expiryDate,
            productId,
            variantId: variant?.id,
            //* ALREADY FETCHED ABOVE TO VALIDATE THIS ITEM — PASS IT THROUGH
            //* SO THE HELPER DOESN'T RE-QUERY IT.
            resolvedProduct: product,
          },
          tx,
        );

        if (variant) {
          await this.inventoryRepository.incrementVariantQuantity(
            variant.id,
            item.quantity,
            item.costPrice,
            tx,
          );
        } else {
          await this.inventoryRepository.incrementProductQuantity(
            productId,
            item.quantity,
            item.costPrice,
            tx,
          );
        }

        await this.inventoryRepository.createMovement(
          {
            quantity: item.quantity,
            changeType: item.changeType ?? InventoryExchangeType.ADD,
            reason: item.reason ?? `Stock added via batch ${batch.batchNo}`,
            referenceId: String(batch.id),
            costPrice: item.costPrice,
            sellingPrice: item.sellingPrice,
            product: { connect: { id: productId } },
            ...(variant && { variant: { connect: { id: variant.id } } }),
            InventoryRecordedBy: { connect: { id: userId } },
          },
          tx,
        );

        results.push(batch);
      }

      return results;
    });
  }

  // ─── Sales (order fulfillment) ────────────────────────────────────────────
  //* CONSUMED BY OrderModule — SEE docs/order.md. UNLIKE addStock/removeStock,
  //* NEITHER METHOD BELOW TOUCHES Batch: A SALE DRAWS DOWN THE PRODUCT'S/
  //* VARIANT'S OWN quantity DIRECTLY, WITH NO PER-BATCH/FIFO ATTRIBUTION.
  //* THAT LEVEL OF PRECISION (WHICH BATCH A GIVEN ORDER LINE CAME FROM, FOR
  //* EXPIRY-ACCURATE COGS) IS A DELIBERATELY DEFERRED FUTURE ENHANCEMENT.

  /**
   * Decrements stock for a completed sale and appends one SALE movement per
   * line, all inside the caller's own transaction (always required — this
   * runs as one step of OrderService.placeOrder's larger transaction, never
   * standalone). The caller has already validated availability against an
   * earlier read; decrementProductQuantityGuarded/decrementVariantQuantityGuarded
   * re-check it atomically against the live row, so a race that has since
   * sold the last unit surfaces here as a clear error instead of silently
   * pushing stock negative.
   */
  async deductStockForSale(
    items: { productId?: number; variantId?: number; quantity: number }[],
    referenceId: string,
    userId: number | undefined,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    for (const item of items) {
      const applied = item.variantId
        ? await this.inventoryRepository.decrementVariantQuantityGuarded(
            item.variantId,
            item.quantity,
            tx,
          )
        : await this.inventoryRepository.decrementProductQuantityGuarded(
            item.productId!,
            item.quantity,
            tx,
          );

      if (!applied) {
        throw new BadRequestException(
          `Insufficient stock for ${item.variantId ? `variant ${item.variantId}` : `product ${item.productId}`} — someone may have just purchased the last of it`,
        );
      }

      await this.inventoryRepository.createMovement(
        {
          quantity: -item.quantity,
          changeType: InventoryExchangeType.SALE,
          referenceId,
          ...(item.productId && {
            product: { connect: { id: item.productId } },
          }),
          ...(item.variantId && {
            variant: { connect: { id: item.variantId } },
          }),
          ...(userId && { InventoryRecordedBy: { connect: { id: userId } } }),
        },
        tx,
      );
    }
  }

  /**
   * The inverse of deductStockForSale — restores stock when an order is
   * cancelled, and logs a RETURN movement per line (not RESTOCK, which
   * implies a fresh vendor intake rather than stock coming back from a
   * cancelled sale).
   */
  async restoreStockForSale(
    items: { productId?: number; variantId?: number; quantity: number }[],
    referenceId: string,
    reason: string,
    userId: number | undefined,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    for (const item of items) {
      if (item.variantId) {
        await this.inventoryRepository.incrementVariantQuantity(
          item.variantId,
          item.quantity,
          undefined,
          tx,
        );
      } else if (item.productId) {
        await this.inventoryRepository.incrementProductQuantity(
          item.productId,
          item.quantity,
          undefined,
          tx,
        );
      }

      await this.inventoryRepository.createMovement(
        {
          quantity: item.quantity,
          changeType: InventoryExchangeType.RETURN,
          reason,
          referenceId,
          ...(item.productId && {
            product: { connect: { id: item.productId } },
          }),
          ...(item.variantId && {
            variant: { connect: { id: item.variantId } },
          }),
          ...(userId && { InventoryRecordedBy: { connect: { id: userId } } }),
        },
        tx,
      );
    }
  }
}
