import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  CategoryProductStatus,
  ProductType,
  StockStatus,
} from '../../../generated/prisma/enums';

/**
 * One row of the dashboard's "variants per product" panel — a variable
 * product paired with how many variants it carries.
 */
export class ProductVariantCountDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 87 })
  id!: number;

  @Expose()
  @ApiProperty({ description: 'Product name', example: 'Vitamin C 1000mg' })
  name!: string;

  @Expose()
  @ApiProperty({
    description: 'URL-friendly slug',
    example: 'vitamin-c-1000mg',
  })
  slug!: string;

  @Expose()
  @ApiProperty({
    enum: ProductType,
    enumName: 'ProductType',
    description: 'Always `VARIABLE` here — a SIMPLE product has no variants.',
    example: ProductType.VARIABLE,
  })
  type!: ProductType;

  @Expose()
  @ApiProperty({
    enum: CategoryProductStatus,
    enumName: 'CategoryProductStatus',
    description: 'Product status at the time of the read',
    example: CategoryProductStatus.ACTIVE,
  })
  status!: CategoryProductStatus;

  @Expose()
  @ApiProperty({
    description:
      'How many variant rows this product carries, **including retired ones** — the number the admin maintains, not the sellable count.',
    example: 5,
  })
  variantCount!: number;

  @Expose()
  @ApiProperty({
    description:
      'Sellable units across this product’s ACTIVE variants (`Product.totalStock`). A retired variant’s shelf stock is excluded.',
    example: 240,
  })
  totalStock!: number;

  constructor(init: {
    id: number;
    name: string;
    slug: string;
    type: ProductType;
    status: CategoryProductStatus;
    totalStock: number;
    _count: { variants: number };
  }) {
    this.id = init.id;
    this.name = init.name;
    this.slug = init.slug;
    this.type = init.type;
    this.status = init.status;
    this.totalStock = init.totalStock;
    this.variantCount = init._count.variants;
  }
}

/** The variant half of the catalog stats — counted across live products only. */
export class ProductVariantStatsDto {
  @Expose()
  @ApiProperty({
    description: 'Every variant row belonging to a non-deleted product',
    example: 214,
  })
  total!: number;

  @Expose()
  @ApiProperty({
    description:
      'Variants whose own `variantStatus` is ACTIVE — the ones that can actually be bought and that feed `Product.totalStock`.',
    example: 198,
  })
  active!: number;

  @Expose()
  @ApiProperty({
    description:
      'Count per `variantStatus`, zero-filled across the whole enum. Note this is the **variant’s own** gate: an ACTIVE variant of a non-ACTIVE product is still invisible, because the parent gate applies first.',
    example: {
      ACTIVE: 198,
      INACTIVE: 12,
      DRAFT: 4,
      ARCHIVED: 0,
      HIDDEN: 0,
    },
    additionalProperties: { type: 'number' },
  })
  byStatus!: Record<CategoryProductStatus, number>;

  @Expose()
  @ApiProperty({
    description:
      'Mean variants per VARIABLE product, rounded to one decimal. `0` when there are no variable products.',
    example: 3.4,
  })
  averagePerVariableProduct!: number;

  @Expose()
  @ApiProperty({
    type: [ProductVariantCountDto],
    description: 'The products carrying the most variants, biggest first.',
  })
  topProducts!: ProductVariantCountDto[];

  constructor(init: {
    total: number;
    byStatus: Record<CategoryProductStatus, number>;
    averagePerVariableProduct: number;
    topProducts: ProductVariantCountDto[];
  }) {
    this.total = init.total;
    this.active = init.byStatus[CategoryProductStatus.ACTIVE];
    this.byStatus = init.byStatus;
    this.averagePerVariableProduct = init.averagePerVariableProduct;
    this.topProducts = init.topProducts;
  }
}

/** Units on hand across the catalog, split by where the type keeps them. */
export class ProductStockUnitsDto {
  @Expose()
  @ApiProperty({
    description: 'Sum of `quantity` over SIMPLE products',
    example: 4_120,
  })
  simple!: number;

  @Expose()
  @ApiProperty({
    description:
      'Sum of `totalStock` over VARIABLE products — sellable units across their ACTIVE variants.',
    example: 8_640,
  })
  variable!: number;

  @Expose()
  @ApiProperty({ description: 'simple + variable', example: 12_760 })
  total!: number;

  constructor(init: { simple: number; variable: number }) {
    this.simple = init.simple;
    this.variable = init.variable;
    this.total = init.simple + init.variable;
  }
}

/**
 * The Product module's contribution to the admin dashboard overview.
 * Soft-deleted products are excluded from every number except `deleted`.
 */
export class ProductStatsDto {
  @Expose()
  @ApiProperty({
    description: 'Every product row that is not soft-deleted',
    example: 316,
  })
  total!: number;

  @Expose()
  @ApiProperty({
    description:
      'Live products — `status = ACTIVE` and not soft-deleted, the storefront visibility gate.',
    example: 271,
  })
  active!: number;

  @Expose()
  @ApiProperty({
    description:
      'Soft-deleted products (`deletedAt` set). Reported separately — they are excluded from every other number here.',
    example: 9,
  })
  deleted!: number;

  @Expose()
  @ApiProperty({
    description:
      'Count per `CategoryProductStatus`, zero-filled across the whole enum.',
    example: {
      ACTIVE: 271,
      INACTIVE: 18,
      DRAFT: 21,
      ARCHIVED: 6,
      HIDDEN: 0,
    },
    additionalProperties: { type: 'number' },
  })
  byStatus!: Record<CategoryProductStatus, number>;

  @Expose()
  @ApiProperty({
    description: 'Count per `ProductType`, zero-filled across the whole enum.',
    example: { SIMPLE: 254, VARIABLE: 62 },
    additionalProperties: { type: 'number' },
  })
  byType!: Record<ProductType, number>;

  @Expose()
  @ApiProperty({
    description: 'Products with no variants — `type = SIMPLE`.',
    example: 254,
  })
  simple!: number;

  @Expose()
  @ApiProperty({
    description: 'Products sold through variants — `type = VARIABLE`.',
    example: 62,
  })
  variable!: number;

  @Expose()
  @ApiProperty({
    description:
      'Products whose `hasVariants` flag is set. Normally equal to `variable`; a mismatch means a VARIABLE product has not had its variants authored yet.',
    example: 62,
  })
  withVariants!: number;

  @Expose()
  @ApiProperty({ description: 'Products flagged `isFeatured`', example: 12 })
  featured!: number;

  @Expose()
  @ApiProperty({
    description: 'Count per `StockStatus`, zero-filled across the whole enum.',
    example: { IN_STOCK: 240, LOW_STOCK: 47, OUT_OF_STOCK: 29 },
    additionalProperties: { type: 'number' },
  })
  byStockStatus!: Record<StockStatus, number>;

  @Expose()
  @ApiProperty({
    description:
      'Products at or below their `lowStockThreshold` — the restock queue.',
    example: 47,
  })
  lowStock!: number;

  @Expose()
  @ApiProperty({
    description: 'Products with nothing sellable on hand.',
    example: 29,
  })
  outOfStock!: number;

  @Expose()
  @ApiProperty({ type: ProductStockUnitsDto, description: 'Units on hand' })
  stockUnits!: ProductStockUnitsDto;

  @Expose()
  @ApiProperty({ type: ProductVariantStatsDto, description: 'Variant tallies' })
  variants!: ProductVariantStatsDto;

  constructor(init: {
    total: number;
    deleted: number;
    byStatus: Record<CategoryProductStatus, number>;
    byType: Record<ProductType, number>;
    byStockStatus: Record<StockStatus, number>;
    withVariants: number;
    featured: number;
    stockUnits: ProductStockUnitsDto;
    variants: ProductVariantStatsDto;
  }) {
    this.total = init.total;
    this.active = init.byStatus[CategoryProductStatus.ACTIVE];
    this.deleted = init.deleted;
    this.byStatus = init.byStatus;
    this.byType = init.byType;
    this.simple = init.byType[ProductType.SIMPLE];
    this.variable = init.byType[ProductType.VARIABLE];
    this.withVariants = init.withVariants;
    this.featured = init.featured;
    this.byStockStatus = init.byStockStatus;
    this.lowStock = init.byStockStatus[StockStatus.LOW_STOCK];
    this.outOfStock = init.byStockStatus[StockStatus.OUT_OF_STOCK];
    this.stockUnits = init.stockUnits;
    this.variants = init.variants;
  }
}
