import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  IsNumber,
  MaxLength,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type, Transform, plainToInstance } from 'class-transformer';
import {
  CategoryProductStatus,
  DiscountType,
  ProductType,
} from '../../../generated/prisma/enums';
import {
  tryParseJson,
  parseStringArrayInput,
  emptyStringToUndefined,
} from '../../../common/utils/json-transform.util';
import { IsLessThanOrEqualTo } from '../../../common/decorators/validation/is-less-than-or-equal-to.decorator';
import { UpdateProductVariantDto } from './update-product-variant.dto';
import {
  ProductDimensionsInputDto,
  ProductSeoMetadataInputDto,
} from './create-product.dto';

export class UpdateProductDto {
  // ─── Identity ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Product name in English. Must be unique. The URL slug is re-derived automatically if this changes.',
    example: 'Organic Arabica Coffee',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Product name must be a valid text string' })
  @MaxLength(255, { message: 'Product name cannot exceed 255 characters' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Product name in Thai',
    example: 'กาแฟอาราบิก้าออร์แกนิก',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Thai name must be a valid text string' })
  @MaxLength(255, { message: 'Thai name cannot exceed 255 characters' })
  nameTh?: string;

  @ApiPropertyOptional({
    description: 'Stock Keeping Unit. Must be unique.',
    example: 'COF-DRK-500',
    maxLength: 100,
  })
  //* sku/barcode ARE UNIQUE COLUMNS — "" FROM A FORM MUST BECOME undefined
  //* OR THE SECOND PRODUCT EVER SAVED WITH AN EMPTY VALUE 409s (P2002).
  //* SIDE EFFECT: A SKU CANNOT BE CLEARED VIA "" — IT IS LEFT UNTOUCHED.
  @Transform(({ value }) => emptyStringToUndefined(value))
  @IsOptional()
  @IsString({ message: 'SKU must be a valid text string' })
  @MaxLength(100, { message: 'SKU cannot exceed 100 characters' })
  sku?: string;

  @ApiPropertyOptional({
    description: 'EAN/UPC barcode for POS/warehouse scanning. Must be unique.',
    example: '8850123456',
    maxLength: 100,
  })
  @Transform(({ value }) => emptyStringToUndefined(value))
  @IsOptional()
  @IsString({ message: 'Barcode must be a valid text string' })
  @MaxLength(100, { message: 'Barcode cannot exceed 100 characters' })
  barcode?: string;

  // ─── Content ─────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Long-form description in English' })
  @IsOptional()
  @IsString({ message: 'Description must be a valid text string' })
  description?: string;

  @ApiPropertyOptional({ description: 'Long-form description in Thai' })
  @IsOptional()
  @IsString({ message: 'Thai description must be a valid text string' })
  descriptionTh?: string;

  @ApiPropertyOptional({
    description: 'Truncated summary for cards/listings',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Short description must be a valid text string' })
  @MaxLength(500, { message: 'Short description cannot exceed 500 characters' })
  shortDescription?: string;

  @ApiPropertyOptional({ description: 'Short summary in Thai', maxLength: 500 })
  @IsOptional()
  @IsString({ message: 'Thai short description must be a valid text string' })
  @MaxLength(500, {
    message: 'Thai short description cannot exceed 500 characters',
  })
  shortDescTh?: string;

  // ─── Configuration ───────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'SIMPLE (uses `quantity`) or VARIABLE (uses `variants`). Changing this does not itself create/remove variant rows — pair it with `variants` to actually convert a product.',
    enum: ProductType,
    enumName: 'ProductType',
    example: ProductType.SIMPLE,
  })
  @IsOptional()
  @IsEnum(ProductType, { message: 'Please select a valid product type' })
  type?: ProductType;

  @ApiPropertyOptional({
    description: 'Visibility/lifecycle status.',
    enum: CategoryProductStatus,
    enumName: 'CategoryProductStatus',
    example: CategoryProductStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(CategoryProductStatus, { message: 'Please select a valid status' })
  status?: CategoryProductStatus;

  @ApiPropertyOptional({
    description:
      'Schedules a future launch. The product is only publicly live once `status = ACTIVE` AND `publishedAt <= now()`.',
    example: '2026-08-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Published date must be a valid ISO 8601 date' })
  publishedAt?: string;

  @ApiPropertyOptional({
    description: 'Whether to promote this product in featured sections.',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true' || value === '1';
    return Boolean(value);
  })
  @IsBoolean({ message: 'isFeatured must be true or false' })
  isFeatured?: boolean;

  // ─── Pricing ─────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'MSRP / list price',
    example: 450.0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Base price must be a valid number' })
  @Min(0, { message: 'Base price cannot be negative' })
  basePrice?: number;

  @ApiPropertyOptional({
    description:
      'How `discountValue`/`salePrice` was configured — FIXED or PERCENTAGE.',
    enum: DiscountType,
    enumName: 'DiscountType',
    example: DiscountType.FIXED,
  })
  @IsOptional()
  @IsEnum(DiscountType, { message: 'Please select a valid discount type' })
  discountType?: DiscountType;

  @ApiPropertyOptional({
    description: 'The raw configured discount, paired with `discountType`.',
    example: 51.0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Discount value must be a valid number' })
  @Min(0, { message: 'Discount value cannot be negative' })
  discountValue?: number;

  @ApiPropertyOptional({
    description:
      'Final discounted price shown on the storefront. Must not exceed `basePrice`.',
    example: 399.0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Sale price must be a valid number' })
  @Min(0, { message: 'Sale price cannot be negative' })
  @IsLessThanOrEqualTo('basePrice', {
    message: 'Sale price cannot be greater than the base price',
  })
  salePrice?: number;

  @ApiPropertyOptional({
    description:
      'Internal cost basis for margin reporting. Admin/management use only.',
    example: 250.0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Cost price must be a valid number' })
  @Min(0, { message: 'Cost price cannot be negative' })
  costPrice?: number;

  // ─── Stock ───────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Stock count. Only meaningful when the product is (or becomes) SIMPLE — ignored/overwritten for VARIABLE products, whose stock comes from `variants`.',
    example: 150,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(0, { message: 'Quantity cannot be negative' })
  quantity?: number;

  // ─── Physical ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Weight in kilograms, used for shipping cost calculation.',
    example: 0.5,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Weight must be a valid number' })
  @Min(0, { message: 'Weight cannot be negative' })
  weight?: number;

  @ApiPropertyOptional({
    description:
      'Physical package dimensions. Send as a JSON object normally, or a JSON-encoded string when using multipart/form-data.',
    type: () => ProductDimensionsInputDto,
  })
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = tryParseJson(value);
    if (parsed === null || typeof parsed !== 'object') return parsed;
    return plainToInstance(ProductDimensionsInputDto, parsed);
  })
  @ValidateNested()
  dimensions?: ProductDimensionsInputDto;

  // ─── SEO & Tags ──────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'SEO metadata (EN + TH). Send as a JSON object normally, or a JSON-encoded string when using multipart/form-data.',
    type: () => ProductSeoMetadataInputDto,
  })
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = tryParseJson(value);
    if (parsed === null || typeof parsed !== 'object') return parsed;
    return plainToInstance(ProductSeoMetadataInputDto, parsed);
  })
  @ValidateNested()
  seoMetadata?: ProductSeoMetadataInputDto;

  @ApiPropertyOptional({
    description:
      'Free-form labels/keywords for filtering and search. Replaces the existing set.',
    type: [String],
    example: ['coffee', 'organic', 'beverage'],
  })
  @IsOptional()
  @Transform(({ value }) => parseStringArrayInput(value))
  @IsArray({ message: 'Tags must be an array' })
  @IsString({ each: true, message: 'Each tag must be a valid text string' })
  tags?: string[];

  // ─── Category ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'ID of the category this product belongs to.',
    example: 3,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Category ID must be a whole number' })
  @Min(1, { message: 'Category ID must be a valid positive integer' })
  categoryId?: number;

  // ─── Health & Compliance Labeling ────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Usage/dosage instructions in English' })
  @IsOptional()
  @IsString({ message: 'Dosage must be a valid text string' })
  dosage?: string;

  @ApiPropertyOptional({ description: 'Usage/dosage instructions in Thai' })
  @IsOptional()
  @IsString({ message: 'Thai dosage must be a valid text string' })
  dosageTh?: string;

  @ApiPropertyOptional({ description: 'Ingredients list in English' })
  @IsOptional()
  @IsString({ message: 'Ingredients must be a valid text string' })
  ingredients?: string;

  @ApiPropertyOptional({ description: 'Ingredients list in Thai' })
  @IsOptional()
  @IsString({ message: 'Thai ingredients must be a valid text string' })
  ingredientsTh?: string;

  @ApiPropertyOptional({ description: 'Marketed health benefits in English' })
  @IsOptional()
  @IsString({ message: 'Health benefits must be a valid text string' })
  healthBenefits?: string;

  @ApiPropertyOptional({ description: 'Marketed health benefits in Thai' })
  @IsOptional()
  @IsString({ message: 'Thai health benefits must be a valid text string' })
  healthBenefitsTh?: string;

  @ApiPropertyOptional({
    description: 'Safety warning/contraindications in English',
  })
  @IsOptional()
  @IsString({ message: 'Warning must be a valid text string' })
  warning?: string;

  @ApiPropertyOptional({
    description: 'Safety warning/contraindications in Thai',
  })
  @IsOptional()
  @IsString({ message: 'Thai warning must be a valid text string' })
  warningTh?: string;

  @ApiPropertyOptional({ description: 'Storage instructions in English' })
  @IsOptional()
  @IsString({ message: 'Storage instructions must be a valid text string' })
  storageInstructions?: string;

  @ApiPropertyOptional({ description: 'Storage instructions in Thai' })
  @IsOptional()
  @IsString({
    message: 'Thai storage instructions must be a valid text string',
  })
  storageInstructionsTh?: string;

  @ApiPropertyOptional({
    description: 'Country/region of origin',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Origin must be a valid text string' })
  @MaxLength(255, { message: 'Origin cannot exceed 255 characters' })
  origin?: string;

  @ApiPropertyOptional({
    description: 'Generic/common name shown on the product label',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Generic name must be a valid text string' })
  @MaxLength(255, { message: 'Generic name cannot exceed 255 characters' })
  genericName?: string;

  // ─── Variants ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Desired final set of variants, reconciled by `id`: entries WITH an `id` update that variant in place, entries WITHOUT an `id` are created, and existing variants missing from the list are removed. At least one variant must remain. Omit entirely to leave variants untouched. Send as a JSON array normally, or a JSON-encoded string when using multipart/form-data.',
    type: () => [UpdateProductVariantDto],
  })
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = tryParseJson(value);
    //* ACCEPT A LONE VARIANT OBJECT (SWAGGER UI SENDS `{...}` INSTEAD OF `[{...}]`
    //* FOR MULTIPART ARRAY FIELDS) BY WRAPPING IT INTO A SINGLE-ELEMENT ARRAY
    const normalized =
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? [parsed]
        : parsed;
    if (!Array.isArray(normalized)) return normalized;
    return plainToInstance(UpdateProductVariantDto, normalized);
  })
  @IsArray({ message: 'Variants must be an array' })
  @ArrayMinSize(1, { message: 'A product must keep at least one variant' })
  @ValidateNested({ each: true })
  variants?: UpdateProductVariantDto[];

  // ─── Images ──────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description:
      'New gallery image files to ADD to the existing gallery (up to 10). Existing images are only removed via `deleteImageIds`.',
  })
  @IsOptional()
  images?: Express.Multer.File[];

  @ApiPropertyOptional({
    description:
      'IDs of existing gallery images to remove from this product (DB rows and stored files). Send as a JSON array normally, or a JSON-encoded string when using multipart/form-data.',
    type: [Number],
    example: [4, 7],
  })
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = tryParseJson(value);
    return Array.isArray(parsed) ? parsed.map((id) => Number(id)) : parsed;
  })
  @IsArray({ message: 'deleteImageIds must be an array' })
  @IsInt({ each: true, message: 'Each image ID must be a whole number' })
  deleteImageIds?: number[];
}
