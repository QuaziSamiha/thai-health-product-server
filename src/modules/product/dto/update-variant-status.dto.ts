import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { CategoryProductStatus } from '../../../generated/prisma/enums';

//* THE WHOLE BODY OF THE SINGLE-VARIANT STATUS ENDPOINT. DELIBERATELY NOT A
//* PARTIAL OF UpdateProductVariantDto: THAT DTO IS AN *ENTRY IN A RECONCILE
//* LIST* WHERE EVERY FIELD IS OPTIONAL AND A MISSING `id` MEANS "CREATE ME".
//* THIS IS A ONE-FIELD COMMAND ADDRESSED BY URL, SO THE FIELD IS REQUIRED —
//* AN EMPTY BODY HERE IS A MISTAKE, NOT A NO-OP PATCH.
export class UpdateVariantStatusDto {
  @ApiProperty({
    description:
      "The variant's new visibility state. ACTIVE is the only state in which a variant is shown on the storefront, orderable, counted toward its product's `totalStock`, or usable in a combo — every other value retires it on all four fronts at once.",
    enum: CategoryProductStatus,
    enumName: 'CategoryProductStatus',
    example: CategoryProductStatus.INACTIVE,
  })
  @IsNotEmpty({ message: 'Variant status is required' })
  @IsEnum(CategoryProductStatus, {
    message: 'Please select a valid variant status',
  })
  variantStatus!: CategoryProductStatus;
}
