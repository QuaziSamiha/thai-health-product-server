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

//* yyyyMMddHHmmss IN SERVER LOCAL TIME — PURELY FOR HUMAN TRACEABILITY ON THE
//* PRINTED BATCH LABEL. UNIQUENESS ITSELF IS GUARANTEED BY THE TRAILING
//* batch.id (POSTGRES' OWN ATOMIC AUTO-INCREMENT), NOT BY THIS TIMESTAMP, SO
//* TWO BATCHES CREATED WITHIN THE SAME SECOND NEVER COLLIDE.
function formatBatchTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

//* {CODE}-{yyyyMMddHHmmss}-P{productId}[V{variantId}]-{batch.id} — DEPENDS ON
//* THE BATCH ROW'S OWN id, SO THIS CAN ONLY BE COMPUTED *AFTER* THE ROW
//* EXISTS (SEE THE PLACEHOLDER-THEN-UPDATE TWO-STEP IN
//* createBatchWithGeneratedNumber BELOW). target.productId IS OPTIONAL SINCE
//* Batch.productId ITSELF IS NULLABLE (A GENERIC, PRODUCT-LESS BATCH) —
//* THE P{id}[V{id}] SEGMENT IS SIMPLY OMITTED WHEN THERE'S NO PRODUCT.
function buildBatchNo(
  product: { name: string; sku: string | null },
  target: { productId?: number; variantId?: number },
  batchId: number,
  timestamp: string,
): string {
  const code = buildProductCode(product);
  const targetTag = target.productId
    ? target.variantId
      ? `P${target.productId}V${target.variantId}`
      : `P${target.productId}`
    : undefined;
  return [code, timestamp, targetTag, String(batchId)]
    .filter(Boolean)
    .join('-');
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
      formatBatchTimestamp(new Date()),
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

  async getMovementById(id: number): Promise<InventoryResponseDto> {
    const movement = await this.inventoryRepository.findMovementById(id);
    if (!movement) {
      throw new NotFoundException(`Inventory movement with ID ${id} not found`);
    }
    return new InventoryResponseDto(movement);
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

  // ─── Add stock (batch intake) ────────────────────────────────────────────────

  /**
   * Records one or more stock intakes in a single, atomic call. For each item:
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
   *  3. Increments the product's or variant's own `quantity` column. The
   *     DB's stock-sync triggers recompute stockStatus/totalStock from
   *     that increment — nothing else is written for that here.
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
    return this.inventoryRepository.withTransaction(async (tx) => {
      const results: BatchResponseDto[] = [];

      for (let index = 0; index < dto.items.length; index++) {
        const item = dto.items[index];
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

        if (
          item.manufacturingDate &&
          item.expiryDate &&
          item.expiryDate < item.manufacturingDate
        ) {
          throw new BadRequestException(
            `${itemLabel}: expiry date cannot be before manufacturing date`,
          );
        }

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
            tx,
          );
        } else {
          await this.inventoryRepository.incrementProductQuantity(
            productId,
            item.quantity,
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
}
