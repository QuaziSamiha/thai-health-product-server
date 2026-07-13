import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { CategoryProductStatus } from '../../../generated/prisma/enums';

export class UpdateComboProductDto {
  @ApiPropertyOptional({
    description: 'Display title of the combo in English.',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Combo title must be a valid text string' })
  @MaxLength(255, { message: 'Combo title cannot exceed 255 characters' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Combo title in Thai.',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Thai title must be a valid text string' })
  @MaxLength(255, { message: 'Thai title cannot exceed 255 characters' })
  titleTh?: string;

  @ApiPropertyOptional({ description: 'Long-form description in English.' })
  @IsOptional()
  @IsString({ message: 'Description must be a valid text string' })
  description?: string;

  @ApiPropertyOptional({ description: 'Long-form description in Thai.' })
  @IsOptional()
  @IsString({ message: 'Thai description must be a valid text string' })
  descriptionTh?: string;

  @ApiPropertyOptional({
    description: 'Short summary for cards/listings.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Short description must be a valid text string' })
  @MaxLength(500, { message: 'Short description cannot exceed 500 characters' })
  shortDescription?: string;

  @ApiPropertyOptional({
    description: 'Short summary in Thai.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Thai short description must be a valid text string' })
  @MaxLength(500, {
    message: 'Thai short description cannot exceed 500 characters',
  })
  shortDescTh?: string;

  @ApiPropertyOptional({ description: 'Sum-of-parts display price.' })
  @IsOptional()
  @IsNumber({}, { message: 'Total price must be a valid number' })
  @Min(0, { message: 'Total price cannot be negative' })
  totalPrice?: number;

  @ApiPropertyOptional({
    description: 'The bundle offer price the customer pays.',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Combo price must be a valid number' })
  @Min(0, { message: 'Combo price cannot be negative' })
  comboPrice?: number;

  @ApiPropertyOptional({ description: 'Promotion window start.' })
  @IsOptional()
  @IsDateString({}, { message: 'Starts at must be a valid ISO date string' })
  startsAt?: string;

  @ApiPropertyOptional({ description: 'Promotion window end.' })
  @IsOptional()
  @IsDateString({}, { message: 'Ends at must be a valid ISO date string' })
  endsAt?: string;

  @ApiPropertyOptional({
    description: 'Visibility status of the combo.',
    enum: CategoryProductStatus,
  })
  @IsOptional()
  @IsEnum(CategoryProductStatus, { message: 'Please select a valid status' })
  status?: CategoryProductStatus;

  @ApiPropertyOptional({
    description: 'Whether to highlight this combo in featured sections.',
  })
  @IsOptional()
  @IsBoolean({ message: 'isFeatured must be true or false' })
  isFeatured?: boolean;

  @ApiPropertyOptional({ description: 'SEO meta title in English.' })
  @IsOptional()
  @IsString({ message: 'Meta title must be a text string' })
  metaTitle?: string;

  @ApiPropertyOptional({ description: 'SEO meta description in English.' })
  @IsOptional()
  @IsString({ message: 'Meta description must be a text string' })
  metaDescription?: string;

  @ApiPropertyOptional({ description: 'SEO meta title in Thai.' })
  @IsOptional()
  @IsString({ message: 'Thai meta title must be a text string' })
  metaTitleTh?: string;

  @ApiPropertyOptional({ description: 'SEO meta description in Thai.' })
  @IsOptional()
  @IsString({ message: 'Thai meta description must be a text string' })
  metaDescriptionTh?: string;
}
