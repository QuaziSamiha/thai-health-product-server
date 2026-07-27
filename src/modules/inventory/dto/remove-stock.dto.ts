import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  IsIn,
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

export class RemoveStockDto {
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

  @ApiProperty({
    description: 'The batch this removal draws down.',
    example: 42,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'Batch ID must be a whole number' })
  @Min(1, { message: 'Batch ID must be a valid positive integer' })
  batchId!: number;

  @ApiProperty({
    description: "Quantity to remove — capped at the batch's own remaining count.",
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
    message: 'Change type must be one of SALE, RETURN, ADJUSTMENT, DAMAGE, or EXPIRED',
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
