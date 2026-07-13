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
}
