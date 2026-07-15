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
import { emptyStringToUndefined } from '../../../common/utils/json-transform.util';

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
  @IsNumber({}, { message: 'Base price must be a valid number' })
  @Min(0, { message: 'Base price cannot be negative' })
  basePrice?: number;

  @ApiPropertyOptional({
    description:
      'How `discountValue` is applied — FIXED (a currency amount subtracted from `basePrice`) or PERCENTAGE (a percentage of `basePrice` subtracted). Defaults to PERCENTAGE when omitted, even with no discount. The server derives `salePrice` from these — it is never accepted as input.',
    enum: DiscountType,
    enumName: 'DiscountType',
    default: DiscountType.PERCENTAGE,
    example: DiscountType.PERCENTAGE,
  })
  @IsOptional()
  @IsEnum(DiscountType, { message: 'Please select a valid discount type' })
  discountType?: DiscountType;

  @ApiPropertyOptional({
    description:
      'The raw configured discount, paired with `discountType` — a currency amount when FIXED (must not exceed `basePrice`), or a percentage when PERCENTAGE (must not exceed 100).',
    example: 10,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Discount value must be a valid number' })
  @Min(0, { message: 'Discount value cannot be negative' })
  discountValue?: number;

  @ApiPropertyOptional({
    description: 'Cost basis for margin reporting. Admin/management use only.',
    example: 900.0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Cost price must be a valid number' })
  @Min(0, { message: 'Cost price cannot be negative' })
  costPrice?: number;

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
    description:
      "Stock count at/below which this variant's `stockStatus` becomes LOW_STOCK instead of IN_STOCK (still IN_STOCK above it, OUT_OF_STOCK at 0). Defaults to 10.",
    example: 10,
    minimum: 0,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Low stock threshold must be a whole number' })
  @Min(0, { message: 'Low stock threshold cannot be negative' })
  lowStockThreshold?: number;

  @ApiPropertyOptional({
    description: 'Variant-level SKU. Must be unique across all variants.',
    example: 'THP-RJ-60',
    maxLength: 100,
  })
  //* sku IS A UNIQUE COLUMN — "" FROM A FORM MUST BECOME undefined OR THE
  //* SECOND VARIANT EVER SAVED WITH AN EMPTY SKU 409s (P2002)
  @Transform(({ value }) => emptyStringToUndefined(value))
  @IsOptional()
  @IsString({ message: 'SKU must be a valid text string' })
  @MaxLength(100, { message: 'SKU cannot exceed 100 characters' })
  sku?: string;

  @ApiPropertyOptional({
    description: 'EAN/UPC barcode for POS/warehouse scanning.',
    example: '8850123457',
    maxLength: 100,
  })
  @Transform(({ value }) => emptyStringToUndefined(value))
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
