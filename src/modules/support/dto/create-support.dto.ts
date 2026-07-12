import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { SupportType, SupportStatus } from '../../../generated/prisma/enums';
import { trimString } from '../../../common/utils/json-transform.util';

export class CreateSupportDto {
  // ─── Identity ────────────────────────────────────────────────────────────────

  @ApiProperty({
    description:
      'Which support/policy tab this row belongs to (Delivery Policy, Terms & Conditions, ...). Immutable after creation.',
    enum: SupportType,
    enumName: 'SupportType',
    example: SupportType.DELIVERY_POLICY,
  })
  //* NO @IsNotEmpty HERE — @IsEnum ALREADY REJECTS undefined/missing ON ITS OWN
  @IsEnum(SupportType, { message: 'Please select a valid support type' })
  type!: SupportType;

  // ─── Configuration ───────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Lifecycle/visibility status. Defaults to ACTIVE.',
    enum: SupportStatus,
    enumName: 'SupportStatus',
    default: SupportStatus.ACTIVE,
    example: SupportStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(SupportStatus, { message: 'Please select a valid status' })
  status?: SupportStatus;

  // ─── Content (English) ───────────────────────────────────────────────────────

  @ApiProperty({
    description: 'English page title. The URL slug is derived from this.',
    example: 'Delivery Policy',
    maxLength: 255,
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Title is required' })
  @IsString({ message: 'Title must be a valid text string' })
  @MaxLength(255, { message: 'Title cannot exceed 255 characters' })
  title!: string;

  @ApiProperty({
    description: 'English page content.',
    example: 'Orders are delivered within 3-5 business days across Thailand.',
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Content is required' })
  @IsString({ message: 'Content must be a valid text string' })
  content!: string;

  @ApiPropertyOptional({
    description: 'Extra note/disclaimer rendered below the main content.',
    example: 'Delivery times may vary during public holidays.',
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

  @ApiPropertyOptional({
    description: 'Thai page content, mirrors `content`.',
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Thai content must be a valid text string' })
  contentTh?: string;

  @ApiPropertyOptional({
    description: 'Thai extra note, mirrors `note`.',
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Thai note must be a valid text string' })
  noteTh?: string;
}
