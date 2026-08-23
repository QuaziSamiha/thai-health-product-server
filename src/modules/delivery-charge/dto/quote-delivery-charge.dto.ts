import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
import {
  emptyStringToUndefined,
  trimString,
} from '../../../common/utils/json-transform.util';
import { PaymentMethod } from '../../../generated/prisma/enums';
import { MAX_QUOTE_ITEMS } from '../delivery-charge.constants';

//* THE SAME XOR CreateOrderDto ENFORCES BETWEEN addressId AND newAddress —
//* REPEATED HERE RATHER THAN SHARED, BECAUSE THE TWO DTOs ARE ALLOWED TO
//* DIVERGE: THIS ONE TAKES A *DESTINATION* (FOUR FIELDS THAT DECIDE A PRICE),
//* NOT AN ADDRESS (RECIPIENT, PHONE, STREET). ASKING A CUSTOMER FOR A PHONE
//* NUMBER BEFORE QUOTING A DELIVERY FEE WOULD BE ABSURD.
@ValidatorConstraint({ name: 'quoteDestinationSource', async: false })
class QuoteDestinationSourceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as QuoteDeliveryChargeDto;
    const hasAddressId = dto.addressId !== undefined && dto.addressId !== null;
    const hasDestination =
      dto.destination !== undefined && dto.destination !== null;
    return hasAddressId !== hasDestination; //* EXACTLY ONE
  }
  defaultMessage(): string {
    return 'Provide exactly one of addressId (a saved address) or destination — not both, not neither.';
  }
}

@ValidatorConstraint({ name: 'quoteItemSource', async: false })
class QuoteItemSourceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const item = args.object as QuoteItemDto;
    const hasProduct = item.productId !== undefined && item.productId !== null;
    const hasCombo = item.comboId !== undefined && item.comboId !== null;
    if (hasProduct === hasCombo) return false;
    if (hasCombo && item.variantId !== undefined) return false;
    return true;
  }
  defaultMessage(): string {
    return 'Each item needs exactly one of productId (optionally with variantId) or comboId — never both, and variantId cannot be combined with comboId.';
  }
}

//* ONLY THE FIELDS THAT MOVE THE PRICE. MIRRORS Address/OrderAddress SEMANTICS
//* EXACTLY (state = PROVINCE, region = DISTRICT) SO A QUOTE AND THE ORDER IT
//* TURNS INTO ARE PRICED OFF THE SAME FOUR VALUES.
export class DeliveryDestinationDto {
  @ApiProperty({
    description: 'Province level — checkout\'s "select state" field',
    example: 'Bangkok',
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'State is required' })
  @IsString({ message: 'State must be a valid text string' })
  @MinLength(2, { message: 'State must be at least 2 characters long' })
  @MaxLength(100, { message: 'State cannot exceed 100 characters' })
  state!: string;

  @ApiProperty({
    description: 'District level — checkout\'s "select region" field',
    example: 'Watthana',
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Region is required' })
  @IsString({ message: 'Region must be a valid text string' })
  @MinLength(2, { message: 'Region must be at least 2 characters long' })
  @MaxLength(100, { message: 'Region cannot exceed 100 characters' })
  region!: string;

  @ApiProperty({
    description: 'Postal code — exactly 5 digits',
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

export class QuoteItemDto {
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

  @Validate(QuoteItemSourceConstraint)
  private readonly _itemSourceCheck?: unknown; //* VALIDATION-ONLY, NEVER READ
}

/**
 * Preview request for the delivery fee, sent from the order-place page once
 * the customer has entered or picked a delivery address.
 *
 * There is no `deliveryCharge` field to send back and no signed quote token to
 * carry: placement recomputes the fee from these same rules inside its own
 * transaction and charges *that*, so a tampered preview changes what the
 * customer is shown and nothing they are billed. That is the whole reason this
 * endpoint can safely be public.
 */
export class QuoteDeliveryChargeDto {
  @ApiPropertyOptional({
    description:
      'Quote against a saved address (logged-in customers only — ownership is enforced).',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Address ID must be an integer' })
  @IsPositive({ message: 'Address ID must be greater than zero' })
  addressId?: number;

  @ApiPropertyOptional({
    description:
      'The destination to price against, for guests and for a not-yet-saved address.',
    type: DeliveryDestinationDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryDestinationDto)
  destination?: DeliveryDestinationDto;

  @Validate(QuoteDestinationSourceConstraint)
  private readonly _destinationSourceCheck?: unknown; //* VALIDATION-ONLY, NEVER READ

  @ApiProperty({
    description:
      'The basket being quoted — weight and item count are derived from the catalog, never taken from the client.',
    type: [QuoteItemDto],
  })
  @IsArray({ message: 'Items must be an array' })
  @ArrayMinSize(1, { message: 'At least one item is required' })
  @ArrayMaxSize(MAX_QUOTE_ITEMS, {
    message: `A quote cannot cover more than ${MAX_QUOTE_ITEMS} distinct items`,
  })
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];

  @ApiPropertyOptional({
    description:
      "Payment method the customer has selected. Cash on Delivery adds the zone's cash-handling fee, and is refused outright for zones that do not offer it.",
    enum: PaymentMethod,
    example: PaymentMethod.CASH_ON_DELIVERY,
    default: PaymentMethod.CASH_ON_DELIVERY,
  })
  @IsOptional()
  @IsIn(Object.values(PaymentMethod), {
    message: 'Payment method is not recognised',
  })
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description:
      'Coupon the customer has applied. Only used to check free-delivery rules attached to it — the goods discount itself is quoted by the promotion module.',
    example: 'FREESHIP',
  })
  @IsOptional()
  @Transform(({ value }) =>
    emptyStringToUndefined(trimString(value))?.toString().toUpperCase(),
  )
  @IsString({ message: 'Promo code must be a valid text string' })
  @MaxLength(50, { message: 'Promo code cannot exceed 50 characters' })
  promoCode?: string;
}
