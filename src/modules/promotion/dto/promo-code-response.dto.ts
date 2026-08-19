import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { DiscountType } from '../../../generated/prisma/enums';
import { PromoCodeModel } from '../../../generated/prisma/models';

//* ADMIN/BACK-OFFICE SHAPE — INCLUDES usageLimit/usedCount AND THE
//* COMPUTED remainingUses/isCurrentlyValid CONVENIENCE FIELDS THE ADMIN
//* DASHBOARD NEEDS TO SHOW A CODE'S HEALTH AT A GLANCE. NEVER REUSE FOR THE
//* PUBLIC validate ENDPOINT — SEE PromoCodeValidationResponseDto FOR THAT.
export class PromoCodeResponseDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Public-facing UUID, safe to expose in URLs and API responses',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sid!: string;

  @Expose()
  @ApiProperty({
    description: 'Customer-facing coupon code',
    example: 'WELCOME10',
  })
  code!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Internal/admin-facing description' })
  description?: string | null;

  @Expose()
  @ApiProperty({ enum: DiscountType })
  discountType!: DiscountType;

  @Expose()
  @ApiProperty({
    description: 'Flat amount or percentage, paired with discountType',
  })
  discountValue!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Minimum order subtotal to apply this code',
  })
  minOrderAmount?: number | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Discount payout cap for PERCENTAGE codes',
  })
  maxDiscountAmount?: number | null;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Total redemptions allowed across all customers. null = unlimited',
  })
  usageLimit?: number | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Redemptions allowed per customer. null = unlimited',
  })
  usageLimitPerUser?: number | null;

  @Expose()
  @ApiProperty({ description: 'Redemptions so far', example: 12 })
  usedCount!: number;

  @Expose()
  @ApiProperty({ description: 'Whether the code is active' })
  isActive!: boolean;

  @Expose()
  @ApiProperty({
    description:
      'Whether the code is listed on the storefront. Independent of isActive — an active code is not published unless this is true.',
  })
  isPublic!: boolean;

  @Expose()
  @ApiPropertyOptional({ description: 'When the code becomes valid' })
  startsAt?: Date | null;

  @Expose()
  @ApiPropertyOptional({ description: 'When the code stops being valid' })
  endsAt?: Date | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'usageLimit - usedCount. null when usageLimit is unlimited',
  })
  remainingUses?: number | null;

  @Expose()
  @ApiProperty({
    description:
      'Computed: isActive, within the startsAt/endsAt window, and not out of uses, as of now',
  })
  isCurrentlyValid!: boolean;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp when the record was created' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp of the last update' })
  updatedAt!: Date;

  constructor(promoCode: Partial<PromoCodeModel>) {
    this.id = promoCode.id!;
    this.sid = promoCode.sid!;
    this.code = promoCode.code!;
    this.description = promoCode.description ?? undefined;
    this.discountType = promoCode.discountType!;
    this.discountValue = Number(promoCode.discountValue);
    this.minOrderAmount =
      promoCode.minOrderAmount != null
        ? Number(promoCode.minOrderAmount)
        : null;
    this.maxDiscountAmount =
      promoCode.maxDiscountAmount != null
        ? Number(promoCode.maxDiscountAmount)
        : null;
    this.usageLimit = promoCode.usageLimit ?? null;
    this.usageLimitPerUser = promoCode.usageLimitPerUser ?? null;
    this.usedCount = promoCode.usedCount!;
    this.isActive = promoCode.isActive!;
    this.isPublic = promoCode.isPublic!;
    this.startsAt = promoCode.startsAt ?? null;
    this.endsAt = promoCode.endsAt ?? null;
    this.remainingUses =
      this.usageLimit !== null
        ? Math.max(this.usageLimit - this.usedCount, 0)
        : null;

    const now = new Date();
    this.isCurrentlyValid =
      this.isActive &&
      (this.startsAt === null || this.startsAt <= now) &&
      (this.endsAt === null || this.endsAt >= now) &&
      (this.remainingUses === null || this.remainingUses > 0);

    this.createdAt = promoCode.createdAt!;
    this.updatedAt = promoCode.updatedAt!;
  }
}
