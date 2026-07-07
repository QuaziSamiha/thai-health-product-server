import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  ProductType,
  DiscountType,
  StockStatus,
  CategoryProductStatus,
} from '../../../generated/prisma/browser';
import {
  ProductModel,
  ProductImageModel,
  ProductVariantModel,
} from '../../../generated/prisma/models';
import {
  MinifiedUser,
  UserMinifiedResponseDto,
} from '../../user/dto/user-response.dto';
import {
  ProductCategoryMinifiedDto,
  ProductCategoryInput,
  ProductDimensionsDto,
  ProductSeoMetadataDto,
  toDimensionsDto,
  toSeoMetadataDto,
  toPrice,
  toAbsoluteUrl,
} from './product-shared.dto';
import { ProductImageDto } from './product-image-response.dto';
import {
  ProductVariantDto,
  ProductVariantPublicDto,
} from './product-variant-response.dto';

export { UserMinifiedResponseDto };
export type { MinifiedUser };
export { ProductCategoryMinifiedDto } from './product-shared.dto';
export { ProductImageDto } from './product-image-response.dto';
export {
  ProductVariantDto,
  ProductVariantPublicDto,
} from './product-variant-response.dto';

//* NOTE: `@nestjs/swagger`'s `OmitType` was tried for `ProductResponsePublicDto`
//* to de-duplicate the admin/public fields below, but was reverted — it
//* generates a class whose synthetic constructor does NOT call the base
//* class's real constructor (verified empirically), so `super(product)`
//* would silently drop the data and leave every field unset. Two
//* independent classes, sharing only the pure helpers from
//* `product-shared.dto.ts`, is the correct and actually-safe approach given
//* that these are response DTOs built with `new Dto(rawPrismaRow)` and real
//* field-mapping logic, not request DTOs instantiated via `plainToInstance`.

//* ═══════════════════════════════════════════════════════════════════════
//* ADMIN RESPONSE — full detail for dashboard/management use. Every field
//* on the model is present, including cost/margin data and the full audit
//* trail. Never return this DTO from a public/unauthenticated route.
//* ═══════════════════════════════════════════════════════════════════════

export class ProductResponseDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Public-facing UUID, safe to expose in URLs and API responses',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  sid!: string;

  @Expose()
  @ApiProperty({
    description: 'Product name in English',
    example: 'Organic Arabica Coffee',
  })
  name!: string;

  @Expose()
  @ApiProperty({
    description: 'URL-friendly slug, derived from `name`',
    example: 'organic-arabica-coffee',
  })
  slug!: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Stock Keeping Unit — set for SIMPLE products only',
    example: 'COF-DRK-500',
  })
  sku?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'EAN/UPC barcode for POS/warehouse scanning',
    example: '8850123456',
  })
  barcode?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Long-form description in English',
    example: 'Rich, full-bodied coffee grown in the highlands of Chiang Mai.',
  })
  description?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Truncated summary for cards/listings',
    example: '100% Arabica, medium-dark roast, single origin.',
  })
  shortDescription?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Product name in Thai',
    example: 'กาแฟอาราบิก้าออร์แกนิก',
  })
  nameTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Long-form description in Thai' })
  descriptionTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Short summary in Thai' })
  shortDescTh?: string;

  @Expose()
  @ApiProperty({
    enum: ProductType,
    enumName: 'ProductType',
    description: 'SIMPLE / VARIABLE / COMBO discriminator',
    example: ProductType.SIMPLE,
  })
  type!: ProductType;

  @Expose()
  @ApiProperty({
    enum: CategoryProductStatus,
    enumName: 'CategoryProductStatus',
    description: 'Visibility/lifecycle status of the product',
    example: CategoryProductStatus.ACTIVE,
  })
  status!: CategoryProductStatus;

  @Expose()
  @ApiProperty({
    description: 'Whether this product is promoted in featured sections',
    example: false,
  })
  isFeatured!: boolean;

  @Expose()
  @ApiProperty({
    description:
      'Denormalized cache of `variants.length > 0` — lets the UI branch between "Add to Cart" and "Select Options" without an extra query',
    example: false,
  })
  hasVariants!: boolean;

  @Expose()
  @ApiProperty({
    description: 'MSRP / list price',
    example: 450.0,
    type: 'number',
    format: 'float',
  })
  basePrice!: number;

  @Expose()
  @ApiPropertyOptional({
    enum: DiscountType,
    enumName: 'DiscountType',
    description:
      'How `discountValue`/`salePrice` was configured — FIXED or PERCENTAGE',
    example: DiscountType.FIXED,
  })
  discountType?: DiscountType;

  @Expose()
  @ApiPropertyOptional({
    description:
      'The raw configured discount, paired with `discountType` — a currency amount when FIXED, or a percentage number when PERCENTAGE. Admin/management only; `salePrice` is the resolved value customers see.',
    example: 51.0,
    type: 'number',
    format: 'float',
  })
  discountValue?: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Final discounted price shown on the storefront',
    example: 399.0,
    type: 'number',
    format: 'float',
  })
  salePrice?: number;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Internal cost basis for margin reporting — admin/management only, never expose publicly',
    example: 250.0,
    type: 'number',
    format: 'float',
  })
  costPrice?: number;

  @Expose()
  @ApiProperty({
    description: 'Stock count — authoritative only when `type = SIMPLE`',
    example: 150,
  })
  quantity!: number;

  @Expose()
  @ApiProperty({
    description:
      'Denormalized cache — sum of all variant stock, authoritative when `type = VARIABLE`',
    example: 0,
  })
  totalStock!: number;

  @Expose()
  @ApiProperty({
    enum: StockStatus,
    enumName: 'StockStatus',
    description: 'Cached stock badge state',
    example: StockStatus.IN_STOCK,
  })
  stockStatus!: StockStatus;

  @Expose()
  @ApiPropertyOptional({
    description: 'Weight in kilograms, used for shipping cost calculation',
    example: 0.5,
    type: 'number',
    format: 'float',
  })
  weight?: number;

  @Expose()
  @ApiPropertyOptional({ type: () => ProductDimensionsDto })
  dimensions?: ProductDimensionsDto;

  @Expose()
  @ApiPropertyOptional({ type: () => ProductSeoMetadataDto })
  seoMetadata?: ProductSeoMetadataDto;

  @Expose()
  @ApiProperty({
    description: 'Free-form labels/keywords',
    example: ['coffee', 'organic', 'beverage'],
    type: [String],
  })
  tags!: string[];

  @Expose()
  @ApiPropertyOptional({
    description: 'Usage/dosage instructions in English',
    example: 'Take 1-2 capsules daily before breakfast.',
  })
  dosage?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Usage/dosage instructions in Thai' })
  dosageTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Ingredients list in English',
    example:
      'Pure lyophilized Royal Jelly, Vegetable Cellulose (capsule), Vitamin E.',
  })
  ingredients?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Ingredients list in Thai' })
  ingredientsTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Marketed health benefits in English',
    example:
      'Boosts energy, supports collagen production, and enhances immune defense.',
  })
  healthBenefits?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Marketed health benefits in Thai' })
  healthBenefitsTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Safety warning/contraindications in English',
    example: 'Not suitable for children or people with asthma/bee allergies.',
  })
  warning?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Safety warning/contraindications in Thai',
  })
  warningTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Storage instructions in English',
    example:
      'Store in a cool, dry place below 30°C. Keep away from direct sunlight.',
  })
  storageInstructions?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Storage instructions in Thai' })
  storageInstructionsTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Country/region of origin',
    example: 'Chiang Mai, Thailand',
  })
  origin?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Generic/common name shown on the product label',
    example: 'Bee Milk Supplement',
  })
  genericName?: string;

  // @Expose()
  // @ApiProperty({ description: 'Owning category ID (raw FK)', example: 3 })
  // categoryId!: number;

  @Expose()
  @ApiPropertyOptional({ type: () => ProductCategoryMinifiedDto })
  category?: ProductCategoryMinifiedDto;

  @Expose()
  @ApiProperty({
    type: () => [ProductImageDto],
    description: 'Product gallery images (product-level and variant-level)',
  })
  images!: ProductImageDto[];

  @Expose()
  @ApiProperty({
    type: () => [ProductVariantDto],
    description:
      'Variant configurations (size/color/etc.) — empty array for SIMPLE products',
  })
  variants!: ProductVariantDto[];

  @Expose()
  @ApiProperty({ description: 'ISO timestamp when the record was created' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp of the last update' })
  updatedAt!: Date;

  @Expose()
  @ApiPropertyOptional({
    description: 'Soft-delete marker — non-null once the product is retired',
  })
  deletedAt?: Date;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Scheduled-publish gate. A product is only publicly live once `status = ACTIVE` AND `publishedAt <= now()`',
  })
  publishedAt?: Date;

  // @Expose()
  // @ApiPropertyOptional({
  //   description: 'Actor ID who created the row',
  //   example: 12,
  // })
  // createdBy?: number;

  @Expose()
  @ApiPropertyOptional({ type: () => UserMinifiedResponseDto })
  createdByUser?: UserMinifiedResponseDto;

  @Expose()
  @ApiPropertyOptional({
    description: 'Actor ID who last modified the row',
    example: 12,
  })
  updatedBy?: number;

  @Expose()
  @ApiPropertyOptional({ type: () => UserMinifiedResponseDto })
  updatedByUser?: UserMinifiedResponseDto;

  @Expose()
  @ApiPropertyOptional({
    description: 'Actor ID who soft-deleted the row',
    example: 5,
  })
  deletedBy?: number;

  @Expose()
  @ApiPropertyOptional({ type: () => UserMinifiedResponseDto })
  deletedByUser?: UserMinifiedResponseDto;

  constructor(
    product: Partial<ProductModel> & {
      category?: ProductCategoryInput;
      images?: Partial<ProductImageModel>[] | null;
      variants?: Partial<ProductVariantModel>[] | null;
      createdByUser?: MinifiedUser | null;
      updatedByUser?: MinifiedUser | null;
      deletedByUser?: MinifiedUser | null;
    },
    baseUrl?: string,
  ) {
    this.id = product.id!;
    this.sid = product.sid!;
    this.name = product.name!;
    this.slug = product.slug!;
    this.sku = product.sku ?? undefined;
    this.barcode = product.barcode ?? undefined;
    this.description = product.description ?? undefined;
    this.shortDescription = product.shortDescription ?? undefined;
    this.nameTh = product.nameTh ?? undefined;
    this.descriptionTh = product.descriptionTh ?? undefined;
    this.shortDescTh = product.shortDescTh ?? undefined;
    this.type = product.type!;
    this.status = product.status!;
    this.isFeatured = product.isFeatured!;
    this.hasVariants = product.hasVariants!;
    this.basePrice = Number(product.basePrice);
    this.discountType = product.discountType ?? undefined;
    this.discountValue = toPrice(product.discountValue);
    this.salePrice = toPrice(product.salePrice);
    this.costPrice = toPrice(product.costPrice);
    this.quantity = product.quantity!;
    this.totalStock = product.totalStock!;
    this.stockStatus = product.stockStatus!;
    this.weight = toPrice(product.weight);
    this.dimensions = toDimensionsDto(product.dimensions);
    this.seoMetadata = toSeoMetadataDto(product.seoMetadata);
    this.tags = product.tags ?? [];
    this.dosage = product.dosage ?? undefined;
    this.dosageTh = product.dosageTh ?? undefined;
    this.ingredients = product.ingredients ?? undefined;
    this.ingredientsTh = product.ingredientsTh ?? undefined;
    this.healthBenefits = product.healthBenefits ?? undefined;
    this.healthBenefitsTh = product.healthBenefitsTh ?? undefined;
    this.warning = product.warning ?? undefined;
    this.warningTh = product.warningTh ?? undefined;
    this.storageInstructions = product.storageInstructions ?? undefined;
    this.storageInstructionsTh = product.storageInstructionsTh ?? undefined;
    this.origin = product.origin ?? undefined;
    this.genericName = product.genericName ?? undefined;
    // this.categoryId = product.categoryId!;
    this.category = product.category
      ? new ProductCategoryMinifiedDto(product.category)
      : undefined;
    this.images = (product.images ?? []).map(
      (img) => new ProductImageDto(img, baseUrl),
    );
    this.variants = (product.variants ?? []).map(
      (v) => new ProductVariantDto(v),
    );
    this.createdAt = product.createdAt!;
    this.updatedAt = product.updatedAt!;
    this.deletedAt = product.deletedAt ?? undefined;
    this.publishedAt = product.publishedAt ?? undefined;
    // this.createdBy = product.createdBy ?? undefined;
    this.createdByUser = product.createdByUser
      ? new UserMinifiedResponseDto(product.createdByUser)
      : undefined;
    this.updatedBy = product.updatedBy ?? undefined;
    this.updatedByUser = product.updatedByUser
      ? new UserMinifiedResponseDto(product.updatedByUser)
      : undefined;
    this.deletedBy = product.deletedBy ?? undefined;
    this.deletedByUser = product.deletedByUser
      ? new UserMinifiedResponseDto(product.deletedByUser)
      : undefined;
  }
}

//* ═══════════════════════════════════════════════════════════════════════
//* PUBLIC RESPONSE — public storefront/PDP view.
//* Deliberately excludes: `barcode` (internal logistics),
//* `status`/`categoryId` (internal workflow/raw FK),
//* `discountType`/`discountValue`/`costPrice` (pricing internals & margin
//* data), exact `quantity`/`totalStock` counts (don't leak inventory levels
//* to competitors/scrapers — `stockStatus` is the public-safe badge),
//* `createdAt`/`updatedAt`/`deletedAt`, and the entire audit trail
//* (`createdBy`/`updatedBy`/`deletedBy` + user snapshots) — never expose
//* staff/admin identity on a public endpoint. Health/compliance labeling
//* fields (dosage, ingredients, warnings, etc.) ARE included — customers
//* need this information to make a purchase decision.
//* ═══════════════════════════════════════════════════════════════════════

export class ProductResponsePublicDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Public-facing UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  sid!: string;

  @Expose()
  @ApiProperty({
    description: 'Product name in English',
    example: 'Organic Arabica Coffee',
  })
  name!: string;

  @Expose()
  @ApiProperty({
    description: 'URL-friendly slug',
    example: 'organic-arabica-coffee',
  })
  slug!: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Stock Keeping Unit',
    example: 'COF-DRK-500',
  })
  sku?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Long-form description in English' })
  description?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Truncated summary for cards/listings' })
  shortDescription?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Product name in Thai',
    example: 'กาแฟอาราบิก้าออร์แกนิก',
  })
  nameTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Long-form description in Thai' })
  descriptionTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Short summary in Thai' })
  shortDescTh?: string;

  @Expose()
  @ApiProperty({
    enum: ProductType,
    enumName: 'ProductType',
    description: 'SIMPLE / VARIABLE / COMBO discriminator',
    example: ProductType.SIMPLE,
  })
  type!: ProductType;

  @Expose()
  @ApiProperty({
    description: 'Whether this product is promoted in featured sections',
    example: false,
  })
  isFeatured!: boolean;

  @Expose()
  @ApiProperty({
    description:
      'Whether this product has selectable variants (drives Add-to-Cart vs. Select-Options UI)',
    example: false,
  })
  hasVariants!: boolean;

  @Expose()
  @ApiProperty({
    description: 'MSRP / list price',
    example: 450.0,
    type: 'number',
    format: 'float',
  })
  basePrice!: number;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Final discounted price — display with a strike-through on `basePrice` when present',
    example: 399.0,
    type: 'number',
    format: 'float',
  })
  salePrice?: number;

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
    description: 'Weight in kilograms, used for shipping cost display',
    example: 0.5,
    type: 'number',
    format: 'float',
  })
  weight?: number;

  @Expose()
  @ApiPropertyOptional({ type: () => ProductDimensionsDto })
  dimensions?: ProductDimensionsDto;

  @Expose()
  @ApiPropertyOptional({ type: () => ProductSeoMetadataDto })
  seoMetadata?: ProductSeoMetadataDto;

  @Expose()
  @ApiProperty({
    description: 'Free-form labels/keywords',
    example: ['coffee', 'organic', 'beverage'],
    type: [String],
  })
  tags!: string[];

  @Expose()
  @ApiPropertyOptional({
    description: 'Usage/dosage instructions in English',
    example: 'Take 1-2 capsules daily before breakfast.',
  })
  dosage?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Usage/dosage instructions in Thai' })
  dosageTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Ingredients list in English',
    example:
      'Pure lyophilized Royal Jelly, Vegetable Cellulose (capsule), Vitamin E.',
  })
  ingredients?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Ingredients list in Thai' })
  ingredientsTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Marketed health benefits in English',
    example:
      'Boosts energy, supports collagen production, and enhances immune defense.',
  })
  healthBenefits?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Marketed health benefits in Thai' })
  healthBenefitsTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Safety warning/contraindications in English',
    example: 'Not suitable for children or people with asthma/bee allergies.',
  })
  warning?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Safety warning/contraindications in Thai',
  })
  warningTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Storage instructions in English',
    example:
      'Store in a cool, dry place below 30°C. Keep away from direct sunlight.',
  })
  storageInstructions?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Storage instructions in Thai' })
  storageInstructionsTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Country/region of origin',
    example: 'Chiang Mai, Thailand',
  })
  origin?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Generic/common name shown on the product label',
    example: 'Bee Milk Supplement',
  })
  genericName?: string;

  @Expose()
  @ApiPropertyOptional({ type: () => ProductCategoryMinifiedDto })
  category?: ProductCategoryMinifiedDto;

  @Expose()
  @ApiProperty({
    type: () => [ProductImageDto],
    description: 'Product gallery images (product-level and variant-level)',
  })
  images!: ProductImageDto[];

  @Expose()
  @ApiProperty({
    type: () => [ProductVariantPublicDto],
    description:
      'Variant configurations (size/color/etc.) — empty array for SIMPLE products',
  })
  variants!: ProductVariantPublicDto[];

  @Expose()
  @ApiPropertyOptional({
    description:
      'When the product went/goes live — usable for a "New Arrival" badge',
  })
  publishedAt?: Date;

  constructor(
    product: Partial<ProductModel> & {
      category?: ProductCategoryInput;
      images?: Partial<ProductImageModel>[] | null;
      variants?: Partial<ProductVariantModel>[] | null;
    },
    baseUrl?: string,
  ) {
    this.id = product.id!;
    this.sid = product.sid!;
    this.name = product.name!;
    this.slug = product.slug!;
    this.sku = product.sku ?? undefined;
    this.description = product.description ?? undefined;
    this.shortDescription = product.shortDescription ?? undefined;
    this.nameTh = product.nameTh ?? undefined;
    this.descriptionTh = product.descriptionTh ?? undefined;
    this.shortDescTh = product.shortDescTh ?? undefined;
    this.type = product.type!;
    this.isFeatured = product.isFeatured!;
    this.hasVariants = product.hasVariants!;
    this.basePrice = Number(product.basePrice);
    this.salePrice = toPrice(product.salePrice);
    this.stockStatus = product.stockStatus!;
    this.weight = toPrice(product.weight);
    this.dimensions = toDimensionsDto(product.dimensions);
    this.seoMetadata = toSeoMetadataDto(product.seoMetadata);
    this.tags = product.tags ?? [];
    this.dosage = product.dosage ?? undefined;
    this.dosageTh = product.dosageTh ?? undefined;
    this.ingredients = product.ingredients ?? undefined;
    this.ingredientsTh = product.ingredientsTh ?? undefined;
    this.healthBenefits = product.healthBenefits ?? undefined;
    this.healthBenefitsTh = product.healthBenefitsTh ?? undefined;
    this.warning = product.warning ?? undefined;
    this.warningTh = product.warningTh ?? undefined;
    this.storageInstructions = product.storageInstructions ?? undefined;
    this.storageInstructionsTh = product.storageInstructionsTh ?? undefined;
    this.origin = product.origin ?? undefined;
    this.genericName = product.genericName ?? undefined;
    this.category = product.category
      ? new ProductCategoryMinifiedDto(product.category)
      : undefined;
    this.images = (product.images ?? []).map(
      (img) => new ProductImageDto(img, baseUrl),
    );
    this.variants = (product.variants ?? []).map(
      (v) => new ProductVariantPublicDto(v),
    );
    this.publishedAt = product.publishedAt ?? undefined;
  }
}

//* ═══════════════════════════════════════════════════════════════════════
//* MINIFIED — embedded in other entities: cart items, order lines, wishlist,
//* related-products widgets, search autocomplete. Keep this list-shaped and
//* cheap to select; don't add fields that require extra joins — no
//* variants/images array here on purpose.
//* `thumbnailUrl` is reserved for once the repository joins `images` —
//* it is safe to leave undefined until then.
//* ═══════════════════════════════════════════════════════════════════════

export class ProductMinifiedResponseDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Public-facing UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  sid!: string;

  @Expose()
  @ApiProperty({
    description: 'Product name in English',
    example: 'Organic Arabica Coffee',
  })
  name!: string;

  @Expose()
  @ApiProperty({
    description: 'URL-friendly slug',
    example: 'organic-arabica-coffee',
  })
  slug!: string;

  @Expose()
  @ApiProperty({
    description: 'MSRP / list price',
    example: 450.0,
    type: 'number',
    format: 'float',
  })
  basePrice!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Final discounted price',
    example: 399.0,
    type: 'number',
    format: 'float',
  })
  salePrice?: number;

  @Expose()
  @ApiProperty({
    enum: StockStatus,
    enumName: 'StockStatus',
    description: 'Public stock badge',
    example: StockStatus.IN_STOCK,
  })
  stockStatus!: StockStatus;

  @Expose()
  @ApiPropertyOptional({
    description: 'Absolute URL of the primary product image',
    example: 'http://localhost:8000/uploads/products/thumbnail-images/abc.webp',
  })
  thumbnailUrl?: string;

  constructor(
    product: Partial<ProductModel> & { thumbnailUrl?: string | null },
    baseUrl?: string,
  ) {
    this.id = product.id!;
    this.sid = product.sid!;
    this.name = product.name!;
    this.slug = product.slug!;
    this.basePrice = Number(product.basePrice);
    this.salePrice = toPrice(product.salePrice);
    this.stockStatus = product.stockStatus!;
    this.thumbnailUrl = toAbsoluteUrl(product.thumbnailUrl, baseUrl);
  }
}
