import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../shared/pagination';

//* PAGINATION FOR THE PER-PRODUCT LEDGER, PLUS THE SAME OPTIONAL variantId
//* NARROWING AS GetBatchesQueryDto — KEPT AS ITS OWN CLASS (RATHER THAN AN
//* INTERSECTION TYPE) SINCE class-validator/class-transformer NEED A REAL
//* CLASS TO APPLY DECORATOR METADATA TO A SINGLE @Query() PARAMETER.
export class GetMovementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Narrow the result to one specific variant of the product.',
    example: 104,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Variant ID must be a whole number' })
  @Min(1, { message: 'Variant ID must be a valid positive integer' })
  variantId?: number;
}
