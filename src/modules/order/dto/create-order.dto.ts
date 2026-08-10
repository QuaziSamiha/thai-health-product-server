import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { IsThaiPhone } from '../../../common/decorators/validation/is-thai-phone.decorator';
import { TransformThaiPhone } from '../../../common/decorators/transformation/transform-thai-phone.decorator';
import {
  emptyStringToUndefined,
  trimString,
} from '../../../common/utils/json-transform.util';
import { PaymentMethod } from '../../../generated/prisma/enums';

//* ONLY CASH_ON_DELIVERY IS ACCEPTED IN V1 — CARD/SCANPAY EXIST ON THE
//* SCHEMA'S PaymentMethod ENUM (order.prisma) BUT NO GATEWAY IS WIRED UP
//* YET. ACCEPTING THEM HERE WOULD SILENTLY CREATE AN ORDER NOBODY ACTUALLY
//* CHARGES — REJECT INSTEAD OF PRETENDING TO SUPPORT THEM. WIDEN THIS TO
//* @IsEnum(PaymentMethod) ONCE A GATEWAY EXISTS — SEE docs/order.md.
const SUPPORTED_PAYMENT_METHODS = [PaymentMethod.CASH_ON_DELIVERY] as const;

@ValidatorConstraint({ name: 'addressSource', async: false })
class AddressSourceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateOrderDto;
    const hasAddressId = dto.addressId !== undefined && dto.addressId !== null;
    const hasNewAddress =
      dto.newAddress !== undefined && dto.newAddress !== null;
    return hasAddressId !== hasNewAddress; //* EXACTLY ONE
  }
  defaultMessage(): string {
    return 'Provide exactly one of addressId (a saved address) or newAddress — not both, not neither.';
  }
}

@ValidatorConstraint({ name: 'orderItemSource', async: false })
class OrderItemSourceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const item = args.object as OrderItemDto;
    const hasProduct = item.productId !== undefined && item.productId !== null;
    const hasCombo = item.comboId !== undefined && item.comboId !== null;
    if (hasProduct === hasCombo) return false; //* EXACTLY ONE OF THE TWO
    if (hasCombo && item.variantId !== undefined) return false; //* variantId ONLY VALID WITH productId
    return true;
  }
  defaultMessage(): string {
    return 'Each item needs exactly one of productId (optionally with variantId) or comboId — never both, and variantId cannot be combined with comboId.';
  }
}

export class NewAddressDto {
  @ApiPropertyOptional({
    description: 'User-facing nickname for this address, e.g. "Home"',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Label must be a valid text string' })
  @MaxLength(100, { message: 'Label cannot exceed 100 characters' })
  label?: string;

  @ApiPropertyOptional({
    description:
      'Recipient name for this delivery. Defaults to the checkout personal-info name when omitted.',
    minLength: 2,
    maxLength: 200,
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Recipient name must be a valid text string' })
  @MinLength(2, {
    message: 'Recipient name must be at least 2 characters long',
  })
  @MaxLength(200, { message: 'Recipient name cannot exceed 200 characters' })
  recipientName?: string;

  @ApiPropertyOptional({
    description:
      'Contact phone for this delivery. Defaults to the checkout personal-info phone when omitted.',
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(value))
  @IsThaiPhone({
    message:
      'Phone must be a valid Thai format: 08XXXXXXXX (Mobile), 02XXXXXXX (Landline), or +66XXXXXXXXX',
  })
  @TransformThaiPhone()
  phone?: string;

  @ApiProperty({
    description: 'Street name and house/unit number',
    example: '123/45 Sukhumvit Road',
    minLength: 5,
    maxLength: 255,
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Address line is required' })
  @IsString({ message: 'Address line must be a valid text string' })
  @MinLength(5, { message: 'Address line must be at least 5 characters long' })
  @MaxLength(255, { message: 'Address line cannot exceed 255 characters' })
  addressLine!: string;

  @ApiProperty({
    description: 'Province level, e.g. checkout\'s "select state" field',
    example: 'Bangkok',
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'State is required' })
  @IsString({ message: 'State must be a valid text string' })
  @MinLength(2, { message: 'State must be at least 2 characters long' })
  @MaxLength(100, { message: 'State cannot exceed 100 characters' })
  state!: string;

  @ApiProperty({
    description: 'District level, e.g. checkout\'s "select region" field',
    example: 'Watthana',
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Region is required' })
  @IsString({ message: 'Region must be a valid text string' })
  @MinLength(2, { message: 'Region must be at least 2 characters long' })
  @MaxLength(100, { message: 'Region cannot exceed 100 characters' })
  region!: string;

  @ApiProperty({
    description: 'Postal/ZIP code — exactly 5 digits',
    example: '10110',
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Postal code is required' })
  @IsString({ message: 'Postal code must be a valid text string' })
  @Matches(/^\d{5}$/, {
    message: 'Postal code must be a valid 5-digit Thai postal code, e.g. 10110',
  })
  postalCode!: string;

  @ApiPropertyOptional({
    description: 'Country name. Defaults to Thailand.',
    default: 'Thailand',
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Country must be a valid text string' })
  @MaxLength(100, { message: 'Country cannot exceed 100 characters' })
  country?: string;
}

export class OrderItemDto {
  @ApiPropertyOptional({
    description: 'Product ID — required unless comboId is set',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Product ID must be an integer' })
  @IsPositive({ message: 'Product ID must be greater than zero' })
  productId?: number;

  @ApiPropertyOptional({
    description: 'Specific variant ID — only valid alongside productId',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Variant ID must be an integer' })
  @IsPositive({ message: 'Variant ID must be greater than zero' })
  variantId?: number;

  @ApiPropertyOptional({
    description: 'Combo product ID — required unless productId is set',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Combo ID must be an integer' })
  @IsPositive({ message: 'Combo ID must be greater than zero' })
  comboId?: number;

  @ApiProperty({ description: 'Quantity', minimum: 1, example: 1 })
  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity!: number;

  @Validate(OrderItemSourceConstraint)
  private readonly _itemSourceCheck?: unknown; //* VALIDATION-ONLY, NEVER READ
}

export class CreateOrderDto {
  @ApiProperty({ description: 'Customer first name', maxLength: 100 })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'First name is required' })
  @IsString({ message: 'First name must be a valid text string' })
  @MaxLength(100, { message: 'First name cannot exceed 100 characters' })
  firstName!: string;

  @ApiProperty({ description: 'Customer last name', maxLength: 100 })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Last name is required' })
  @IsString({ message: 'Last name must be a valid text string' })
  @MaxLength(100, { message: 'Last name cannot exceed 100 characters' })
  lastName!: string;

  @ApiProperty({ description: 'Contact phone for this order' })
  @Transform(({ value }) => emptyStringToUndefined(value))
  @IsThaiPhone({
    message:
      'Phone must be a valid Thai format: 08XXXXXXXX (Mobile), 02XXXXXXX (Landline), or +66XXXXXXXXX',
  })
  @TransformThaiPhone()
  phone!: string;

  @ApiProperty({ description: 'Contact email for order confirmation' })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(255, { message: 'Email cannot exceed 255 characters' })
  email!: string;

  @ApiPropertyOptional({
    description:
      'Use a saved address from the address book (logged-in customers only)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Address ID must be an integer' })
  @IsPositive({ message: 'Address ID must be greater than zero' })
  addressId?: number;

  @ApiPropertyOptional({
    description:
      'A new address for this order. Logged-in customers: saved to their address book too. Guests: used for this order only.',
    type: NewAddressDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NewAddressDto)
  newAddress?: NewAddressDto;

  @Validate(AddressSourceConstraint)
  private readonly _addressSourceCheck?: unknown; //* VALIDATION-ONLY, NEVER READ

  @ApiProperty({
    description: 'Line items — each one is either a product/variant or a combo',
    type: [OrderItemDto],
  })
  @IsArray({ message: 'Items must be an array' })
  @ArrayMinSize(1, { message: 'At least one item is required' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiProperty({
    description:
      'Payment method — only Cash on Delivery is available right now',
    enum: PaymentMethod,
    example: PaymentMethod.CASH_ON_DELIVERY,
  })
  @IsIn(SUPPORTED_PAYMENT_METHODS, {
    message: 'Only Cash on Delivery is available right now',
  })
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ description: 'Optional note for the order' })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Note must be a valid text string' })
  @MaxLength(1000, { message: 'Note cannot exceed 1000 characters' })
  customerNote?: string;

  @ApiPropertyOptional({
    description:
      'Coupon code to apply, if any. Re-validated at placement time.',
    example: 'WELCOME10',
  })
  @IsOptional()
  @Transform(({ value }) =>
    emptyStringToUndefined(trimString(value))?.toString().toUpperCase(),
  )
  @IsString({ message: 'Promo code must be a valid text string' })
  @MaxLength(50, { message: 'Promo code cannot exceed 50 characters' })
  promoCode?: string;
}
