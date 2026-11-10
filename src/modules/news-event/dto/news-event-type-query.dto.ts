import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../shared/pagination';
import { parseBooleanInput } from '../../../common/utils/json-transform.util';

//* ADMIN LIST — SHARED PAGE/LIMIT/SORT/SEARCH CONTRACT + AN ACTIVE FILTER
export class NewsEventTypeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by active flag. Omit to return every type.',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
