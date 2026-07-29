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
    costPrice: true,
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

  /**
   * Paginated ledger for one product, optionally narrowed to one variant —
   * feeds the Inventory admin page's per-row "Inventory" (history) button.
   * `variantId: variantId ?? null` is explicit rather than omitted: an
   * undefined variantId means "this option is a SIMPLE product", so only
   * its own product-level (variantId IS NULL) movements should match — not
   * every movement across all of the product's variants too.
   */
  async findMovementsForProduct(
    productId: number,
    variantId: number | undefined,
    params: PaginationQueryDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await this.paginationService.paginate<
      Prisma.InventoryGetPayload<{ select: typeof this.INVENTORY_SELECT }>,
      typeof client.inventory
    >(client.inventory, params, {
      where: { productId, variantId: variantId ?? null },
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
   * Weighted-average cost: (existingQuantity × existingCost + addedQuantity ×
   * addedCost) ÷ (existingQuantity + addedQuantity), rounded to 2 decimal
   * places (matches the column's own `Decimal(12, 2)` precision). A brand
   * new product/variant (quantity 0, costPrice null) collapses this to just
   * `addedCost`, so no special-casing is needed for "first stock ever
   * added". Shared by `incrementProductQuantity`/`incrementVariantQuantity`.
   */
  private weightedAverageCost(
    existingQuantity: number,
    existingCost: Prisma.Decimal | null,
    addedQuantity: number,
    addedCost: number,
  ): number {
    const totalQuantity = existingQuantity + addedQuantity;
    if (totalQuantity <= 0) return addedCost;

    const existingValue = existingQuantity * Number(existingCost ?? 0);
    const addedValue = addedQuantity * addedCost;
    return (
      Math.round(((existingValue + addedValue) / totalQuantity) * 100) / 100
    );
  }

  /**
   * Increments a SIMPLE product's own stock count and, when a batch cost
   * price was supplied, recomputes the product's own `costPrice` as the
   * weighted average of its existing stock and this newly received batch —
   * NOT an overwrite, so an earlier, cheaper (or pricier) batch still pulls
   * weight on the blended cost basis rather than being discarded the
   * moment a new batch arrives. The `sync_product_stock_fields` DB trigger
   * recomputes totalStock/stockStatus from the new quantity — nothing else
   * needs to be written for that here.
   */
  async incrementProductQuantity(
    id: number,
    amount: number,
    costPrice?: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;

    let newCostPrice: number | undefined;
    if (costPrice !== undefined) {
      const current = await client.product.findUniqueOrThrow({
        where: { id },
        select: { quantity: true, costPrice: true },
      });
      newCostPrice = this.weightedAverageCost(
        current.quantity,
        current.costPrice,
        amount,
        costPrice,
      );
    }

    return await client.product.update({
      where: { id },
      data: {
        quantity: { increment: amount },
        ...(newCostPrice !== undefined && { costPrice: newCostPrice }),
      },
      select: { id: true, quantity: true },
    });
  }

  /**
   * Increments one variant's own stock count and, when a batch cost price
   * was supplied, recomputes the variant's own `costPrice` as the weighted
   * average of its existing stock and this newly received batch — same
   * blended-cost semantics as `incrementProductQuantity`. The
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

    let newCostPrice: number | undefined;
    if (costPrice !== undefined) {
      const current = await client.productVariant.findUniqueOrThrow({
        where: { id },
        select: { quantity: true, costPrice: true },
      });
      newCostPrice = this.weightedAverageCost(
        current.quantity,
        current.costPrice,
        amount,
        costPrice,
      );
    }

    return await client.productVariant.update({
      where: { id },
      data: {
        quantity: { increment: amount },
        ...(newCostPrice !== undefined && { costPrice: newCostPrice }),
      },
      select: { id: true, quantity: true },
    });
  }
}
