import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { ComboSeoMetadataInputDto } from './create-combo-product.dto';
import { IsUniqueComboItems } from './unique-combo-items.validator';
import { IsSingleItemQuantitySufficient } from './single-item-quantity.validator';

//* PATCH SEMANTICS: EVERY FIELD IS OPTIONAL AND ONLY WHAT IS SENT IS WRITTEN,
//* SO AN ADMIN EDITING ONE FIELD CANNOT BLANK THE REST. THIS ROUTE IS ALSO
//* multipart/form-data (IMAGES UPLOAD ALONGSIDE), SO EVERY VALUE ARRIVES AS A
//* STRING AND NEEDS THE SAME trimString / blankNumberToUndefined /
//* parseBooleanInput / tryParseJson TREATMENT AS CreateComboProductDto.
//*
//* DELIBERATELY ABSENT — SERVER-DERIVED, NEVER CLIENT INPUT:
//*   totalPrice  (recomputed from `items`), slug (regenerated from `title`),
//*   availableQuantity / soldQuantity / stockStatus (DB TRIGGERS AND THE
//*   ORDER PATH), pricedAt (DB TRIGGER).
//* AN EARLIER VERSION OF THIS DTO ACCEPTED totalPrice, WHICH — GIVEN THE
//* combo_products_price_valid CHECK (combo_price <= total_price) — LET A
//* CLIENT RAISE totalPrice TO LEGITIMISE ANY comboPrice.
export class UpdateComboProductDto {
  // ─── Identity ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Display title in English. Must be unique. Changing it regenerates the slug.',
    maxLength: 255,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsNotEmpty({ message: 'Combo title cannot be empty' })
  @IsString({ message: 'Combo title must be a valid text string' })
  @MaxLength(255, { message: 'Combo title cannot exceed 255 characters' })
  title?: string;

  @ApiPropertyOptional({ description: 'Combo title in Thai.', maxLength: 255 })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Thai title must be a valid text string' })
  @MaxLength(255, { message: 'Thai title cannot exceed 255 characters' })
  titleTh?: string;

  @ApiPropertyOptional({
    description: 'SKU of the bundle itself. Must be unique across combos.',
    maxLength: 100,
  })
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsOptional()
  @IsString({ message: 'SKU must be a valid text string' })
  @MaxLength(100, { message: 'SKU cannot exceed 100 characters' })
  sku?: string;

  @ApiPropertyOptional({
    description: 'EAN/UPC barcode. Must be unique.',
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

  @ApiPropertyOptional({
    description:
      'The bundle offer price the customer pays. Must be greater than 0 and strictly less than the sum of the bundled items — see CreateComboProductDto.comboPrice.',
    minimum: 0.01,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Combo price must be a valid number' })
  //* SEE CreateComboProductDto.comboPrice FOR WHY THE FLOOR IS 0.01, NOT 0.
  @Min(0.01, { message: 'Combo price must be greater than 0' })
  comboPrice?: number;

  @ApiPropertyOptional({
    description: 'Landed cost of the bundle. Admin-only.',
    minimum: 0,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Cost price must be a valid number' })
  @Min(0, { message: 'Cost price cannot be negative' })
  costPrice?: number;

  // ─── Promotion Window ────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Promotion window start. Must include a UTC offset.',
    example: '2026-07-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Starts at must be a valid ISO date string' })
  @IsOffsetDateString()
  startsAt?: string;

  @ApiPropertyOptional({
    description: 'Promotion window end. Must include a UTC offset.',
    example: '2026-07-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Ends at must be a valid ISO date string' })
  @IsOffsetDateString()
  //* ONLY ORDERS THE PAIR WHEN BOTH ARRIVE IN THE SAME PATCH — A PATCH THAT
  //* MOVES ONLY startsAt IS STILL CAUGHT BY combo_products_window_valid.
  @IsAfter('startsAt', { message: 'Ends at must be after starts at' })
  endsAt?: string;

  @ApiPropertyOptional({
    description: 'Scheduled-publish gate. Must include a UTC offset.',
    example: '2026-07-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Published at must be a valid ISO date string' })
  @IsOffsetDateString()
  publishedAt?: string;

  // ─── State ───────────────────────────────────────────────────────────────────

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
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isFeatured must be true or false' })
  isFeatured?: boolean;

  @ApiPropertyOptional({
    description: 'Bundle count at or below which the combo reports LOW_STOCK.',
    minimum: 1,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Low stock threshold must be a whole number' })
  @Min(1, { message: 'Low stock threshold must be at least 1' })
  lowStockThreshold?: number;

  @ApiPropertyOptional({
    description:
      'How many bundles to put on sale. Must not exceed what current stock can assemble.',
    minimum: 1,
  })
  //* RE-CHECKED AGAINST LIVE STOCK ON EVERY PATCH, NOT ONLY AT CREATE: THE
  //* CEILING MOVES AS STOCK AND ITEMS CHANGE.
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Offered quantity must be a whole number' })
  @Min(1, { message: 'Offered quantity must be at least 1' })
  offeredQuantity?: number;

  // ─── SEO ─────────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    type: 'string',
    description:
      'metaTitle/metaDescription (EN + TH). Send as a JSON string when using multipart/form-data. Replaces the whole object.',
    example: '{"metaTitle":"Wellness Starter Bundle"}',
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

  @ApiPropertyOptional({
    type: 'string',
    description:
      'JSON array of bundled products/variants. Omit to leave the current items untouched; when sent, it REPLACES the entire list (max 50, no duplicate product/variant pairs).',
    example: '[{"productId":12,"quantity":1}]',
  })
  //* REPLACE-WHOLE-LIST RATHER THAN PER-ROW PATCHING: THE ADMIN UI EDITS THE
  //* BUNDLE AS ONE UNIT, AND A PARTIAL MERGE COULD LEAVE totalPrice AND THE
  //* DERIVED AVAILABILITY DESCRIBING A SET THAT WAS NEVER SUBMITTED.
  @IsOptional()
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
  @IsSingleItemQuantitySufficient()
  @ValidateNested({ each: true })
  items?: ComboItemDto[];

  // ─── Images ──────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    type: 'string',
    description:
      'JSON array of existing combo image IDs to remove, e.g. "[4,7]". Applied before the newly uploaded files are appended.',
    example: '[4,7]',
  })
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = tryParseJson(value);
    if (!Array.isArray(parsed)) return parsed;
    return parsed.map((id) => Number(id));
  })
  @IsArray({ message: 'Delete image IDs must be an array' })
  @IsInt({ each: true, message: 'Each image ID must be a whole number' })
  deleteImageIds?: number[];

  //* SWAGGER DOCUMENTATION ONLY — SEE THE NOTE ON CreateComboProductDto.images.
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description:
      'New gallery image files to append (up to 10, enforced by the route).',
  })
  @IsOptional()
  images?: Express.Multer.File[];
}
