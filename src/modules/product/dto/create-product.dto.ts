import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsIn,
  Min,
  IsNumber,
  MaxLength,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  ValidateIf,
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
} from '../../../common/utils/json-transform.util';
import { IsLessThanOrEqualTo } from '../../../common/decorators/validation/is-less-than-or-equal-to.decorator';
import { CreateProductVariantDto } from './create-product-variant.dto';

//* ═══════════════════════════════════════════════════════════════════════
//* NESTED INPUT SHAPES FOR THE JSONB COLUMNS — VALIDATED PROPERLY INSTEAD
//* OF ACCEPTING AN ARBITRARY BLOB. SAME FIELD SET AS THE RESPONSE-SIDE
//* ProductDimensionsDto / ProductSeoMetadataDto (dto/product-shared.dto.ts).
//* ═══════════════════════════════════════════════════════════════════════

export class ProductDimensionsInputDto {
  @ApiPropertyOptional({
    description: 'Length, in `unit`',
    example: 15.5,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Length must be a valid number' })
  @Min(0, { message: 'Length cannot be negative' })
  length?: number;

  @ApiPropertyOptional({
    description: 'Width, in `unit`',
    example: 10,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Width must be a valid number' })
  @Min(0, { message: 'Width cannot be negative' })
  width?: number;

  @ApiPropertyOptional({
    description: 'Height, in `unit`',
    example: 25,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Height must be a valid number' })
  @Min(0, { message: 'Height cannot be negative' })
  height?: number;

  @ApiPropertyOptional({
    description: 'Unit of measurement for length/width/height',
    example: 'cm',
    enum: ['cm', 'in'],
  })
  @IsOptional()
  @IsIn(['cm', 'in'], { message: 'Unit must be either "cm" or "in"' })
  unit?: string;
}

export class ProductSeoMetadataInputDto {
  @ApiPropertyOptional({
    description: 'SEO <title> tag in English',
    example: 'Organic Arabica Coffee | Thai Health Product',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Meta title must be a valid text string' })
  @MaxLength(255, { message: 'Meta title cannot exceed 255 characters' })
  metaTitle?: string;

  @ApiPropertyOptional({
    description: 'SEO <meta description> tag in English',
    example: 'Grown in Chiang Mai, roasted fresh weekly.',
  })
  @IsOptional()
  @IsString({ message: 'Meta description must be a valid text string' })
  metaDescription?: string;

  @ApiPropertyOptional({
    description: 'SEO <title> tag in Thai',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Thai meta title must be a valid text string' })
  @MaxLength(255, { message: 'Thai meta title cannot exceed 255 characters' })
  metaTitleTh?: string;

  @ApiPropertyOptional({ description: 'SEO <meta description> tag in Thai' })
  @IsOptional()
  @IsString({ message: 'Thai meta description must be a valid text string' })
  metaDescriptionTh?: string;
}

export class CreateProductDto {
  // ─── Identity ────────────────────────────────────────────────────────────────

  @ApiProperty({
    description:
      'Product name in English. Must be unique. The URL slug is derived from this automatically.',
    example: 'Organic Arabica Coffee',
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'Product name is required' })
  @IsString({ message: 'Product name must be a valid text string' })
  @MaxLength(255, { message: 'Product name cannot exceed 255 characters' })
  name!: string;

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
    description:
      'Stock Keeping Unit. Must be unique. Only meaningful for a SIMPLE product — variants carry their own SKU.',
    example: 'COF-DRK-500',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'SKU must be a valid text string' })
  @MaxLength(100, { message: 'SKU cannot exceed 100 characters' })
  sku?: string;

  @ApiPropertyOptional({
    description: 'EAN/UPC barcode for POS/warehouse scanning. Must be unique.',
    example: '8850123456',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Barcode must be a valid text string' })
  @MaxLength(100, { message: 'Barcode cannot exceed 100 characters' })
  barcode?: string;

  // ─── Content ─────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Long-form description in English',
    example: 'Rich, full-bodied coffee grown in the highlands of Chiang Mai.',
  })
  @IsOptional()
  @IsString({ message: 'Description must be a valid text string' })
  description?: string;

  @ApiPropertyOptional({ description: 'Long-form description in Thai' })
  @IsOptional()
  @IsString({ message: 'Thai description must be a valid text string' })
  descriptionTh?: string;

  @ApiPropertyOptional({
    description: 'Truncated summary for cards/listings',
    example: '100% Arabica, medium-dark roast, single origin.',
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
      'SIMPLE (standalone, uses `quantity`) or VARIABLE (has `variants`, each with its own stock/price). Defaults to VARIABLE — pass `type: SIMPLE` explicitly to create a standalone product with no variants.',
    enum: ProductType,
    enumName: 'ProductType',
    default: ProductType.VARIABLE,
    example: ProductType.VARIABLE,
  })
  @IsOptional()
  @IsEnum(ProductType, { message: 'Please select a valid product type' })
  type?: ProductType;

  @ApiPropertyOptional({
    description: 'Visibility/lifecycle status. Defaults to ACTIVE if omitted.',
    enum: CategoryProductStatus,
    enumName: 'CategoryProductStatus',
    default: CategoryProductStatus.ACTIVE,
    example: CategoryProductStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(CategoryProductStatus, { message: 'Please select a valid status' })
  status?: CategoryProductStatus;

  @ApiPropertyOptional({
    description:
      'Schedules a future launch. The product is only publicly live once `status = ACTIVE` AND `publishedAt <= now()`. Omit to leave unpublished, or set to a past/current timestamp to publish immediately.',
    example: '2026-08-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Published date must be a valid ISO 8601 date' })
  publishedAt?: string;

  @ApiPropertyOptional({
    description:
      'Whether to promote this product in featured sections. Defaults to false.',
    example: false,
    default: false,
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
    description:
      "MSRP / list price. Required for SIMPLE products; optional for VARIABLE products, where it falls back to the default variant's base price.",
    example: 450.0,
    minimum: 0,
  })
  //* PRICING LIVES ON THE VARIANTS FOR VARIABLE PRODUCTS — ONLY A SIMPLE
  //* PRODUCT MUST CARRY ITS OWN BASE PRICE. STILL VALIDATED WHEN PROVIDED.
  @ValidateIf(
    (dto: CreateProductDto) =>
      dto.type === ProductType.SIMPLE || dto.basePrice !== undefined,
  )
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
    description:
      'The raw configured discount, paired with `discountType` — a currency amount when FIXED, or a percentage number when PERCENTAGE.',
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
      'Stock count. Only meaningful when `type = SIMPLE` — VARIABLE products track stock per-variant instead. Defaults to 0.',
    example: 150,
    minimum: 0,
    default: 0,
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
    description: 'Free-form labels/keywords for filtering and search.',
    type: [String],
    example: ['coffee', 'organic', 'beverage'],
  })
  @IsOptional()
  @Transform(({ value }) => parseStringArrayInput(value))
  @IsArray({ message: 'Tags must be an array' })
  @IsString({ each: true, message: 'Each tag must be a valid text string' })
  tags?: string[];

  // ─── Category ────────────────────────────────────────────────────────────────

  @ApiProperty({
    description: 'ID of the category this product belongs to.',
    example: 3,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'Category ID must be a whole number' })
  @Min(1, { message: 'Category ID must be a valid positive integer' })
  categoryId!: number;

  // ─── Health & Compliance Labeling ────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Usage/dosage instructions in English',
    example: 'Take 1-2 capsules daily before breakfast.',
  })
  @IsOptional()
  @IsString({ message: 'Dosage must be a valid text string' })
  dosage?: string;

  @ApiPropertyOptional({ description: 'Usage/dosage instructions in Thai' })
  @IsOptional()
  @IsString({ message: 'Thai dosage must be a valid text string' })
  dosageTh?: string;

  @ApiPropertyOptional({
    description: 'Ingredients list in English',
    example:
      'Pure lyophilized Royal Jelly, Vegetable Cellulose (capsule), Vitamin E.',
  })
  @IsOptional()
  @IsString({ message: 'Ingredients must be a valid text string' })
  ingredients?: string;

  @ApiPropertyOptional({ description: 'Ingredients list in Thai' })
  @IsOptional()
  @IsString({ message: 'Thai ingredients must be a valid text string' })
  ingredientsTh?: string;

  @ApiPropertyOptional({
    description: 'Marketed health benefits in English',
    example:
      'Boosts energy, supports collagen production, and enhances immune defense.',
  })
  @IsOptional()
  @IsString({ message: 'Health benefits must be a valid text string' })
  healthBenefits?: string;

  @ApiPropertyOptional({ description: 'Marketed health benefits in Thai' })
  @IsOptional()
  @IsString({ message: 'Thai health benefits must be a valid text string' })
  healthBenefitsTh?: string;

  @ApiPropertyOptional({
    description: 'Safety warning/contraindications in English',
    example: 'Not suitable for children or people with asthma/bee allergies.',
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

  @ApiPropertyOptional({
    description: 'Storage instructions in English',
    example:
      'Store in a cool, dry place below 30°C. Keep away from direct sunlight.',
  })
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
    example: 'Chiang Mai, Thailand',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Origin must be a valid text string' })
  @MaxLength(255, { message: 'Origin cannot exceed 255 characters' })
  origin?: string;

  @ApiPropertyOptional({
    description: 'Generic/common name shown on the product label',
    example: 'Bee Milk Supplement',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Generic name must be a valid text string' })
  @MaxLength(255, { message: 'Generic name cannot exceed 255 characters' })
  genericName?: string;

  // ─── Variants ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Variant configurations (size/color/etc.). Required (at least one) unless `type` is explicitly set to SIMPLE — VARIABLE is the default `type`, and every VARIABLE product needs at least one variant. Send as a JSON array normally, or a JSON-encoded string when using multipart/form-data.',
    type: () => [CreateProductVariantDto],
  })
  @Transform(({ value }) => {
    const parsed = tryParseJson(value);
    //* ACCEPT A LONE VARIANT OBJECT (SWAGGER UI SENDS `{...}` INSTEAD OF `[{...}]`
    //* FOR MULTIPART ARRAY FIELDS) BY WRAPPING IT INTO A SINGLE-ELEMENT ARRAY
    const normalized =
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? [parsed]
        : parsed;
    if (!Array.isArray(normalized)) return normalized;
    return plainToInstance(CreateProductVariantDto, normalized);
  })
  @ValidateIf(
    (dto: CreateProductDto) =>
      dto.type === ProductType.VARIABLE || dto.type === undefined,
  )
  @IsArray({ message: 'Variants must be an array' })
  @ArrayMinSize(1, {
    message:
      'At least one variant is required unless `type` is explicitly set to SIMPLE',
  })
  @ValidateNested({ each: true })
  variants?: CreateProductVariantDto[];

  // ─── Images ──────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description:
      'Product gallery image files (up to 10). The first file is treated as the primary image.',
  })
  @IsOptional()
  images?: Express.Multer.File[];
}
