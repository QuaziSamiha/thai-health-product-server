import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination';
import { SupportType } from '../../../generated/prisma/enums';

//* EXTENDS THE SHARED PAGE/LIMIT/SORT-ORDER/SEARCH CONTRACT WITH A TYPE FILTER —
//* THE ADMIN UI RENDERS EACH SupportType AS ITS OWN TAB (DELIVERY POLICY, TERMS
//* & CONDITIONS, PRIVACY POLICY, ...), SO LISTING OFTEN NEEDS TO SCOPE TO ONE AT A TIME.
export class SupportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: SupportType,
    enumName: 'SupportType',
    description: 'Filter by support type. Omit to return every type.',
    example: SupportType.DELIVERY_POLICY,
  })
  @IsOptional()
  @IsEnum(SupportType, { message: 'Please select a valid support type' })
  type?: SupportType;
}
