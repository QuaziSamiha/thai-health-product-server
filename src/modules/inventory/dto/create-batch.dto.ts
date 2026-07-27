import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
  IsOptional,
  IsInt,
  IsNumber,
  Min,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryExchangeType } from '../../../generated/prisma/enums';
import { IsGteProperty } from '../../../common/decorators/validation/is-gte-property.decorator';
import { IsAfter } from '../../../common/decorators/validation/is-after.decorator';

//* THIS DTO BACKS BOTH THE GENERIC MANUAL BATCH-CRUD PATH (InventoryService.createBatch)
//* AND EACH ITEM OF THE add-stock BULK WORKFLOW (InventoryService.addStock) — RATHER THAN
//* MAINTAINING A SEPARATE, NEARLY-IDENTICAL "AddStockItemDto". changeType/reason/sellingPrice
//* FEED THE Inventory LOG ENTRY THAT add-stock ALSO WRITES ALONGSIDE THE Batch ROW ITSELF.
export class CreateBatchDto {
  @ApiProperty({
    description: 'Quantity received in this batch.',
    example: 100,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity!: number;

  @ApiProperty({
    description: 'Cost price paid per unit for this batch.',
    example: 250.0,
    minimum: 0,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Cost price must be a valid number' })
  @Min(0, { message: 'Cost price cannot be negative' })
  costPrice!: number;

  @ApiPropertyOptional({
    description: 'Selling price snapshot at the time this batch was recorded.',
    example: 450.0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Selling price must be a valid number' })
  @Min(0, { message: 'Selling price cannot be negative' })
  @IsGteProperty('costPrice', {
    message: 'Selling price cannot be less than cost price',
  })
  sellingPrice?: number;

  @ApiPropertyOptional({
    description: 'Date the batch was manufactured.',
    example: '2026-01-15',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Manufacturing date must be a valid date' })
  manufacturingDate?: string;

  @ApiPropertyOptional({
    description: 'Date the batch expires.',
    example: '2027-01-15',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Expiry date must be a valid date' })
  @IsAfter('manufacturingDate', {
    message: 'Expiry date must be after manufacturing date',
  })
  expiryDate?: string;

  @ApiPropertyOptional({
    description:
      'Reason this stock movement happened, for the accompanying inventory log entry. Defaults to ADD.',
    enum: InventoryExchangeType,
    enumName: 'InventoryExchangeType',
    default: InventoryExchangeType.ADD,
    example: InventoryExchangeType.ADD,
  })
  @IsOptional()
  @IsEnum(InventoryExchangeType, {
    message: 'Please select a valid change type',
  })
  changeType?: InventoryExchangeType;

  @ApiPropertyOptional({
    description:
      'Free-text note for this stock movement. Defaults to a generated note referencing the batch number when omitted.',
    example: 'Received from Supplier ABC, PO#1029',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Reason must be a valid text string' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason?: string;

  @ApiPropertyOptional({
    description: 'Owning product ID, if this batch is for a SIMPLE product.',
    example: 14,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Product ID must be a whole number' })
  @Min(1, { message: 'Product ID must be a valid positive integer' })
  productId?: number;

  @ApiPropertyOptional({
    description:
      'Owning variant ID, if this batch is for one specific variant.',
    example: 104,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Variant ID must be a whole number' })
  @Min(1, { message: 'Variant ID must be a valid positive integer' })
  variantId?: number;
}
