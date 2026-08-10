import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { trimString } from '../../../common/utils/json-transform.util';

//* USED BY THE PUBLIC "APPLY COUPON" PREVIEW (POST /promotion/promo-codes/validate),
//* CALLED FROM THE CART/CHECKOUT PAGE BEFORE AN ORDER EXISTS — SEE
//* PromotionService.previewDiscount.
export class ValidatePromoCodeDto {
  @ApiProperty({
    description: 'The coupon code to validate',
    example: 'WELCOME10',
  })
  @Transform(({ value }) => trimString(value)?.toString().toUpperCase())
  @IsNotEmpty({ message: 'Code is required' })
  @IsString({ message: 'Code must be a valid text string' })
  code!: string;

  @ApiProperty({
    description: 'Current cart/order subtotal to validate the code against',
    example: 500,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Subtotal must be a number' })
  @IsPositive({ message: 'Subtotal must be greater than zero' })
  subtotal!: number;

  @ApiPropertyOptional({
    description:
      'Guest email, used to enforce the per-customer usage limit for a guest checkout. ' +
      'Not needed for a logged-in customer — their account is used instead.',
  })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;
}
