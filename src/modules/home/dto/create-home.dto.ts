import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  HomeContentType,
  HomeContentStatus,
} from '../../../generated/prisma/enums';
import { trimString } from '../../../common/utils/json-transform.util';
import { IsEmptyWhen } from '../../../common/decorators/validation/is-empty-when.decorator';

export class CreateHomeDto {
  // ─── Identity ────────────────────────────────────────────────────────────────

  @ApiProperty({
    description:
      'Which landing-page section this row belongs to. Drives which of the fields below are required — see the per-field descriptions.',
    enum: HomeContentType,
    enumName: 'HomeContentType',
    example: HomeContentType.HERO_SLIDER,
  })
  //* NO @IsNotEmpty HERE — @IsEnum ALREADY REJECTS undefined/missing ON ITS OWN;
  //* STACKING BOTH WOULD PRODUCE TWO ERROR MESSAGES FOR ONE OMITTED FIELD
  @IsEnum(HomeContentType, { message: 'Please select a valid content type' })
  type!: HomeContentType;

  // ─── Configuration ───────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Lifecycle/visibility status. Defaults to ACTIVE.',
    enum: HomeContentStatus,
    enumName: 'HomeContentStatus',
    default: HomeContentStatus.ACTIVE,
    example: HomeContentStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(HomeContentStatus, { message: 'Please select a valid status' })
  status?: HomeContentStatus;

  // ─── Content ─────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'English slide heading. Required when type = HERO_SLIDER; ignored for PROMOTION_BANNER/OVC.',
    example: 'Better Health Made Simple',
    maxLength: 255,
  })
  //* STILL VALIDATED WHEN PROVIDED, EVEN FOR A TYPE THAT DOESN'T REQUIRE IT
  @ValidateIf(
    (dto: CreateHomeDto) =>
      dto.heading !== undefined || dto.type === HomeContentType.HERO_SLIDER,
  )
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Heading is required for hero slider content' })
  @IsString({ message: 'Heading must be a valid text string' })
  @MaxLength(255, { message: 'Heading cannot exceed 255 characters' })
  heading?: string;

  @ApiPropertyOptional({
    description:
      'English body copy, paired with heading. Required when type = HERO_SLIDER.',
    example:
      'Science-backed healthcare products designed to support your daily health',
  })
  @ValidateIf(
    (dto: CreateHomeDto) =>
      dto.bodyText !== undefined || dto.type === HomeContentType.HERO_SLIDER,
  )
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Body text is required for hero slider content' })
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

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description:
      'Cover image, required for every content type (used as the video thumbnail for OVC). Stored at `imageUrl`.',
  })
  //* @IsOptional() IS LOAD-BEARING, NOT DECORATIVE — WITH useDefineForClassFields
  //* (IMPLIED BY tsconfig's target: ES2023), AN UNDECORATED CLASS FIELD STILL
  //* BECOMES AN OWN `undefined` PROPERTY ON EVERY INSTANCE, WHICH whitelist +
  //* forbidNonWhitelisted (main.ts) THEN REJECTS AS "property image should not
  //* exist" — REGARDLESS OF WHAT MULTER DID WITH THE REQUEST. REQUIREDNESS IS
  //* STILL ENFORCED MANUALLY IN HomeService.createHome, NOT HERE.
  @IsOptional()
  image?: Express.Multer.File;

  @ApiPropertyOptional({
    description:
      'Video source URL. Required when type = OVC; not allowed when type = HERO_SLIDER.',
    example: 'https://cdn.example.com/ovc/ad.mp4',
    maxLength: 512,
  })
  @ValidateIf(
    (dto: CreateHomeDto) =>
      dto.videoUrl !== undefined || dto.type === HomeContentType.OVC,
  )
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Video URL is required for OVC content' })
  @IsString({ message: 'Video URL must be a valid text string' })
  @MaxLength(512, { message: 'Video URL cannot exceed 512 characters' })
  //* videoUrl IS OVC-ONLY CONTENT — A HERO SLIDER MUST NEVER CARRY ONE. THIS
  //* RUNS INSIDE THE SAME @ValidateIf GATE ABOVE, WHICH IS FINE: THAT GATE
  //* OPENS WHENEVER videoUrl IS ACTUALLY PROVIDED, WHICH IS EXACTLY WHEN THIS
  //* CHECK NEEDS TO FIRE. SEE UpdateHomeDto'S SERVICE-LAYER EQUIVALENT — `type`
  //* IS IMMUTABLE ON UPDATE, SO THAT DIRECTION CAN'T BE VALIDATED HERE.
  @IsEmptyWhen('type', HomeContentType.HERO_SLIDER, {
    message: 'Video URL is not allowed for hero slider content',
  })
  videoUrl?: string;

  @ApiPropertyOptional({
    description:
      'Click-through target, e.g. a "Shop Now"/"Learn More" destination.',
    example: '/products',
    maxLength: 512,
  })
  //* DELIBERATELY NOT @IsUrl() — THIS FIELD IS BOTH A RELATIVE IN-APP PATH
  //* (E.G. "/products") AND AN ABSOLUTE EXTERNAL URL DEPENDING ON `type`,
  //* A SHAPE @IsUrl CAN'T EXPRESS IN ONE RULE. FREE-FORM STRING BY DESIGN.
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Redirect URL must be a valid text string' })
  @MaxLength(512, { message: 'Redirect URL cannot exceed 512 characters' })
  redirectUrl?: string;

  // ─── Ordering ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Manual sort position within this content type (carousel/list order). Defaults to 0.',
    example: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Display order must be a whole number' })
  @Min(0, { message: 'Display order cannot be negative' })
  displayOrder?: number;
}
