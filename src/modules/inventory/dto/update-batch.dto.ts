import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateBatchDto {
  @ApiPropertyOptional({
    description: 'Human-readable batch/lot number.',
    example: '14-BEAUTY-001',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Batch number must be a valid text string' })
  @MaxLength(100, { message: 'Batch number cannot exceed 100 characters' })
  batchNo?: string;

  @ApiPropertyOptional({
    description: 'Quantity remaining from this batch.',
    example: 120,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Remaining must be a whole number' })
  @Min(0, { message: 'Remaining cannot be negative' })
  remaining?: number;

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
}
