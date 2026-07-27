import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { InventoryModel } from '../../../generated/prisma/models';
import { InventoryExchangeType, ProductType } from '../../../generated/prisma/enums';
import { BatchResponseDto } from './batch-response.dto';

class InventoryProductRefDto {
  @Expose()
  @ApiProperty({ example: 14 })
  id!: number;

  @Expose()
  @ApiProperty({ example: 'Colette Collins 343' })
  name!: string;

  @Expose()
  @ApiProperty({ example: 'colette-collins-343' })
  slug!: string;

  @Expose()
  @ApiProperty({
    description:
      "The product's actual current stock — not this movement's own magnitude",
    example: 170,
  })
  quantity!: number;

  @Expose()
  @ApiProperty({
    enum: ProductType,
    description: 'SIMPLE (no variants) or VARIABLE (sold via variants)',
    example: ProductType.SIMPLE,
  })
  type!: ProductType;
}

class InventoryVariantRefDto {
  @Expose()
  @ApiProperty({ example: 104 })
  id!: number;

  @Expose()
  @ApiProperty({ example: '200 ml' })
  name!: string;

  @Expose()
  @ApiPropertyOptional({ example: '200 ml' })
  size?: string | null;

  @Expose()
  @ApiProperty({
    description:
      "The variant's actual current stock — not this movement's own magnitude",
    example: 170,
  })
  quantity!: number;
}

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

  @Expose()
  @Type(() => InventoryProductRefDto)
  @ApiPropertyOptional({
    description: 'The product this movement applies to, name/slug included',
    type: InventoryProductRefDto,
  })
  product?: InventoryProductRefDto | null;

  @Expose()
  @Type(() => InventoryVariantRefDto)
  @ApiPropertyOptional({
    description: 'The variant this movement applies to, name/size included',
    type: InventoryVariantRefDto,
  })
  variant?: InventoryVariantRefDto | null;

  @Expose()
  @Type(() => BatchResponseDto)
  @ApiPropertyOptional({
    description:
      "This movement's product/variant batches — populated only on the single-record detail endpoint, omitted on list views",
    type: () => [BatchResponseDto],
  })
  batches?: BatchResponseDto[];

  constructor(
    inventory: Partial<InventoryModel> & {
      product?: {
        id: number;
        name: string;
        slug: string;
        quantity: number;
        type: ProductType;
      } | null;
      variant?: {
        id: number;
        name: string;
        size?: string | null;
        quantity: number;
      } | null;
    },
    batches?: BatchResponseDto[],
  ) {
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
    this.product = inventory.product ?? undefined;
    this.variant = inventory.variant ?? undefined;
    this.batches = batches;
  }
}
