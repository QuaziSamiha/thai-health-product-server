import { Injectable, NotFoundException } from '@nestjs/common';
import { InventoryRepository } from './inventory.repository';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { BatchResponseDto } from './dto/batch-response.dto';
import { InventoryResponseDto } from './dto/inventory-response.dto';
import { PaginationQueryDto, IPaginatedResult } from '../../shared/pagination';

@Injectable()
export class InventoryService {
  constructor(private readonly inventoryRepository: InventoryRepository) {}

  // ─── Batch ───────────────────────────────────────────────────────────────

  async createBatch(createBatchDto: CreateBatchDto): Promise<BatchResponseDto> {
    const { productId, variantId, ...restData } = createBatchDto;

    const batch = await this.inventoryRepository.createBatch({
      ...restData,
      ...(productId && { product: { connect: { id: productId } } }),
      ...(variantId && { variant: { connect: { id: variantId } } }),
    });

    return new BatchResponseDto(batch);
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
      ...(userId && { recordedByUser: { connect: { id: userId } } }),
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
}
