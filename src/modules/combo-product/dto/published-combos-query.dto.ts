import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination';
import { parseBooleanInput } from '../../../common/utils/json-transform.util';

//* WHITELIST OF SORTABLE COLUMNS FOR THE PUBLIC LIST — DELIBERATELY NARROWER
//* THAN COMBO_SORT_FIELDS (all-combos-query.dto.ts): `quantity`/`updatedAt`/
//* `startsAt`/`endsAt` ARE ADMIN CONCERNS, AND `totalPrice` IS THE PRE-DISCOUNT
//* SUM, NOT WHAT A CUSTOMER SORTING "BY PRICE" MEANS — `comboPrice` IS.
export const PUBLIC_COMBO_SORT_FIELDS = [
  'createdAt',
  'comboPrice',
  'title',
] as const;
export type PublicComboSortField = (typeof PUBLIC_COMBO_SORT_FIELDS)[number];

//* EXTENDS THE SHARED PAGE/LIMIT/SORT-ORDER/SEARCH CONTRACT WITH THE ONE
//* STOREFRONT-SAFE FILTER. VISIBILITY (ACTIVE + PUBLISHED + NOT DELETED) IS
//* NOT A QUERY PARAM — IT IS ALWAYS APPLIED, SAME AS getComboBySlug.
export class PublishedCombosQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter to only featured combos',
    example: true,
  })
  @IsOptional()
  //* QUERY STRINGS ARRIVE AS TEXT — SAME TRANSFORM AS AllCombosQueryDto.isFeatured.
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isFeatured must be either true or false' })
  isFeatured?: boolean;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: PUBLIC_COMBO_SORT_FIELDS,
    default: 'createdAt',
    example: 'comboPrice',
  })
  @IsOptional()
  @IsIn(PUBLIC_COMBO_SORT_FIELDS, {
    message: `sortBy must be one of: ${PUBLIC_COMBO_SORT_FIELDS.join(', ')}`,
  })
  sortBy?: PublicComboSortField;
}
