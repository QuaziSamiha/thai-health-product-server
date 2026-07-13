import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  Min,
  IsOptional,
  IsEnum,
  IsString,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryExchangeType } from '../../../generated/prisma/enums';

export class CreateInventoryDto {
  @ApiProperty({
    description: 'Magnitude of this stock movement.',
    example: 5,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Reason this stock movement happened. Defaults to ADD.',
    enum: InventoryExchangeType,
    default: InventoryExchangeType.ADD,
    example: InventoryExchangeType.ADD,
  })
  @IsOptional()
  @IsEnum(InventoryExchangeType, {
    message: 'Please select a valid change type',
  })
  changeType?: InventoryExchangeType;

  @ApiPropertyOptional({
    description: 'Free-text human note for this movement.',
    example: 'Cycle count discrepancy, warehouse B',
  })
  @IsOptional()
  @IsString({ message: 'Reason must be a valid text string' })
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Free-text pointer to an external record (order ID, purchase order, etc.).',
    example: 'ORD-10234',
  })
  @IsOptional()
  @IsString({ message: 'Reference ID must be a valid text string' })
  referenceId?: string;

  @ApiPropertyOptional({
    description: 'Cost basis snapshot at the time of this stock change.',
    example: 210.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Cost price must be a valid number' })
  costPrice?: number;

  @ApiPropertyOptional({
    description: 'Selling price snapshot at the time of this stock change.',
    example: 450.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Selling price must be a valid number' })
  sellingPrice?: number;

  @ApiPropertyOptional({
    description: 'Product this movement applies to, if not variant-specific.',
    example: 14,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Product ID must be a whole number' })
  @Min(1, { message: 'Product ID must be a valid positive integer' })
  productId?: number;

  @ApiPropertyOptional({
    description: 'Variant this movement applies to, if variant-specific.',
    example: 104,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Variant ID must be a whole number' })
  @Min(1, { message: 'Variant ID must be a valid positive integer' })
  variantId?: number;
}
