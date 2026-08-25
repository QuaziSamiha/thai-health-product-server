import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/** The Promotion module's contribution to the admin dashboard overview. */
export class PromoCodeStatsDto {
  @Expose()
  @ApiProperty({ description: 'Every promo code ever created', example: 37 })
  total!: number;

  @Expose()
  @ApiProperty({
    description:
      'Codes with `isActive` set. Note this is the switch alone — a code can be active and still unusable because its window closed or its `usageLimit` is spent. See `redeemable`.',
    example: 21,
  })
  active!: number;

  @Expose()
  @ApiProperty({
    description:
      'Codes a customer could successfully apply right now: active, inside their `startsAt`/`endsAt` window, and not out of uses. Always ≤ `active`.',
    example: 14,
  })
  redeemable!: number;

  @Expose()
  @ApiProperty({
    description:
      'Active codes the storefront lists publicly. Most codes are handed out deliberately and stay private — `isActive` alone never means "published".',
    example: 5,
  })
  published!: number;

  @Expose()
  @ApiProperty({
    description: 'Codes whose `endsAt` is in the past, active or not.',
    example: 12,
  })
  expired!: number;

  @Expose()
  @ApiProperty({
    description:
      'Rows in the `PromoCodeRedemption` ledger — the authoritative count of codes actually applied to an order.',
    example: 642,
  })
  totalRedemptions!: number;

  constructor(init: {
    total: number;
    active: number;
    redeemable: number;
    published: number;
    expired: number;
    totalRedemptions: number;
  }) {
    this.total = init.total;
    this.active = init.active;
    this.redeemable = init.redeemable;
    this.published = init.published;
    this.expired = init.expired;
    this.totalRedemptions = init.totalRedemptions;
  }
}
