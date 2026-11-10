import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../shared/pagination';
import { NewsEventStatus } from '../../../generated/prisma/enums';
import { parseBooleanInput } from '../../../common/utils/json-transform.util';
import {
  RELATED_NEWS_EVENTS_DEFAULT_LIMIT,
  RELATED_NEWS_EVENTS_MAX_LIMIT,
} from '../news-event.constants';

export const NEWS_EVENT_ADMIN_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'publishedAt',
  'title',
] as const;
export type NewsEventAdminSortField =
  (typeof NEWS_EVENT_ADMIN_SORT_FIELDS)[number];

export const NEWS_EVENT_PUBLIC_SORT_FIELDS = ['publishedAt', 'title'] as const;
export type NewsEventPublicSortField =
  (typeof NEWS_EVENT_PUBLIC_SORT_FIELDS)[number];

export const NEWS_EVENT_TIMING = ['upcoming', 'past'] as const;
export type NewsEventTiming = (typeof NEWS_EVENT_TIMING)[number];

//* ═══════════════════════════════════════════════════════════════════════
//* ADMIN LIST QUERY — search matches title / titleTh
//* ═══════════════════════════════════════════════════════════════════════

export class NewsEventAdminQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: NewsEventStatus,
    enumName: 'NewsEventStatus',
    description:
      'Filter by status. Omit to list every post, archived (soft-deleted) ones included.',
  })
  @IsOptional()
  @IsEnum(NewsEventStatus, { message: 'Please select a valid status' })
  status?: NewsEventStatus;

  @ApiPropertyOptional({ description: 'Filter by type ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Type ID must be a whole number' })
  @Min(1, { message: 'Type ID must be a valid positive integer' })
  typeId?: number;

  @ApiPropertyOptional({ description: 'Filter by featured flag' })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isFeatured must be true or false' })
  isFeatured?: boolean;

  @ApiPropertyOptional({
    enum: NEWS_EVENT_ADMIN_SORT_FIELDS,
    default: 'createdAt',
    description: 'Field to sort by; direction comes from `sortOrder`.',
  })
  @IsOptional()
  @IsIn(NEWS_EVENT_ADMIN_SORT_FIELDS, {
    message: `sortBy must be one of: ${NEWS_EVENT_ADMIN_SORT_FIELDS.join(', ')}`,
  })
  sortBy?: NewsEventAdminSortField;
}

//* ═══════════════════════════════════════════════════════════════════════
//* PUBLIC LIST QUERY — "Sort by A to Z" = sortBy=title&sortOrder=asc
//* ═══════════════════════════════════════════════════════════════════════

export class NewsEventPublicQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by type slug (from the active-types list)',
    example: 'event',
  })
  @IsOptional()
  @IsString({ message: 'Type must be a valid text string' })
  type?: string;

  @ApiPropertyOptional({ description: 'Only featured posts' })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isFeatured must be true or false' })
  isFeatured?: boolean;

  @ApiPropertyOptional({
    enum: NEWS_EVENT_TIMING,
    description:
      'upcoming = startsAt in the future, past = startsAt already passed. Posts without startsAt are excluded when set.',
  })
  @IsOptional()
  @IsIn(NEWS_EVENT_TIMING, { message: 'timing must be upcoming or past' })
  timing?: NewsEventTiming;

  @ApiPropertyOptional({
    enum: NEWS_EVENT_PUBLIC_SORT_FIELDS,
    default: 'publishedAt',
  })
  @IsOptional()
  @IsIn(NEWS_EVENT_PUBLIC_SORT_FIELDS, {
    message: `sortBy must be one of: ${NEWS_EVENT_PUBLIC_SORT_FIELDS.join(', ')}`,
  })
  sortBy?: NewsEventPublicSortField;
}

export class RelatedNewsEventsQueryDto {
  @ApiPropertyOptional({
    description: 'How many related posts to return',
    default: RELATED_NEWS_EVENTS_DEFAULT_LIMIT,
    minimum: 1,
    maximum: RELATED_NEWS_EVENTS_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be a whole number' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(RELATED_NEWS_EVENTS_MAX_LIMIT, {
    message: `Limit cannot exceed ${RELATED_NEWS_EVENTS_MAX_LIMIT}`,
  })
  limit?: number = RELATED_NEWS_EVENTS_DEFAULT_LIMIT;
}
