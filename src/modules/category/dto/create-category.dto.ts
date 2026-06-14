import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsBoolean,
} from 'class-validator';
import { CategoryProductStatus } from '../../../generated/prisma/enums';
import { Transform, Type } from 'class-transformer';

export class CreateCategoryDto {
  // ─── Required ────────────────────────────────────────────────────────────────

  @ApiProperty({
    description: 'Display name of the category in English. Must be unique.',
    example: 'Beauty & Anti-Aging',
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'Category name is required' })
  @IsString({ message: 'Category name must be a valid text string' })
  @MaxLength(255, { message: 'Category name cannot exceed 255 characters' })
  name!: string;

  // ─── Status ──────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Visibility status of the category. Defaults to ACTIVE if omitted.',
    enum: CategoryProductStatus,
    default: CategoryProductStatus.ACTIVE,
    example: CategoryProductStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(CategoryProductStatus, { message: 'Please select a valid status' })
  status?: CategoryProductStatus;

  // ─── Primary Content (English) ───────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Detailed description of the category in English.',
    example: 'Premium skincare and anti-aging product lines.',
  })
  @IsOptional()
  @IsString({ message: 'Description must be a valid text string' })
  description?: string;

  // ─── Secondary Content (Thai) ────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Category display name in Thai.',
    example: 'ความงามและต้านวัย',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Thai name must be a valid text string' })
  @MaxLength(255, { message: 'Thai name cannot exceed 255 characters' })
  nameTh?: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the category in Thai.',
    example: 'ผลิตภัณฑ์ดูแลผิวและต้านการเสื่อมของวัย',
  })
  @IsOptional()
  @IsString({ message: 'Thai description must be a valid text string' })
  descriptionTh?: string;

  // ─── Hierarchy ───────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'ID of the parent category. Omit to create a root-level category.',
    example: 3,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Parent ID must be a whole number' })
  @Min(1, { message: 'Parent ID must be a valid positive integer' })
  parentId?: number;

  // ─── UI Metadata ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Manual sort position for menus and lists. Lower values appear first. Defaults to 0.',
    example: 5,
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Display order must be a whole number' })
  @Min(0, { message: 'Display order cannot be negative' })
  displayOrder?: number;

  @ApiPropertyOptional({
    description:
      'Whether to highlight this category in featured sections on the homepage. Defaults to false.',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'isFeatured must be true or false' })
  isFeatured?: boolean;

  // ─── Images (multipart/form-data) ────────────────────────────────────────────

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Icon image file for the category (stored at iconUrl).',
  })
  @IsOptional()
  iconImage?: Express.Multer.File;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description:
      'Thumbnail image file for the category (stored at thumbnailUrl).',
  })
  @IsOptional()
  thumbnailImage?: Express.Multer.File;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Banner image file for the category (stored at bannerUrl).',
  })
  @IsOptional()
  bannerImage?: Express.Multer.File;

  // ─── SEO Metadata ────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'SEO meta title in English.',
    example: 'Best Beauty & Anti-Aging Products',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Meta title must be a text string' })
  @MaxLength(255, { message: 'Meta title cannot exceed 255 characters' })
  metaTitle?: string;

  @ApiPropertyOptional({
    description: 'SEO meta description in English.',
    example:
      'Explore our curated range of premium beauty and anti-aging products.',
  })
  @IsOptional()
  @IsString({ message: 'Meta description must be a text string' })
  metaDescription?: string;

  @ApiPropertyOptional({
    description: 'SEO meta title in Thai.',
    example: 'สินค้าความงามและต้านวัยที่ดีที่สุด',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Thai meta title must be a text string' })
  @MaxLength(255, { message: 'Thai meta title cannot exceed 255 characters' })
  metaTitleTh?: string;

  @ApiPropertyOptional({
    description: 'SEO meta description in Thai.',
    example: 'สำรวจผลิตภัณฑ์ความงามและต้านการเสื่อมของวัยระดับพรีเมียม',
  })
  @IsOptional()
  @IsString({ message: 'Thai meta description must be a text string' })
  metaDescriptionTh?: string;
}
