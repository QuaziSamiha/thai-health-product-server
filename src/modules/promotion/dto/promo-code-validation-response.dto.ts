import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { DiscountType } from '../../../generated/prisma/enums';

//* DELIBERATELY LEANER THAN PromoCodeResponseDto — A CUSTOMER-FACING PREVIEW
//* HAS NO BUSINESS SEEING usageLimit/usedCount OR OTHER BACK-OFFICE FIELDS,
//* SAME DATA-HYGIENE SPLIT AS SupportResponseDto/SupportResponsePublicDto.
export class PromoCodeValidationResponseDto {
  @Expose()
  @ApiProperty({
    description: 'The validated coupon code',
    example: 'WELCOME10',
  })
  code!: string;

  @Expose()
  @ApiProperty({ enum: DiscountType })
  discountType!: DiscountType;

  @Expose()
  @ApiProperty({ description: 'Discount value paired with discountType' })
  discountValue!: number;

  @Expose()
  @ApiProperty({
    description: 'Computed discount for the given subtotal, already capped',
    example: 50,
  })
  discountAmount!: number;

  constructor(data: {
    code: string;
    discountType: DiscountType;
    discountValue: number;
    discountAmount: number;
  }) {
    this.code = data.code;
    this.discountType = data.discountType;
    this.discountValue = data.discountValue;
    this.discountAmount = data.discountAmount;
  }
}
