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
  //* SLUGS, NOT IDS — THE STOREFRONT MIRRORS THIS VALUE INTO ITS PUBLIC
  //* /product URL, AND generateSlug() ONLY EVER EMITS [\w-], SO A COMMA CAN
  //* NEVER APPEAR INSIDE ONE SLUG AND IS SAFE AS THE SEPARATOR.
  @ApiPropertyOptional({
    description: 'Comma-separated category slugs to filter by',
    example: 'anti-aging,vitamins',
  })
  @IsOptional()
  @IsString({
    message: 'categorySlugs must be a comma-separated string of slugs',
  })
  @Matches(/^[\w-]+(,[\w-]+)*$/, {
    message: 'categorySlugs must be a comma-separated list of category slugs',
  })
  categorySlugs?: string;

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
