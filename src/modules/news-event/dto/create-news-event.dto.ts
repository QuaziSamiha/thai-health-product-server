import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { plainToInstance, Transform, Type } from 'class-transformer';
import { NewsEventStatus } from '../../../generated/prisma/enums';
import {
  blankNumberToUndefined,
  parseBooleanInput,
  trimString,
  tryParseJson,
} from '../../../common/utils/json-transform.util';
import { toDateOrNull, trimToNull } from './news-event-transform.util';

//* ARCHIVED IS RESERVED FOR SOFT DELETE (IT IS PAIRED WITH deletedAt), SO
//* THE FORM MAY ONLY CHOOSE BETWEEN THESE THREE
export const EDITABLE_NEWS_EVENT_STATUSES = [
  NewsEventStatus.ACTIVE,
  NewsEventStatus.INACTIVE,
  NewsEventStatus.DRAFT,
];

export class NewsEventSeoMetadataInputDto {
  @ApiPropertyOptional({
    description: 'SEO <title> in English',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'metaTitle must be a valid text string' })
  @MaxLength(255, { message: 'metaTitle cannot exceed 255 characters' })
  metaTitle?: string;

  @ApiPropertyOptional({
    description: 'SEO meta description in English',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'metaDescription must be a valid text string' })
  @MaxLength(500, { message: 'metaDescription cannot exceed 500 characters' })
  metaDescription?: string;

  @ApiPropertyOptional({ description: 'SEO <title> in Thai', maxLength: 255 })
  @IsOptional()
  @IsString({ message: 'metaTitleTh must be a valid text string' })
  @MaxLength(255, { message: 'metaTitleTh cannot exceed 255 characters' })
  metaTitleTh?: string;

  @ApiPropertyOptional({
    description: 'SEO meta description in Thai',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'metaDescriptionTh must be a valid text string' })
  @MaxLength(500, { message: 'metaDescriptionTh cannot exceed 500 characters' })
  metaDescriptionTh?: string;
}

export class CreateNewsEventDto {
  // ─── Classification ──────────────────────────────────────────────────────────

  @ApiProperty({
    description: 'ID of the news & event type.',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @Transform(blankNumberToUndefined)
  @IsInt({ message: 'Type ID must be a whole number' })
  @Min(1, { message: 'Type ID must be a valid positive integer' })
  typeId!: number;

  @ApiPropertyOptional({
    description:
      'Visibility. Defaults to DRAFT. ACTIVE posts appear on the storefront once `publishedAt` is reached. ARCHIVED cannot be set here — use the soft-delete endpoint.',
    enum: EDITABLE_NEWS_EVENT_STATUSES,
    default: NewsEventStatus.DRAFT,
  })
  @IsOptional()
  @IsIn(EDITABLE_NEWS_EVENT_STATUSES, {
    message: 'Status must be ACTIVE, INACTIVE or DRAFT',
  })
  status?: NewsEventStatus;

  @ApiPropertyOptional({
    description: 'Pin to the featured section.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isFeatured must be true or false' })
  isFeatured?: boolean;

  // ─── Content (English) ───────────────────────────────────────────────────────

  @ApiProperty({
    description: 'English title. The URL slug is derived from this.',
    example: 'Expanding Access to Premium Wellness',
    maxLength: 255,
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Title is required' })
  @IsString({ message: 'Title must be a valid text string' })
  @MaxLength(255, { message: 'Title cannot exceed 255 characters' })
  title!: string;

  @ApiPropertyOptional({
    description: 'Short summary for cards and meta.',
    maxLength: 500,
  })
  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString({ message: 'Excerpt must be a valid text string' })
  @MaxLength(500, { message: 'Excerpt cannot exceed 500 characters' })
  excerpt?: string | null;

  @ApiProperty({
    description: 'English rich-text (HTML) body from the editor.',
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Content is required' })
  @IsString({ message: 'Content must be a valid text string' })
  content!: string;

  // ─── Content (Thai) ──────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Thai title, mirrors `title`.',
    maxLength: 255,
  })
  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString({ message: 'Thai title must be a valid text string' })
  @MaxLength(255, { message: 'Thai title cannot exceed 255 characters' })
  titleTh?: string | null;

  @ApiPropertyOptional({
    description: 'Thai summary, mirrors `excerpt`.',
    maxLength: 500,
  })
  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString({ message: 'Thai excerpt must be a valid text string' })
  @MaxLength(500, { message: 'Thai excerpt cannot exceed 500 characters' })
  excerptTh?: string | null;

  @ApiPropertyOptional({
    description: 'Thai rich-text (HTML) body, mirrors `content`.',
  })
  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString({ message: 'Thai content must be a valid text string' })
  contentTh?: string | null;

  // ─── Event Details (optional) ────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Event start (ISO 8601). Send "" on update to clear.',
    example: '2025-11-27T09:00:00+07:00',
    type: String,
    format: 'date-time',
  })
  @Transform(({ value }) => toDateOrNull(value))
  @IsOptional()
  @IsDate({ message: 'startsAt must be a valid date' })
  startsAt?: Date | null;

  @ApiPropertyOptional({
    description: 'Event end (ISO 8601). Must not be before `startsAt`.',
    example: '2025-11-27T17:00:00+07:00',
    type: String,
    format: 'date-time',
  })
  @Transform(({ value }) => toDateOrNull(value))
  @IsOptional()
  @IsDate({ message: 'endsAt must be a valid date' })
  endsAt?: Date | null;

  @ApiPropertyOptional({
    description: 'Event location in English.',
    maxLength: 255,
  })
  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString({ message: 'Location must be a valid text string' })
  @MaxLength(255, { message: 'Location cannot exceed 255 characters' })
  location?: string | null;

  @ApiPropertyOptional({
    description: 'Event location in Thai.',
    maxLength: 255,
  })
  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString({ message: 'Thai location must be a valid text string' })
  @MaxLength(255, { message: 'Thai location cannot exceed 255 characters' })
  locationTh?: string | null;

  // ─── Publishing & SEO ────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Go-live date shown on cards (ISO 8601). A future date schedules the post. If omitted, it is set to now when the post first becomes ACTIVE.',
    type: String,
    format: 'date-time',
  })
  @Transform(({ value }) => toDateOrNull(value))
  @IsOptional()
  @IsDate({ message: 'publishedAt must be a valid date' })
  publishedAt?: Date | null;

  @ApiPropertyOptional({
    description:
      'SEO metadata (EN + TH). Send as a JSON object, or a JSON-encoded string when using multipart/form-data.',
    type: () => NewsEventSeoMetadataInputDto,
  })
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = tryParseJson(value);
    if (parsed === null || typeof parsed !== 'object') return parsed;
    return plainToInstance(NewsEventSeoMetadataInputDto, parsed);
  })
  @ValidateNested()
  seoMetadata?: NewsEventSeoMetadataInputDto;

  // ─── Images ──────────────────────────────────────────────────────────────────

  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description:
      'Image files (1 to 10; JPEG/PNG/WEBP/GIF/AVIF, max 5 MB each). The first file becomes the cover.',
  })
  @IsOptional()
  images?: Express.Multer.File[];
}
