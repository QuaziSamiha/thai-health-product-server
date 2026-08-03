import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CategoryProductStatus } from '../../../generated/prisma/enums';
import {
  blankNumberToUndefined,
  emptyStringToUndefined,
  parseBooleanInput,
  trimString,
  tryParseJson,
} from '../../../common/utils/json-transform.util';
import { IsAfter } from '../../../common/decorators/validation/is-after.decorator';
import { IsOffsetDateString } from '../../../common/decorators/validation/is-offset-date-string.decorator';
import { ComboItemDto } from './combo-item.dto';
import { IsUniqueComboItems } from './unique-combo-items.validator';

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
  //* TRIMMED BEFORE VALIDATION SO @IsNotEmpty REJECTS "   " — WITHOUT THIS A
  //* WHITESPACE-ONLY TITLE PASSES AND generateSlug() PRODUCES AN EMPTY SLUG.
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Combo title is required' })
  @IsString({ message: 'Combo title must be a valid text string' })
  @MaxLength(255, { message: 'Combo title cannot exceed 255 characters' })
  title!: string;

  @ApiPropertyOptional({
    description: 'Combo title in Thai.',
    example: 'ชุดเริ่มต้นสุขภาพดี',
    maxLength: 255,
  })
  @Transform(({ value }) => trimString(value))
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
  //* OR THE SECOND COMBO EVER SAVED WITH AN EMPTY VALUE 409s (P2002).
  //* TRIMMED FIRST, SO "CMB-01 " AND "CMB-01" CANNOT BECOME TWO ROWS AND SO
  //* A WHITESPACE-ONLY ENTRY COLLAPSES TO undefined RATHER THAN "   ".
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsOptional()
  @IsString({ message: 'SKU must be a valid text string' })
  @MaxLength(100, { message: 'SKU cannot exceed 100 characters' })
  sku?: string;

  @ApiPropertyOptional({
    description: 'EAN/UPC barcode for POS/warehouse scanning. Must be unique.',
    example: '8850001234567',
    maxLength: 100,
  })
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsOptional()
  @IsString({ message: 'Barcode must be a valid text string' })
  @MaxLength(100, { message: 'Barcode cannot exceed 100 characters' })
  barcode?: string;

  // ─── Content ─────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Short summary for cards/listings.',
    maxLength: 500,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Short description must be a valid text string' })
  @MaxLength(500, { message: 'Short description cannot exceed 500 characters' })
  shortDescription?: string;

  @ApiPropertyOptional({
    description: 'Short summary in Thai.',
    maxLength: 500,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Thai short description must be a valid text string' })
  @MaxLength(500, {
    message: 'Thai short description cannot exceed 500 characters',
  })
  shortDescTh?: string;

  @ApiPropertyOptional({ description: 'Long-form description in English.' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Description must be a valid text string' })
  description?: string;

  @ApiPropertyOptional({ description: 'Long-form description in Thai.' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Thai description must be a valid text string' })
  descriptionTh?: string;

  // ─── Pricing ─────────────────────────────────────────────────────────────────
  //* totalPrice IS DELIBERATELY NOT CLIENT-SETTABLE HERE — IT'S THE SUM OF THE
  //* BUNDLED items' unitPrice * quantity, COMPUTED BY THE SERVICE LAYER SO IT
  //* CAN NEVER DRIFT FROM WHAT'S ACTUALLY IN THE COMBO.

  @ApiProperty({
    description:
      'The bundle offer price the customer pays. Must be greater than 0 and strictly less than the sum of the bundled items (the latter is checked in ComboProductService, since totalPrice is derived from `items`).',
    example: 1499.0,
    minimum: 0.01,
  })
  //* A multipart FORM SENDS "" FOR AN UNTOUCHED NUMBER INPUT, AND @Type RUNS
  //* BEFORE @Transform — SO WITHOUT THIS GUARD THE FIELD ARRIVES AS
  //* Number("") === 0 AND A COMBO IS SILENTLY CREATED FOR FREE. TURNING IT
  //* INTO undefined MAKES @IsNumber REPORT THE MISSING PRICE INSTEAD.
  @Transform(blankNumberToUndefined)
  @Type(() => Number)
  @IsNumber({}, { message: 'Combo price must be a valid number' })
  //* 0.01 RATHER THAN @IsPositive — comboPrice IS Decimal(12,2), SO ANYTHING
  //* BELOW ONE SATANG ROUNDS TO 0.00 ON THE WAY INTO THE COLUMN AND WOULD
  //* SNEAK A FREE COMBO PAST A BARE "> 0" CHECK.
  @Min(0.01, { message: 'Combo price must be greater than 0' })
  comboPrice!: number;

  @ApiPropertyOptional({
    description:
      'Landed cost of the bundle, for margin reporting against `comboPrice`. Entered rather than summed from the items, since a bundle carries its own packaging/assembly cost. Admin-only — never returned on public routes.',
    example: 900.0,
    minimum: 0,
  })
  //* SAME BLANK-INPUT GUARD AS comboPrice — HERE THE CONSEQUENCE IS A STORED
  //* COST OF 0 (I.E. A REPORTED 100% MARGIN) INSTEAD OF AN HONEST NULL.
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Cost price must be a valid number' })
  @Min(0, { message: 'Cost price cannot be negative' })
  costPrice?: number;

  // ─── Promotion Window ────────────────────────────────────────────────────────

  //* THE OFFSET IS MANDATORY ON BOTH ENDS: THE COLUMNS ARE @db.Timestamptz(3)
  //* AND THE SERVICE CALLS new Date(...), WHICH READS A ZONE-LESS STRING AS
  //* *SERVER LOCAL TIME* — SO "MIDNIGHT" WOULD MEAN A DIFFERENT INSTANT
  //* DEPENDING ON WHERE THE API RUNS. @IsAfter THEN ORDERS THE PAIR, MIRRORING
  //* THE combo_products_window_valid CHECK CONSTRAINT.
  @ApiPropertyOptional({
    description:
      'Promotion window start. Must include a UTC offset (`Z` or `+07:00`).',
    example: '2026-07-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Starts at must be a valid ISO date string' })
  @IsOffsetDateString()
  startsAt?: string;

  @ApiPropertyOptional({
    description:
      'Promotion window end. Must include a UTC offset (`Z` or `+07:00`).',
    example: '2026-07-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Ends at must be a valid ISO date string' })
  @IsOffsetDateString()
  @IsAfter('startsAt', { message: 'Ends at must be after starts at' })
  endsAt?: string;

  @ApiPropertyOptional({
    description:
      'Scheduled-publish gate. Omit to publish immediately when `status` is ACTIVE; set a future timestamp to schedule the launch. Must include a UTC offset.',
    example: '2026-07-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Published at must be a valid ISO date string' })
  @IsOffsetDateString()
  publishedAt?: string;

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
  //* multipart HAS NO BOOLEAN TYPE. THE SHARED HELPER ACCEPTS true/1/on/yes
  //* AND THEIR NEGATIVES, AND DELIBERATELY PASSES ANYTHING ELSE THROUGH SO
  //* @IsBoolean CAN REJECT IT — THE PREVIOUS INLINE VERSION COERCED EVERY
  //* UNRECOGNISED VALUE TO false, WHICH MADE @IsBoolean UNREACHABLE AND TURNED
  //* AN HTML CHECKBOX ("on") INTO A SILENT "not featured".
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isFeatured must be true or false' })
  isFeatured?: boolean;

  @ApiPropertyOptional({
    description:
      'Bundle count at or below which the combo reports LOW_STOCK, down to 1. Defaults to 10.',
    example: 10,
    minimum: 1,
    default: 10,
  })
  //* NOT A STOCK COUNT — THE COMBO'S OWN `quantity` IS DERIVED BY DB TRIGGERS
  //* AND IS NEVER CLIENT INPUT. THIS ONLY TUNES WHERE LOW_STOCK BEGINS.
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Low stock threshold must be a whole number' })
  @Min(1, { message: 'Low stock threshold must be at least 1' })
  lowStockThreshold?: number;

  @ApiPropertyOptional({
    description:
      'How many bundles to put on sale. Must not exceed what current stock can assemble — the scarcest bundled item sets that ceiling. Omit to sell everything stock allows.',
    example: 2,
    minimum: 1,
  })
  //* THE ONLY ADMIN-SET AVAILABILITY FIELD. THE COMBO'S `quantity` IS DERIVED
  //* BY DB TRIGGERS AND IS THE *CEILING*; THIS IS THE ADMIN'S CAP UNDERNEATH
  //* IT. THE <= CHECK LIVES IN ComboProductService BECAUSE IT COMPARES AGAINST
  //* LIVE STOCK, WHICH A DTO CANNOT SEE.
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Combo quantity must be a whole number' })
  @Min(1, { message: 'Combo quantity must be at least 1' })
  offeredQuantity?: number;

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

  //* SWAGGER DOCUMENTATION ONLY — FILES NEVER REACH THIS DTO. THEY ARE PULLED
  //* OFF THE REQUEST BY @UploadedFiles() IN THE CONTROLLER, AND THE 10-FILE CAP
  //* IS ENFORCED THERE BY FilesInterceptor('images', 10), NOT BY ANY VALIDATOR
  //* HERE. DON'T ADD @IsArray/@ArrayMaxSize — THEY WOULD NEVER RUN.
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Combo gallery image files (up to 10, enforced by the route).',
  })
  @IsOptional()
  images?: Express.Multer.File[];
}
