import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { HomeContentStatus } from '../../../generated/prisma/enums';
import { trimString } from '../../../common/utils/json-transform.util';

//* `type` IS DELIBERATELY OMITTED — IT DEFINES WHAT A ROW *IS* AND ISN'T
//* MEANT TO CHANGE AFTER CREATION. DELETE AND RE-CREATE INSTEAD OF RE-TYPING A ROW.
export class UpdateHomeDto {
  // ─── Configuration ───────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Lifecycle/visibility status.',
    enum: HomeContentStatus,
    enumName: 'HomeContentStatus',
    example: HomeContentStatus.INACTIVE,
  })
  @IsOptional()
  @IsEnum(HomeContentStatus, { message: 'Please select a valid status' })
  status?: HomeContentStatus;

  // ─── Content ─────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'English slide heading.',
    example: 'Better Health Made Simple',
    maxLength: 255,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Heading must be a valid text string' })
  @MaxLength(255, { message: 'Heading cannot exceed 255 characters' })
  heading?: string;

  @ApiPropertyOptional({
    description: 'English body copy, paired with heading.',
    example:
      'Science-backed healthcare products designed to support your daily health',
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Body text must be a valid text string' })
  bodyText?: string;

  @ApiPropertyOptional({
    description: 'Thai heading, mirrors `heading`.',
    example: 'สุขภาพที่ดีทำได้ง่ายๆ',
    maxLength: 255,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Thai heading must be a valid text string' })
  @MaxLength(255, { message: 'Thai heading cannot exceed 255 characters' })
  headingTh?: string;

  @ApiPropertyOptional({
    description: 'Thai body copy, mirrors `bodyText`.',
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Thai body text must be a valid text string' })
  bodyTextTh?: string;

  // ─── Media ───────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description:
      'Cover image (stored at `imageUrl`). Uploading a new image replaces the old one.',
  })
  @IsOptional()
  image?: Express.Multer.File;

  @ApiPropertyOptional({
    description: 'Video source URL (OVC content).',
    example: 'https://cdn.example.com/ovc/ad.mp4',
    maxLength: 512,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Video URL must be a valid text string' })
  @MaxLength(512, { message: 'Video URL cannot exceed 512 characters' })
  videoUrl?: string;

  @ApiPropertyOptional({
    description:
      'Click-through target, e.g. a "Shop Now"/"Learn More" destination.',
    example: '/products',
    maxLength: 512,
  })
  //* DELIBERATELY NOT @IsUrl() — SEE THE SAME FIELD IN create-home.dto.ts
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Redirect URL must be a valid text string' })
  @MaxLength(512, { message: 'Redirect URL cannot exceed 512 characters' })
  redirectUrl?: string;

  // ─── Ordering ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Manual sort position within this content type.',
    example: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Display order must be a whole number' })
  @Min(0, { message: 'Display order cannot be negative' })
  displayOrder?: number;
}
