import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsThaiPhone } from '../../../common/decorators/validation/is-thai-phone.decorator';
import { TransformThaiPhone } from '../../../common/decorators/transformation/transform-thai-phone.decorator';
import {
  emptyStringToUndefined,
  parseBooleanInput,
  trimString,
} from '../../../common/utils/json-transform.util';

//* SHIPPING-ONLY IN V1 — THERE IS NO `type` FIELD HERE. THE SERVER ALWAYS
//* WRITES AddressType.SHIPPING; A SEPARATE BILLING ADDRESS BOOK IS NOT
//* SUPPORTED YET (SEE docs/address.md "Decisions").
export class CreateAddressDto {
  @ApiPropertyOptional({
    description: 'User-facing nickname for this address',
    example: 'Home',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Label must be a valid text string' })
  @MaxLength(100, { message: 'Label cannot exceed 100 characters' })
  label?: string;

  @ApiPropertyOptional({
    description:
      "Full name of the person receiving the delivery. Defaults to the logged-in user's own profile name when omitted.",
    example: 'Somchai Jaidee',
    minLength: 2,
    maxLength: 200,
  })
  @IsOptional()
  //* "" IS TREATED AS "NOT PROVIDED", NOT AS A VALIDATION ERROR — SO IT
  //* CORRECTLY FALLS THROUGH TO AddressService'S PROFILE-NAME FALLBACK
  //* INSTEAD OF FAILING VALIDATION ON AN EMPTY STRING.
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Recipient name must be a valid text string' })
  @MinLength(2, {
    message: 'Recipient name must be at least 2 characters long',
  })
  @MaxLength(200, { message: 'Recipient name cannot exceed 200 characters' })
  recipientName?: string;

  @ApiPropertyOptional({
    description:
      "The phone or telephone number (Mobile or Landline). Supports local and international formats. Defaults to the logged-in user's own account phone when omitted.",
    example: '0812345678, 021234567, or +66812345678',
  })
  @IsOptional()
  //* RUNS AFTER TransformThaiPhone (DECLARED BELOW — class-transformer
  //* APPLIES STACKED @Transform DECORATORS BOTTOM-UP) SO A WHITESPACE-ONLY
  //* INPUT, WHICH TransformThaiPhone REDUCES TO "", COLLAPSES TO undefined
  //* AND CORRECTLY FALLS THROUGH TO THE ACCOUNT-PHONE FALLBACK INSTEAD OF
  //* FAILING @IsThaiPhone WITH A CONFUSING "INVALID FORMAT" ERROR.
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
    minLength: 2,
    maxLength: 100,
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
    minLength: 2,
    maxLength: 100,
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
    example: 'Thailand',
    default: 'Thailand',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Country must be a valid text string' })
  @MaxLength(100, { message: 'Country cannot exceed 100 characters' })
  country?: string;

  @ApiPropertyOptional({
    description:
      'Mark this address as the default delivery address. The first address a user saves always becomes the default regardless of this flag.',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isDefault must be true or false' })
  isDefault?: boolean;
}
