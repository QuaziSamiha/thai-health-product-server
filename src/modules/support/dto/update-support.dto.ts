import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, IsOptional, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { SupportStatus } from '../../../generated/prisma/enums';
import { trimString } from '../../../common/utils/json-transform.util';

//* `type` IS DELIBERATELY OMITTED — IT DEFINES WHICH TAB A ROW BELONGS TO AND
//* ISN'T MEANT TO CHANGE AFTER CREATION. DELETE AND RE-CREATE INSTEAD OF RE-TYPING A ROW.
export class UpdateSupportDto {
  // ─── Configuration ───────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Lifecycle/visibility status.',
    enum: SupportStatus,
    enumName: 'SupportStatus',
    example: SupportStatus.INACTIVE,
  })
  @IsOptional()
  @IsEnum(SupportStatus, { message: 'Please select a valid status' })
  status?: SupportStatus;

  // ─── Content (English) ───────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'English page title. The URL slug is re-derived from this when changed.',
    example: 'Delivery Policy',
    maxLength: 255,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Title must be a valid text string' })
  @MaxLength(255, { message: 'Title cannot exceed 255 characters' })
  title?: string;

  @ApiPropertyOptional({ description: 'English page content.' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Content must be a valid text string' })
  content?: string;

  @ApiPropertyOptional({
    description: 'Extra note/disclaimer rendered below the main content.',
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Note must be a valid text string' })
  note?: string;

  // ─── Secondary Content (Thai) ────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Thai page title, mirrors `title`.',
    example: 'นโยบายการจัดส่ง',
    maxLength: 255,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Thai title must be a valid text string' })
  @MaxLength(255, { message: 'Thai title cannot exceed 255 characters' })
  titleTh?: string;

  @ApiPropertyOptional({ description: 'Thai page content, mirrors `content`.' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Thai content must be a valid text string' })
  contentTh?: string;

  @ApiPropertyOptional({ description: 'Thai extra note, mirrors `note`.' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Thai note must be a valid text string' })
  noteTh?: string;
}
