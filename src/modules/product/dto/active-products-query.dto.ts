import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination';
import { ProductType } from '../../../generated/prisma/enums';

//* WHITELIST OF SORTABLE COLUMNS — THE VALUE IS PASSED STRAIGHT INTO A
//* PRISMA orderBy KEY, SO ONLY FIELDS VALIDATED HERE MAY EVER REACH IT.
export const PRODUCT_SORT_FIELDS = ['createdAt', 'basePrice', 'name'] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

//* EXTENDS THE SHARED PAGE/LIMIT/SORT-ORDER/SEARCH CONTRACT WITH STOREFRONT-ONLY FILTERS.
export class ActiveProductsQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: PRODUCT_SORT_FIELDS,
    default: 'createdAt',
    example: 'createdAt',
  })
  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS, {
    message: `sortBy must be one of: ${PRODUCT_SORT_FIELDS.join(', ')}`,
  })
  sortBy?: ProductSortField;
}
