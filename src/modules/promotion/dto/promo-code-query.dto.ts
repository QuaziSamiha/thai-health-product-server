import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination';
import { DiscountType } from '../../../generated/prisma/enums';
import { parseBooleanInput } from '../../../common/utils/json-transform.util';

export class PromoCodeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: DiscountType,
    description: 'Filter by discount type. Omit to return every type.',
  })
  @IsOptional()
  @IsEnum(DiscountType, {
    message: 'Discount type must be either FIXED or PERCENTAGE',
  })
  discountType?: DiscountType;

  @ApiPropertyOptional({
    description: 'Filter by active/inactive status. Omit to return both.',
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}
