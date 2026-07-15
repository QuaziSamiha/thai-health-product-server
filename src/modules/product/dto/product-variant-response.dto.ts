import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { DiscountType, StockStatus } from '../../../generated/prisma/browser';
import { ProductVariantModel } from '../../../generated/prisma/models';
import { toAttributes, toPrice } from './product-shared.dto';

//* NOTE: `@nestjs/swagger`'s `OmitType`/`PickType` were tried here to
//* de-duplicate the admin/public variant DTOs below, but were reverted —
//* they generate a class whose synthetic constructor does NOT call the
//* base class's real constructor (verified empirically: `super(data)`
//* silently drops `data` and leaves every field unset). That's fine for
//* request DTOs instantiated via `plainToInstance`, but breaks these
//* response DTOs, which are built with `new Dto(rawPrismaRow)` and real
//* field-mapping logic in the constructor. Two independent classes below,
//* sharing only the pure `toPrice`/`toAttributes` helpers, is the correct
//* and actually-safe way to do this given that pattern.

//* ═══════════════════════════════════════════════════════════════════════
//* VARIANT — ADMIN. Full detail, includes cost/margin data and barcode.
//* NOTE: ProductVariant has no public `sid` in the current schema, so `id`
//* is the only identifier available — expose it even on the public variant
//* DTO below (unlike Product, which has `sid` specifically to avoid this).
//* ═══════════════════════════════════════════════════════════════════════

export class ProductVariantDto {
  @Expose()
  @ApiProperty({ description: 'Variant ID', example: 4 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Variant name in English',
    example: 'Organic Royal Jelly - 60 Capsules',
  })
  name!: string;

  @Expose()
  @ApiProperty({
    description: 'URL-friendly slug',
    example: 'organic-royal-jelly-60-capsules',
  })
  slug!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Long-form description in English' })
  description?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Truncated summary' })
  shortDescription?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Variant name in Thai' })
  nameTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Long-form description in Thai' })
  descriptionTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Short summary in Thai' })
  shortDescTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Variant-level SKU',
    example: 'THP-RJ-60',
  })
  sku?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'EAN/UPC barcode — admin/management only',
    example: '8850123457',
  })
  barcode?: string;

  @Expose()
  @ApiProperty({ description: 'Stock count for this variant', example: 50 })
  quantity!: number;

  @Expose()
  @ApiProperty({
    enum: StockStatus,
    enumName: 'StockStatus',
    description: 'Cached stock badge state',
    example: StockStatus.IN_STOCK,
  })
  stockStatus!: StockStatus;

  @Expose()
  @ApiProperty({
    description:
      "Stock count at/below which this variant's `stockStatus` becomes LOW_STOCK",
    example: 10,
  })
  lowStockThreshold!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Weight in kilograms',
    example: 0.2,
    type: 'number',
    format: 'float',
  })
  weight?: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Free-text size label',
    example: '60 Capsules',
  })
  size?: string;

  @Expose()
  @ApiProperty({
    description: 'Variant-specific list price',
    example: 1500.0,
    type: 'number',
    format: 'float',
  })
  basePrice!: number;

  @Expose()
  @ApiProperty({
    enum: DiscountType,
    enumName: 'DiscountType',
    description:
      'How `discountValue` is applied to derive `salePrice`. Defaults to PERCENTAGE when no discount is configured.',
    example: DiscountType.PERCENTAGE,
  })
  discountType!: DiscountType;

  @Expose()
  @ApiPropertyOptional({
    description:
      'The raw configured discount, paired with `discountType` — a currency amount when FIXED, or a percentage number when PERCENTAGE. Admin/management only; `salePrice` is the resolved value customers see.',
    example: 10,
    type: 'number',
    format: 'float',
  })
  discountValue?: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Final discounted price for this variant',
    example: 1350.0,
    type: 'number',
    format: 'float',
  })
  salePrice?: number;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Cost basis for margin reporting — admin/management only, never expose publicly',
    example: 900.0,
    type: 'number',
    format: 'float',
  })
  costPrice?: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Freeform attribute key/value pairs',
    example: { count: '60', potency: '1000mg' },
    type: 'object',
    additionalProperties: true,
  })
  attributes?: Record<string, unknown>;

  @Expose()
  @ApiProperty({
    description: 'Whether this variant is pre-selected on the PDP',
    example: true,
  })
  isDefault!: boolean;

  constructor(variant: Partial<ProductVariantModel>) {
    this.id = variant.id!;
    this.name = variant.name!;
    this.slug = variant.slug!;
    this.description = variant.description ?? undefined;
    this.shortDescription = variant.shortDescription ?? undefined;
    this.nameTh = variant.nameTh ?? undefined;
    this.descriptionTh = variant.descriptionTh ?? undefined;
    this.shortDescTh = variant.shortDescTh ?? undefined;
    this.sku = variant.sku ?? undefined;
    this.barcode = variant.barcode ?? undefined;
    this.quantity = variant.quantity!;
    this.stockStatus = variant.stockStatus!;
    this.lowStockThreshold = variant.lowStockThreshold!;
    this.weight = toPrice(variant.weight);
    this.size = variant.size ?? undefined;
    this.basePrice = Number(variant.basePrice);
    this.discountType = variant.discountType!;
    this.discountValue = toPrice(variant.discountValue);
    this.salePrice = toPrice(variant.salePrice);
    this.costPrice = toPrice(variant.costPrice);
    this.attributes = toAttributes(variant.attributes);
    this.isDefault = variant.isDefault!;
  }
}

//* VARIANT — PUBLIC. Excludes `barcode`, `discountType`, `discountValue`,
//* `costPrice`, and raw `quantity` (same rationale as the product-level
//* public DTO).
export class ProductVariantPublicDto {
  @Expose()
  @ApiProperty({ description: 'Variant ID', example: 4 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Variant name in English',
    example: 'Organic Royal Jelly - 60 Capsules',
  })
  name!: string;

  @Expose()
  @ApiProperty({
    description: 'URL-friendly slug',
    example: 'organic-royal-jelly-60-capsules',
  })
  slug!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Long-form description in English' })
  description?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Truncated summary' })
  shortDescription?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Variant name in Thai' })
  nameTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Long-form description in Thai' })
  descriptionTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Short summary in Thai' })
  shortDescTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Variant-level SKU',
    example: 'THP-RJ-60',
  })
  sku?: string;

  @Expose()
  @ApiProperty({
    enum: StockStatus,
    enumName: 'StockStatus',
    description: 'Public stock badge — exact counts are never exposed',
    example: StockStatus.IN_STOCK,
  })
  stockStatus!: StockStatus;

  @Expose()
  @ApiPropertyOptional({
    description: 'Weight in kilograms',
    example: 0.2,
    type: 'number',
    format: 'float',
  })
  weight?: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Free-text size label',
    example: '60 Capsules',
  })
  size?: string;

  @Expose()
  @ApiProperty({
    description: 'Variant-specific list price',
    example: 1500.0,
    type: 'number',
    format: 'float',
  })
  basePrice!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Final discounted price for this variant',
    example: 1350.0,
    type: 'number',
    format: 'float',
  })
  salePrice?: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Freeform attribute key/value pairs',
    example: { count: '60', potency: '1000mg' },
    type: 'object',
    additionalProperties: true,
  })
  attributes?: Record<string, unknown>;

  @Expose()
  @ApiProperty({
    description: 'Whether this variant is pre-selected on the PDP',
    example: true,
  })
  isDefault!: boolean;

  constructor(variant: Partial<ProductVariantModel>) {
    this.id = variant.id!;
    this.name = variant.name!;
    this.slug = variant.slug!;
    this.description = variant.description ?? undefined;
    this.shortDescription = variant.shortDescription ?? undefined;
    this.nameTh = variant.nameTh ?? undefined;
    this.descriptionTh = variant.descriptionTh ?? undefined;
    this.shortDescTh = variant.shortDescTh ?? undefined;
    this.sku = variant.sku ?? undefined;
    this.stockStatus = variant.stockStatus!;
    this.weight = toPrice(variant.weight);
    this.size = variant.size ?? undefined;
    this.basePrice = Number(variant.basePrice);
    this.salePrice = toPrice(variant.salePrice);
    this.attributes = toAttributes(variant.attributes);
    this.isDefault = variant.isDefault!;
  }
}
