import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { InventoryModel } from '../../../generated/prisma/models';
import { InventoryExchangeType } from '../../../generated/prisma/enums';

export class InventoryResponseDto {
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
  @ApiProperty({ description: 'Magnitude of this single movement', example: 5 })
  quantity!: number;

  @Expose()
  @ApiProperty({
    enum: InventoryExchangeType,
    description: 'Why the movement happened',
    example: InventoryExchangeType.SALE,
  })
  changeType!: InventoryExchangeType;

  @Expose()
  @ApiPropertyOptional({
    description: 'Free-text human note for this movement',
  })
  reason?: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Free-text pointer to an external record',
    example: 'ORD-10234',
  })
  referenceId?: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Cost basis snapshot at the time of this stock change',
  })
  costPrice?: unknown;

  @Expose()
  @ApiPropertyOptional({
    description: 'Selling price snapshot at the time of this stock change',
  })
  sellingPrice?: unknown;

  @Expose()
  @ApiProperty({ description: 'When this movement was recorded' })
  recordedAt!: Date;

  @Expose()
  @ApiPropertyOptional({
    description: 'Product this movement applies to',
    example: 14,
  })
  productId?: number | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Variant this movement applies to',
    example: 104,
  })
  variantId?: number | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Actor who recorded the movement',
    example: 7,
  })
  recordedBy?: number | null;

  constructor(inventory: Partial<InventoryModel>) {
    this.id = inventory.id!;
    this.sid = inventory.sid!;
    this.quantity = inventory.quantity!;
    this.changeType = inventory.changeType!;
    this.reason = inventory.reason ?? undefined;
    this.referenceId = inventory.referenceId ?? undefined;
    this.costPrice = inventory.costPrice ?? undefined;
    this.sellingPrice = inventory.sellingPrice ?? undefined;
    this.recordedAt = inventory.recordedAt!;
    this.productId = inventory.productId ?? undefined;
    this.variantId = inventory.variantId ?? undefined;
    this.recordedBy = inventory.recordedBy ?? undefined;
  }
}
