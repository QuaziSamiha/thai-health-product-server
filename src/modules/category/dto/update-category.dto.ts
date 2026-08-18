import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsBoolean,
} from 'class-validator';
import { CategoryProductStatus } from '../../../generated/prisma/enums';
import { Transform, Type } from 'class-transformer';

export class UpdateCategoryDto {
  @ApiPropertyOptional({
    enum: CategoryProductStatus,
  })
  @IsOptional()
  @IsEnum(CategoryProductStatus, {
    message: 'Please select a valid status',
  })
  status?: CategoryProductStatus;

  @ApiPropertyOptional({
    description: 'The display name of the category in English',
    example: 'Beauty & Anti-Aging',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Category name must be a valid text string' })
  @MaxLength(255, { message: 'Category name cannot exceed 255 characters' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the category in English',
    example: 'High-end electronic devices and gadgets',
  })
  @IsOptional()
  @IsString({ message: 'Description must be a valid text string' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Category name in Thai for local display',
    example: 'อิเล็กทรอนิกส์',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Thai name must be a valid text string' })
  @MaxLength(255, { message: 'Thai name cannot exceed 255 characters' })
  nameTh?: string;

  @ApiPropertyOptional({ description: 'Detailed description in Thai' })
  @IsOptional()
  @IsString({ message: 'Thai description must be a valid text string' })
  descriptionTh?: string;

  @ApiPropertyOptional({
    description: 'The ID of the parent category for nested hierarchy',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Parent ID must be a whole number' })
  @Min(1, { message: 'Parent ID must be a valid positive number' })
  parentId?: number;

  @ApiPropertyOptional({
    description: 'Manual sort order for menus',
    default: 0,
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Display order must be a whole number' })
  @Min(0, { message: 'Display order cannot be a negative number' })
  displayOrder?: number;

  @ApiPropertyOptional({
    description: 'Show this category in featured sections',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'Is featured must be either true or false' })
  isFeatured?: boolean;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Image file',
  })
  @IsOptional()
  image?: Express.Multer.File;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Image file',
  })
  @IsOptional()
  iconImage?: Express.Multer.File;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Image file',
  })
  @IsOptional()
  thumbnailImage?: Express.Multer.File;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Image file',
  })
  @IsOptional()
  bannerImage?: Express.Multer.File;

  //* CLEARING AN IMAGE NEEDS ITS OWN SIGNAL. THE OTHER FIELDS FOLLOW
  //* "ABSENT = UNCHANGED", WHICH LEAVES NO VALUE THAT CAN MEAN "REMOVE IT" —
  //* AND A MULTIPART BODY CANNOT CARRY A JSON null ANYWAY, SO AN EMPTY
  //* `bannerImage` PART WOULD BE INDISTINGUISHABLE FROM NOT SENDING ONE.
  //* THE PRODUCT/COMBO MODULES SOLVE THE SAME PROBLEM WITH `deleteImageIds`;
  //* THIS IS THE SINGLE-IMAGE EQUIVALENT.
  //* IGNORED WHEN A NEW FILE IS ALSO UPLOADED — SEE CategoryService.updateCategory.
  @ApiPropertyOptional({
    description:
      'Set true to clear the existing banner image and delete the stored file. Ignored if a new bannerImage/image file is uploaded in the same request, since that replaces the banner anyway.',
    default: false,
    example: true,
  })
  @IsOptional()
  //* MULTIPART SENDS EVERY FIELD AS A STRING — SAME TRANSFORM AS isFeatured
  //* ABOVE, WITHOUT WHICH "false" WOULD ARRIVE AS A TRUTHY STRING AND WIPE
  //* THE BANNER ON EVERY SAVE.
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'removeBannerImage must be either true or false' })
  removeBannerImage?: boolean;

  @ApiPropertyOptional({ description: 'SEO Title in English', maxLength: 255 })
  @IsOptional()
  @IsString({ message: 'Meta title must be text' })
  @MaxLength(255, { message: 'Meta title cannot exceed 255 characters' })
  metaTitle?: string;

  @ApiPropertyOptional({ description: 'SEO Description in English' })
  @IsOptional()
  @IsString({ message: 'Meta description must be text' })
  metaDescription?: string;

  @ApiPropertyOptional({ description: 'SEO Title in Thai', maxLength: 255 })
  @IsOptional()
  @IsString({ message: 'Thai meta title must be text' })
  @MaxLength(255, { message: 'Thai meta title cannot exceed 255 characters' })
  metaTitleTh?: string;

  @ApiPropertyOptional({ description: 'SEO Description in Thai' })
  @IsOptional()
  @IsString({ message: 'Thai meta description must be text' })
  metaDescriptionTh?: string;
}
