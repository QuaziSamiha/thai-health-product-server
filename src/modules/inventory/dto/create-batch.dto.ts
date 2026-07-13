import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBatchDto {
  @ApiProperty({
    description: 'Human-readable batch/lot number, e.g. "14-BEAUTY-001".',
    example: '14-BEAUTY-001',
    maxLength: 100,
  })
  @IsNotEmpty({ message: 'Batch number is required' })
  @IsString({ message: 'Batch number must be a valid text string' })
  @MaxLength(100, { message: 'Batch number cannot exceed 100 characters' })
  batchNo!: string;

  @ApiPropertyOptional({
    description: 'Quantity added when this batch was received. Defaults to 0.',
    example: 500,
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(0, { message: 'Quantity cannot be negative' })
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Date the batch was manufactured.',
    example: '2026-01-15T00:00:00Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Manufacturing date must be a valid date' })
  manufacturingDate?: string;

  @ApiPropertyOptional({
    description: 'Date the batch expires.',
    example: '2027-01-15T00:00:00Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Expiry date must be a valid date' })
  expiryDate?: string;

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
