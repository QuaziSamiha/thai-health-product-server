import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';
import { UpdateBatchDto } from './dto/update-batch.dto';

@Injectable()
export class InventoryRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  private readonly BATCH_SELECT = {
    id: true,
    sid: true,
    batchNo: true,
    quantity: true,
    remaining: true,
    manufacturingDate: true,
    expiryDate: true,
    productId: true,
    variantId: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private readonly INVENTORY_SELECT = {
    id: true,
    sid: true,
    quantity: true,
    changeType: true,
    reason: true,
    referenceId: true,
    costPrice: true,
    sellingPrice: true,
    recordedAt: true,
    productId: true,
    variantId: true,
    recordedBy: true,
    //* ADMIN INVENTORY LIST/DETAIL VIEWS NEED THE PRODUCT/VARIANT NAME —
    //* NOT JUST THE BARE productId/variantId ABOVE — SO THEY DON'T HAVE TO
    //* ROUND-TRIP TO THE PRODUCT MODULE PER ROW. quantity IS THE ACTUAL
    //* CURRENT STOCK FOR THAT PRODUCT/VARIANT — DELIBERATELY *NOT* THIS ROW'S
    //* OWN `quantity` ABOVE, WHICH IS ONLY THE MAGNITUDE OF THIS ONE MOVEMENT.
    product: {
      select: { id: true, name: true, slug: true, quantity: true, type: true },
    },
    variant: { select: { id: true, name: true, size: true, quantity: true } },
  } as const;

  // ─── Batch ───────────────────────────────────────────────────────────────

  async createBatch(
    data: Prisma.BatchCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.batch.create({
      data,
      select: this.BATCH_SELECT,
    });
  }

  /** Every batch for one product, optionally narrowed to a single variant — oldest first (FEFO-ish ordering for the removal-picker dropdown). */
  async findBatchesForProduct(
    productId: number,
    variantId?: number | null,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.batch.findMany({
      where: {
        productId,
        ...(variantId !== undefined && variantId !== null && { variantId }),
      },
      select: this.BATCH_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findBatchById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.batch.findUnique({
      where: { id },
      select: this.BATCH_SELECT,
    });
  }

  async findAllBatches(
    params: PaginationQueryDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await this.paginationService.paginate<
      Prisma.BatchGetPayload<{ select: typeof this.BATCH_SELECT }>,
      typeof client.batch
    >(client.batch, params, {
      select: this.BATCH_SELECT,
      searchableFields: ['batchNo'],
      defaultSortField: 'createdAt',
    });
  }

  async updateBatch(
    id: number,
    data: Partial<UpdateBatchDto>,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.batch.update({
      where: { id },
      data,
      select: this.BATCH_SELECT,
    });
  }

  async deleteBatch(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.batch.delete({ where: { id } });
  }

  // ─── Inventory (stock-movement ledger) ──────────────────────────────────

  async createMovement(
    data: Prisma.InventoryCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.inventory.create({
      data,
      select: this.INVENTORY_SELECT,
    });
  }

  async findMovementById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.inventory.findUnique({
      where: { id },
      select: this.INVENTORY_SELECT,
    });
  }

  async findAllMovements(
    params: PaginationQueryDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await this.paginationService.paginate<
      Prisma.InventoryGetPayload<{ select: typeof this.INVENTORY_SELECT }>,
      typeof client.inventory
    >(client.inventory, params, {
      select: this.INVENTORY_SELECT,
      searchableFields: ['referenceId'],
      defaultSortField: 'recordedAt',
    });
  }

  // ─── Stock targets (Product / ProductVariant) ───────────────────────────────
  //* addStock TOUCHES products/product_variants DIRECTLY (RATHER THAN GOING
  //* THROUGH ProductModule) SINCE THE INCREMENT MUST RUN INSIDE THIS SAME
  //* TRANSACTION AS THE BATCH/INVENTORY WRITES BELOW.

  /** Lean lookup used to validate an add-stock item's productId and its type/variant consistency. */
  async findProductStockInfo(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        sku: true,
        hasVariants: true,
        deletedAt: true,
      },
    });
  }

  /** Lean lookup used to validate an add-stock item's variantId and confirm it belongs to the given product. */
  async findVariantStockInfo(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.productVariant.findUnique({
      where: { id },
      select: { id: true, productId: true },
    });
  }

  /**
   * Increments a SIMPLE product's own stock count and, when a batch cost
   * price was supplied, overwrites the product's own `costPrice` with it —
   * the product's cost basis always reflects its most recently received
   * batch. The `sync_product_stock_fields` DB trigger recomputes
   * totalStock/stockStatus from the new quantity — nothing else needs to be
   * written for that here.
   */
  async incrementProductQuantity(
    id: number,
    amount: number,
    costPrice?: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.product.update({
      where: { id },
      data: {
        quantity: { increment: amount },
        ...(costPrice !== undefined && { costPrice }),
      },
      select: { id: true, quantity: true },
    });
  }

  /**
   * Increments one variant's own stock count and, when a batch cost price
   * was supplied, overwrites the variant's own `costPrice` with it — same
   * "most recent batch wins" semantics as `incrementProductQuantity`. The
   * `sync_variant_stock_status` trigger recomputes that variant's
   * stockStatus, which in turn fires `sync_product_total_stock_from_variants`
   * to refresh the parent product's totalStock/stockStatus — nothing else
   * needs to be written for that here.
   */
  async incrementVariantQuantity(
    id: number,
    amount: number,
    costPrice?: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.productVariant.update({
      where: { id },
      data: {
        quantity: { increment: amount },
        ...(costPrice !== undefined && { costPrice }),
      },
      select: { id: true, quantity: true },
    });
  }
}
