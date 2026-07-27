import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { BatchModel } from '../../../generated/prisma/models';

export class BatchResponseDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Public-facing UUID, safe to expose in URLs and API responses',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sid!: string;

  @Expose()
  @ApiProperty({
    description: 'Human-readable batch/lot number',
    example: '14-BEAUTY-001',
  })
  batchNo!: string;

  @Expose()
  @ApiProperty({
    description: 'Quantity added when this batch was received',
    example: 500,
  })
  quantity!: number;

  @Expose()
  @ApiProperty({
    description: 'Quantity still available from this batch',
    example: 120,
  })
  remaining!: number;

  @Expose()
  @ApiProperty({
    description: 'Cost price paid per unit to acquire this batch',
    example: 250.0,
  })
  costPrice!: unknown;

  @Expose()
  @ApiPropertyOptional({ description: 'Date the batch was manufactured' })
  manufacturingDate?: Date | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Date the batch expires' })
  expiryDate?: Date | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Owning product ID', example: 14 })
  productId?: number | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Owning variant ID', example: 104 })
  variantId?: number | null;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp when the record was created' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp of the last update' })
  updatedAt!: Date;

  constructor(batch: Partial<BatchModel>) {
    this.id = batch.id!;
    this.sid = batch.sid!;
    this.batchNo = batch.batchNo!;
    this.quantity = batch.quantity!;
    this.remaining = batch.remaining!;
    this.costPrice = batch.costPrice;
    this.manufacturingDate = batch.manufacturingDate ?? undefined;
    this.expiryDate = batch.expiryDate ?? undefined;
    this.productId = batch.productId ?? undefined;
    this.variantId = batch.variantId ?? undefined;
    this.createdAt = batch.createdAt!;
    this.updatedAt = batch.updatedAt!;
  }
}
