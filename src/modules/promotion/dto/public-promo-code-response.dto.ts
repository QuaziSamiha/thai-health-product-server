import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { DiscountType } from '../../../generated/prisma/enums';

//* THE STOREFRONT "AVAILABLE COUPONS" SHAPE — A THIRD, NARROWER VIEW ALONGSIDE
//* PromoCodeResponseDto (BACK-OFFICE) AND PromoCodeValidationResponseDto
//* (PREVIEW OF ONE CODE AGAINST ONE CART). IT CARRIES ONLY WHAT A CUSTOMER
//* NEEDS TO DECIDE WHETHER A CODE IS WORTH TYPING: THE CODE, WHAT IT PAYS OUT,
//* WHAT IT COSTS TO QUALIFY, AND WHEN IT DIES. DELIBERATELY OMITS
//* usageLimit/usedCount/usageLimitPerUser — HOW CLOSE A CAMPAIGN IS TO
//* EXHAUSTION IS BUSINESS DATA, AND "17 LEFT" INVITES SCRIPTED CLAIMING.
export class PublicPromoCodeResponseDto {
  @Expose()
  @ApiProperty({ description: 'The coupon code to type at checkout' })
  code!: string;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Admin-written blurb, shown as the coupon\'s label when present. Also visible in the admin list — the same text serves both.',
  })
  description?: string | null;

  @Expose()
  @ApiProperty({ enum: DiscountType })
  discountType!: DiscountType;

  @Expose()
  @ApiProperty({ description: 'Flat amount or percentage, per discountType' })
  discountValue!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Minimum subtotal to qualify. null = no minimum',
  })
  minOrderAmount?: number | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Payout cap for a PERCENTAGE code. null = uncapped',
  })
  maxDiscountAmount?: number | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'When the code stops working. null = open-ended',
  })
  endsAt?: Date | null;

  constructor(promoCode: {
    code: string;
    description: string | null;
    discountType: DiscountType;
    discountValue: unknown;
    minOrderAmount: unknown;
    maxDiscountAmount: unknown;
    endsAt: Date | null;
  }) {
    this.code = promoCode.code;
    this.description = promoCode.description ?? null;
    this.discountType = promoCode.discountType;
    this.discountValue = Number(promoCode.discountValue);
    this.minOrderAmount =
      promoCode.minOrderAmount != null
        ? Number(promoCode.minOrderAmount)
        : null;
    this.maxDiscountAmount =
      promoCode.maxDiscountAmount != null
        ? Number(promoCode.maxDiscountAmount)
        : null;
    this.endsAt = promoCode.endsAt;
  }
}
