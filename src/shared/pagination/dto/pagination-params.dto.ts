import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsNumber,
  Min,
  IsString,
  IsIn,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * GOAL: PROVIDE FULLY DOCUMENTED API SCHEMA FOR FRONTEND CONSUMPTION.
 */
export class PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'The active page number to fetch',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Page must be a valid number' })
  @Min(1, { message: 'Page number must be at least 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Amount of items returned per request',
    example: 10,
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Limit must be a valid number' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100 items per page' })
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Sorting direction for the list',
    enum: ['asc', 'desc'],
    example: 'desc',
    default: 'desc',
  })
  @IsOptional()
  @IsString({ message: 'Sort order must be a valid text string' })
  @IsIn(['asc', 'desc'], { message: 'Sort order must be either asc or desc' })
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    description:
      'Search term to filter results by name or other searchable fields',
    example: 'Organic Coffee',
  })
  @IsOptional()
  @IsString({ message: 'Search term must be a valid text string' })
  search?: string;
}
