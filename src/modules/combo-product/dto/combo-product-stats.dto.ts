import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { CategoryProductStatus } from '../../../generated/prisma/enums';

/**
 * The ComboProduct module's contribution to the admin dashboard overview.
 * Soft-deleted combos are excluded from every number except `deleted`.
 */
export class ComboProductStatsDto {
  @Expose()
  @ApiProperty({
    description: 'Every combo row that is not soft-deleted',
    example: 24,
  })
  total!: number;

  @Expose()
  @ApiProperty({
    description:
      'Soft-deleted combos (`deletedAt` set). Reported separately — excluded from every other number here.',
    example: 3,
  })
  deleted!: number;

  @Expose()
  @ApiProperty({
    description:
      'Count per `CategoryProductStatus`, zero-filled across the whole enum. This is the **stored** status, which the expiry sweep only corrects on a schedule — see `sellingNow` for what a customer can actually buy.',
    example: {
      ACTIVE: 14,
      INACTIVE: 6,
      DRAFT: 4,
      ARCHIVED: 0,
      HIDDEN: 0,
    },
    additionalProperties: { type: 'number' },
  })
  byStatus!: Record<CategoryProductStatus, number>;

  @Expose()
  @ApiProperty({
    description: 'Combos whose stored status is ACTIVE.',
    example: 14,
  })
  active!: number;

  @Expose()
  @ApiProperty({
    description:
      'Combos the storefront is serving **right now** — ACTIVE, published, and inside their `startsAt`/`endsAt` window as tested live. Always ≤ `active`.',
    example: 11,
  })
  sellingNow!: number;

  @Expose()
  @ApiProperty({
    description:
      'Combos still flagged ACTIVE whose promotion window has already closed — exactly what the next expiry sweep will retire. A persistently non-zero value means the sweep is not running.',
    example: 3,
  })
  expired!: number;

  @Expose()
  @ApiProperty({ description: 'Combos flagged `isFeatured`', example: 5 })
  featured!: number;

  @Expose()
  @ApiProperty({
    description:
      'Bundles claimed by orders across every combo — the sum of `soldQuantity`.',
    example: 486,
  })
  soldBundles!: number;

  constructor(init: {
    total: number;
    deleted: number;
    byStatus: Record<CategoryProductStatus, number>;
    sellingNow: number;
    expired: number;
    featured: number;
    soldBundles: number;
  }) {
    this.total = init.total;
    this.deleted = init.deleted;
    this.byStatus = init.byStatus;
    this.active = init.byStatus[CategoryProductStatus.ACTIVE];
    this.sellingNow = init.sellingNow;
    this.expired = init.expired;
    this.featured = init.featured;
    this.soldBundles = init.soldBundles;
  }
}
