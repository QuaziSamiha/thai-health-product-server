import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  IsIn,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryExchangeType } from '../../../generated/prisma/enums';

//* CHANGE TYPES VALID FOR A *REMOVAL* — ADD/RESTOCK ARE INTAKE-ONLY AND
//* BELONG TO add-stock INSTEAD, SO THEY'RE DELIBERATELY EXCLUDED HERE.
const REMOVAL_CHANGE_TYPES = [
  InventoryExchangeType.SALE,
  InventoryExchangeType.RETURN,
  InventoryExchangeType.ADJUSTMENT,
  InventoryExchangeType.DAMAGE,
  InventoryExchangeType.EXPIRED,
] as const;

export class RemoveStockItemDto {
  @ApiProperty({
    description: 'Owning product ID.',
    example: 14,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'Product ID must be a whole number' })
  @Min(1, { message: 'Product ID must be a valid positive integer' })
  productId!: number;

  @ApiPropertyOptional({
    description: 'Owning variant ID, if the batch is for one specific variant.',
    example: 104,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Variant ID must be a whole number' })
  @Min(1, { message: 'Variant ID must be a valid positive integer' })
  variantId?: number;

  @ApiPropertyOptional({
    description:
      'The specific batch this removal draws down. Omit to draw down FIFO instead — the oldest batch(es) with remaining stock for this product/variant are consumed in order until `quantity` is satisfied. Required when this same product/variant appears in more than one item of the same request (see `RemoveStockDto.items`) — each occurrence must then draw from a different batch.',
    example: 42,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Batch ID must be a whole number' })
  @Min(1, { message: 'Batch ID must be a valid positive integer' })
  batchId?: number;

  @ApiProperty({
    description:
      "Quantity to remove — capped at the chosen batch's own remaining count when `batchId` is given, or at the combined remaining across all of this product's/variant's batches when it's omitted (FIFO).",
    example: 5,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Why the stock is being removed. Defaults to ADJUSTMENT.',
    enum: REMOVAL_CHANGE_TYPES,
    enumName: 'InventoryRemovalChangeType',
    default: InventoryExchangeType.ADJUSTMENT,
    example: InventoryExchangeType.SALE,
  })
  @IsOptional()
  @IsIn(REMOVAL_CHANGE_TYPES, {
    message:
      'Change type must be one of SALE, RETURN, ADJUSTMENT, DAMAGE, or EXPIRED',
  })
  changeType?: InventoryExchangeType;

  @ApiPropertyOptional({
    description:
      'Free-text note for this stock movement. Defaults to a generated note referencing the batch number when omitted.',
    example: 'Sold at checkout',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Reason must be a valid text string' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason?: string;
}

export class RemoveStockDto {
  @ApiProperty({
    type: () => [RemoveStockItemDto],
    description:
      'One or more removals to apply in a single, atomic call — different products, or the same product/variant drawn from several distinct batches. The whole request is atomic: if any item fails, none of them are applied.',
  })
  @IsArray({ message: 'Items must be an array' })
  @ArrayMinSize(1, { message: 'Remove at least one item' })
  @ValidateNested({ each: true })
  @Type(() => RemoveStockItemDto)
  items!: RemoveStockItemDto[];
}
