import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { CategoryProductStatus } from '../../../generated/prisma/enums';

/**
 * One row of the dashboard's "products per category" panel — a category
 * paired with its catalog size.
 */
export class CategoryProductCountDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 12 })
  id!: number;

  @Expose()
  @ApiProperty({ description: 'Category name', example: 'Vitamins' })
  name!: string;

  @Expose()
  @ApiProperty({ description: 'URL-friendly slug', example: 'vitamins' })
  slug!: string;

  @Expose()
  @ApiProperty({
    description:
      'Depth in the taxonomy. `0` = root (a container whose count covers its whole branch), `1` = an assignable product category.',
    example: 1,
  })
  level!: number;

  @Expose()
  @ApiProperty({
    enum: CategoryProductStatus,
    enumName: 'CategoryProductStatus',
    description: 'Category status at the time of the read',
    example: CategoryProductStatus.ACTIVE,
  })
  status!: CategoryProductStatus;

  @Expose()
  @ApiProperty({
    description:
      'Sellable products (`status = ACTIVE`, not soft-deleted) filed under this category **or any descendant of it** — the trigger-maintained `productCount` rollup. A root therefore reports its entire branch.',
    example: 34,
  })
  productCount!: number;

  constructor(init: {
    id: number;
    name: string;
    slug: string;
    level: number;
    status: CategoryProductStatus;
    productCount: number;
  }) {
    this.id = init.id;
    this.name = init.name;
    this.slug = init.slug;
    this.level = init.level;
    this.status = init.status;
    this.productCount = init.productCount;
  }
}

/**
 * The Category module's contribution to the admin dashboard overview.
 * Owned here, not in the dashboard module, so the shape stays next to the
 * rules that produce it — `DashboardService` only composes it.
 */
export class CategoryStatsDto {
  @Expose()
  @ApiProperty({
    description: 'Every category row, regardless of status',
    example: 42,
  })
  total!: number;

  @Expose()
  @ApiProperty({
    description:
      'Live categories — `status = ACTIVE`. Pulled out of `byStatus` because it is the headline number on the card.',
    example: 31,
  })
  active!: number;

  @Expose()
  @ApiProperty({
    description:
      'Count per `CategoryProductStatus`, zero-filled across the whole enum so a status with nothing in it still reports `0`.',
    example: {
      ACTIVE: 31,
      INACTIVE: 4,
      DRAFT: 2,
      ARCHIVED: 5,
      HIDDEN: 0,
    },
    additionalProperties: { type: 'number' },
  })
  byStatus!: Record<CategoryProductStatus, number>;

  @Expose()
  @ApiProperty({
    description:
      'Top-level containers (`parentId = null`, `level = 0`). Products are never filed directly on one.',
    example: 6,
  })
  rootCategories!: number;

  @Expose()
  @ApiProperty({
    description:
      'Level-1 categories — the tier products are actually assignable to.',
    example: 28,
  })
  productCategories!: number;

  @Expose()
  @ApiProperty({
    description: 'Categories flagged `isFeatured`',
    example: 4,
  })
  featured!: number;

  @Expose()
  @ApiProperty({
    type: [CategoryProductCountDto],
    description:
      'The largest categories by `productCount`, biggest first. Categories holding nothing are omitted.',
  })
  topByProductCount!: CategoryProductCountDto[];

  constructor(init: {
    total: number;
    byStatus: Record<CategoryProductStatus, number>;
    rootCategories: number;
    productCategories: number;
    featured: number;
    topByProductCount: CategoryProductCountDto[];
  }) {
    this.total = init.total;
    this.active = init.byStatus[CategoryProductStatus.ACTIVE];
    this.byStatus = init.byStatus;
    this.rootCategories = init.rootCategories;
    this.productCategories = init.productCategories;
    this.featured = init.featured;
    this.topByProductCount = init.topByProductCount;
  }
}
