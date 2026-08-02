import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CategoryProductStatus } from '../../../generated/prisma/enums';
import { emptyStringToUndefined } from '../../../common/utils/json-transform.util';
import { IsAfter } from '../../../common/decorators/validation/is-after.decorator';
import { ComboItemDto } from './combo-item.dto';
import { IsUniqueComboItems } from './unique-combo-items.validator';

//* multipart/form-data (REQUIRED SO IMAGES CAN BE UPLOADED ALONGSIDE THE
//* COMBO) FLATTENS EVERY FIELD TO A STRING — ARRAYS/OBJECTS ARRIVE AS JSON
//* TEXT AND MUST BE PARSED BACK BEFORE VALIDATION RUNS.
function tryParseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

//* SHAPE OF ComboProduct.seoMetadata (A SINGLE JSON COLUMN — SEE combo-product.prisma).
//* VALIDATED AS A NESTED DTO SO A MALFORMED/OVERSIZED BLOB IS REJECTED AT THE
//* API BOUNDARY INSTEAD OF BEING WRITTEN THROUGH AS ARBITRARY JSON.
export class ComboSeoMetadataInputDto {
  @ApiPropertyOptional({
    description: 'SEO meta title in English.',
    example: 'Wellness Starter Bundle | Save 350 THB',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Meta title must be a valid text string' })
  @MaxLength(255, { message: 'Meta title cannot exceed 255 characters' })
  metaTitle?: string;

  @ApiPropertyOptional({
    description: 'SEO meta description in English.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Meta description must be a valid text string' })
  @MaxLength(500, { message: 'Meta description cannot exceed 500 characters' })
  metaDescription?: string;

  @ApiPropertyOptional({
    description: 'SEO meta title in Thai.',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Thai meta title must be a valid text string' })
  @MaxLength(255, { message: 'Thai meta title cannot exceed 255 characters' })
  metaTitleTh?: string;

  @ApiPropertyOptional({
    description: 'SEO meta description in Thai.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Thai meta description must be a valid text string' })
  @MaxLength(500, {
    message: 'Thai meta description cannot exceed 500 characters',
  })
  metaDescriptionTh?: string;
}

export class CreateComboProductDto {
  // ─── Identity ────────────────────────────────────────────────────────────────

  @ApiProperty({
    description: 'Display title of the combo in English. Must be unique.',
    example: 'Wellness Starter Bundle',
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'Combo title is required' })
  @IsString({ message: 'Combo title must be a valid text string' })
  @MaxLength(255, { message: 'Combo title cannot exceed 255 characters' })
  title!: string;

  @ApiPropertyOptional({
    description: 'Combo title in Thai.',
    example: 'ชุดเริ่มต้นสุขภาพดี',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Thai title must be a valid text string' })
  @MaxLength(255, { message: 'Thai title cannot exceed 255 characters' })
  titleTh?: string;

  @ApiPropertyOptional({
    description:
      "Stock Keeping Unit for the bundle as its own sellable unit — not derived from its items' SKUs. Must be unique across combos.",
    example: 'CMB-WELL-01',
    maxLength: 100,
  })
  //* sku/barcode ARE UNIQUE COLUMNS — "" FROM A FORM MUST BECOME undefined
  //* OR THE SECOND COMBO EVER SAVED WITH AN EMPTY VALUE 409s (P2002)
  @Transform(({ value }) => emptyStringToUndefined(value))
  @IsOptional()
  @IsString({ message: 'SKU must be a valid text string' })
  @MaxLength(100, { message: 'SKU cannot exceed 100 characters' })
  sku?: string;

  @ApiPropertyOptional({
    description: 'EAN/UPC barcode for POS/warehouse scanning. Must be unique.',
    example: '8850001234567',
    maxLength: 100,
  })
  @Transform(({ value }) => emptyStringToUndefined(value))
  @IsOptional()
  @IsString({ message: 'Barcode must be a valid text string' })
  @MaxLength(100, { message: 'Barcode cannot exceed 100 characters' })
  barcode?: string;

  // ─── Content ─────────────────────────────────────────────────────────────────

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

  @ApiPropertyOptional({ description: 'Long-form description in English.' })
  @IsOptional()
  @IsString({ message: 'Description must be a valid text string' })
  description?: string;

  @ApiPropertyOptional({ description: 'Long-form description in Thai.' })
  @IsOptional()
  @IsString({ message: 'Thai description must be a valid text string' })
  descriptionTh?: string;

  // ─── Pricing ─────────────────────────────────────────────────────────────────
  //* totalPrice IS DELIBERATELY NOT CLIENT-SETTABLE HERE — IT'S THE SUM OF THE
  //* BUNDLED items' unitPrice * quantity, COMPUTED BY THE SERVICE LAYER SO IT
  //* CAN NEVER DRIFT FROM WHAT'S ACTUALLY IN THE COMBO.

  @ApiProperty({
    description: 'The bundle offer price the customer pays.',
    example: 1499.0,
    minimum: 0,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Combo price must be a valid number' })
  @Min(0, { message: 'Combo price cannot be negative' })
  comboPrice!: number;

  @ApiPropertyOptional({
    description:
      'Landed cost of the bundle, for margin reporting against `comboPrice`. Entered rather than summed from the items, since a bundle carries its own packaging/assembly cost. Admin-only — never returned on public routes.',
    example: 900.0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Cost price must be a valid number' })
  @Min(0, { message: 'Cost price cannot be negative' })
  costPrice?: number;

  // ─── Promotion Window ────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Promotion window start.',
    example: '2026-07-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Starts at must be a valid ISO date string' })
  startsAt?: string;

  @ApiPropertyOptional({
    description: 'Promotion window end.',
    example: '2026-07-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Ends at must be a valid ISO date string' })
  @IsAfter('startsAt', { message: 'Ends at must be after starts at' })
  endsAt?: string;

  // ─── State ───────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Visibility status of the combo. Defaults to DRAFT.',
    enum: CategoryProductStatus,
    default: CategoryProductStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(CategoryProductStatus, { message: 'Please select a valid status' })
  status?: CategoryProductStatus;

  @ApiPropertyOptional({
    description: 'Whether to highlight this combo in featured sections.',
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

  // ─── SEO ─────────────────────────────────────────────────────────────────────
  //* STORED AS ONE JSON COLUMN (seoMetadata) ON ComboProduct — UNLIKE Category,
  //* THERE ARE NO SEPARATE metaTitle/metaDescription COLUMNS TO MAP ONTO.

  @ApiPropertyOptional({
    type: 'string',
    example: '{"metaTitle":"Wellness Starter Bundle | Save 350 THB"}',
    description:
      'metaTitle/metaDescription (EN + TH). Send as a JSON string when using multipart/form-data.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = tryParseJson(value);
    if (parsed === null || typeof parsed !== 'object') return parsed;
    return plainToInstance(ComboSeoMetadataInputDto, parsed);
  })
  @ValidateNested()
  seoMetadata?: ComboSeoMetadataInputDto;

  // ─── Items ───────────────────────────────────────────────────────────────────

  @ApiProperty({
    type: 'string',
    description:
      'JSON array of the products/variants this combo bundles (max 50, no duplicate product/variant pairs). Stringify when using multipart/form-data.',
    example:
      '[{"productId":12,"quantity":1},{"productId":27,"variantId":104,"quantity":2}]',
  })
  @Transform(({ value }) => {
    const parsed = tryParseJson(value);
    if (!Array.isArray(parsed)) return parsed;
    return plainToInstance(ComboItemDto, parsed);
  })
  @IsArray({ message: 'Items must be an array' })
  @ArrayMinSize(1, { message: 'A combo must contain at least one product' })
  @ArrayMaxSize(50, { message: 'A combo cannot contain more than 50 items' })
  @IsUniqueComboItems({
    message:
      'Each product/variant combination can only be bundled once per combo',
  })
  @ValidateNested({ each: true })
  items!: ComboItemDto[];

  // ─── Images ──────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Combo gallery image files (up to 10).',
  })
  @IsOptional()
  images?: Express.Multer.File[];
}
