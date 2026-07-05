import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination';
import { ProductType } from '../../../generated/prisma/enums';

//* EXTENDS THE SHARED PAGE/LIMIT/SORT-ORDER/SEARCH CONTRACT WITH STOREFRONT-ONLY FILTERS.
export class PublishedProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Comma-separated category IDs to filter by',
    example: '1,2,3',
  })
  @IsOptional()
  @IsString({ message: 'categoryIds must be a comma-separated string of IDs' })
  @Matches(/^\d+(,\d+)*$/, {
    message: 'categoryIds must be a comma-separated list of positive integers',
  })
  categoryIds?: string;

  @ApiPropertyOptional({
    enum: ProductType,
    enumName: 'ProductType',
    description: 'Filter by product type',
    example: ProductType.SIMPLE,
  })
  @IsOptional()
  @IsEnum(ProductType, { message: 'Please select a valid product type' })
  productType?: ProductType;
}
