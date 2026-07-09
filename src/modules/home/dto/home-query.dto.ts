import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination';
import { HomeContentType } from '../../../generated/prisma/enums';

//* EXTENDS THE SHARED PAGE/LIMIT/SORT-ORDER/SEARCH CONTRACT WITH A TYPE FILTER —
//* THE ADMIN UI RENDERS EACH HomeContentType AS ITS OWN TAB (HERO SLIDER,
//* PROMOTION BANNER, OVC), SO LISTING ALWAYS NEEDS TO SCOPE TO ONE AT A TIME.
export class HomeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: HomeContentType,
    enumName: 'HomeContentType',
    description: 'Filter by content type. Omit to return every type.',
    example: HomeContentType.HERO_SLIDER,
  })
  @IsOptional()
  @IsEnum(HomeContentType, { message: 'Please select a valid content type' })
  type?: HomeContentType;
}
