import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsObject,
  Min,
  IsInt,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { DiscountType } from '../../../generated/prisma/enums';
import { IsLessThanOrEqualTo } from '../../../common/decorators/validation/is-less-than-or-equal-to.decorator';

export class CreateProductVariantDto {
  @ApiPropertyOptional({
    description:
      'Variant name in English. Auto-generated from the product name + size when omitted.',
    example: 'Organic Royal Jelly - 60 Capsules',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Variant name must be a valid text string' })
  @MaxLength(255, { message: 'Variant name cannot exceed 255 characters' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Free-text size label shown to customers.',
    example: '60 Capsules',
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: 'Size must be a valid text string' })
  @MaxLength(50, { message: 'Size cannot exceed 50 characters' })
  size?: string;

  @ApiPropertyOptional({
    description: 'Variant-specific list price. Defaults to 0 if omitted.',
    example: 1500.0,
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Price must be a valid number' })
  @Min(0, { message: 'Price cannot be negative' })
  price?: number;

  @ApiPropertyOptional({
    description: 'How `discountPrice` was configured — FIXED or PERCENTAGE.',
    enum: DiscountType,
    enumName: 'DiscountType',
    example: DiscountType.PERCENTAGE,
  })
  @IsOptional()
  @IsEnum(DiscountType, { message: 'Please select a valid discount type' })
  discountType?: DiscountType;

  @ApiPropertyOptional({
    description:
      'Final discounted price for this variant. Must not exceed `price`.',
    example: 1350.0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Discount price must be a valid number' })
  @Min(0, { message: 'Discount price cannot be negative' })
  @IsLessThanOrEqualTo('price', {
    message: 'Discount price cannot be greater than the variant price',
  })
  discountPrice?: number;

  @ApiPropertyOptional({
    description: 'Cost basis for margin reporting. Admin/management use only.',
    example: 900.0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Cost per item must be a valid number' })
  @Min(0, { message: 'Cost per item cannot be negative' })
  costPerItem?: number;

  @ApiPropertyOptional({
    description: 'Stock count for this variant. Defaults to 0 if omitted.',
    example: 50,
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(0, { message: 'Quantity cannot be negative' })
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Variant-level SKU. Must be unique across all variants.',
    example: 'THP-RJ-60',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'SKU must be a valid text string' })
  @MaxLength(100, { message: 'SKU cannot exceed 100 characters' })
  sku?: string;

  @ApiPropertyOptional({
    description: 'EAN/UPC barcode for POS/warehouse scanning.',
    example: '8850123457',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Barcode must be a valid text string' })
  @MaxLength(100, { message: 'Barcode cannot exceed 100 characters' })
  barcode?: string;

  @ApiPropertyOptional({
    description: 'Weight in kilograms, used for shipping cost calculation.',
    example: 0.2,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Weight must be a valid number' })
  @Min(0, { message: 'Weight cannot be negative' })
  weight?: number;

  @ApiPropertyOptional({
    description:
      'Freeform attribute key/value pairs, e.g. {"color": "Red", "size": "XL"}.',
    example: { count: '60', potency: '1000mg' },
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject({ message: 'Attributes must be a valid object' })
  attributes?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Marks this variant as pre-selected on the product detail page. Only one variant per product should be default.',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true' || value === '1';
    return Boolean(value);
  })
  @IsBoolean({ message: 'isDefault must be true or false' })
  isDefault?: boolean;
}
