import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination';
import {
  CategoryProductStatus,
  StockStatus,
} from '../../../generated/prisma/enums';
import { parseBooleanInput } from '../../../common/utils/json-transform.util';

//* WHITELIST OF SORTABLE COLUMNS — THE VALUE IS PASSED STRAIGHT INTO A PRISMA
//* orderBy KEY, SO ONLY FIELDS VALIDATED HERE MAY EVER REACH IT. SAME
//* CONTRACT AS PRODUCT_SORT_FIELDS (product/dto/active-products-query.dto.ts).
//*
//* ALL THREE AVAILABILITY NUMBERS ARE SORTABLE BECAUSE THEY ANSWER DIFFERENT
//* ADMIN QUESTIONS: `availableQuantity` = WHAT STOCK CAN ASSEMBLE RIGHT NOW
//* (SORT TO FIND BUNDLES ABOUT TO BREAK), `offeredQuantity` = THE CAP THAT WAS
//* PROMISED, `soldQuantity` = HOW FAR THAT CAP HAS BEEN CONSUMED (SORT TO FIND
//* THE OFFERS ABOUT TO RETIRE THEMSELVES).
export const COMBO_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'title',
  'comboPrice',
  'totalPrice',
  'availableQuantity',
  'offeredQuantity',
  'soldQuantity',
  'startsAt',
  'endsAt',
] as const;
export type ComboSortField = (typeof COMBO_SORT_FIELDS)[number];

//* EXTENDS THE SHARED PAGE/LIMIT/SORT-ORDER/SEARCH CONTRACT WITH THE ADMIN
//* COMBO TABLE'S OWN FILTERS. EVERY FILTER IS OPTIONAL AND ADDITIVE — OMITTING
//* ALL OF THEM RETURNS THE PLAIN PAGINATED LIST.
export class AllCombosQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: CategoryProductStatus,
    enumName: 'CategoryProductStatus',
    description:
      'Filter by workflow status. Omit to return every status (DRAFT, ACTIVE, INACTIVE, ARCHIVED, HIDDEN).',
    example: CategoryProductStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(CategoryProductStatus, {
    message: 'Please select a valid combo status',
  })
  status?: CategoryProductStatus;

  @ApiPropertyOptional({
    enum: StockStatus,
    enumName: 'StockStatus',
    description:
      'Filter by derived availability. This is computed from the bundled items by DB trigger, not set by hand — see docs/combo-product.md.',
    example: StockStatus.LOW_STOCK,
  })
  @IsOptional()
  @IsEnum(StockStatus, { message: 'Please select a valid stock status' })
  stockStatus?: StockStatus;

  @ApiPropertyOptional({
    description: 'Filter to only featured (true) or only non-featured (false)',
    example: true,
  })
  @IsOptional()
  //* QUERY STRINGS ARRIVE AS TEXT — "true"/"1"/"on" MUST BECOME A REAL BOOLEAN
  //* BEFORE @IsBoolean SEES THEM, OR EVERY VALUE WOULD BE REJECTED. SHARED
  //* WITH THE MULTIPART CREATE/UPDATE DTOs SO ALL THREE PARSE IDENTICALLY.
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isFeatured must be either true or false' })
  isFeatured?: boolean;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: COMBO_SORT_FIELDS,
    default: 'createdAt',
    example: 'createdAt',
  })
  @IsOptional()
  @IsIn(COMBO_SORT_FIELDS, {
    message: `sortBy must be one of: ${COMBO_SORT_FIELDS.join(', ')}`,
  })
  sortBy?: ComboSortField;
}
