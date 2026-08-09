import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class UpdateAddressDto {
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

  //* recipientName/phone/addressLine/state/region/postalCode BACK NOT-NULL
  //* COLUMNS — @IsOptional() SKIPS THEM ONLY WHEN OMITTED ENTIRELY
  //* ("DON'T CHANGE THIS FIELD"); @IsNotEmpty() STILL FIRES IF THE CLIENT
  //* EXPLICITLY SENDS "" OR WHITESPACE, SINCE A NOT-NULL COLUMN CAN NEVER
  //* BE BLANKED OUT VIA PATCH.

  @ApiPropertyOptional({
    description: 'Full name of the person receiving the delivery',
    example: 'Somchai Jaidee',
    minLength: 2,
    maxLength: 200,
  })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Recipient name cannot be blank' })
  @IsString({ message: 'Recipient name must be a valid text string' })
  @MinLength(2, {
    message: 'Recipient name must be at least 2 characters long',
  })
  @MaxLength(200, { message: 'Recipient name cannot exceed 200 characters' })
  recipientName?: string;

  @ApiPropertyOptional({
    description:
      'The phone or telephone number (Mobile or Landline). Supports local and international formats.',
    example: '0812345678, 021234567, or +66812345678',
  })
  @IsOptional()
  @IsNotEmpty({ message: 'Phone cannot be blank' })
  @IsThaiPhone({
    message:
      'Phone must be a valid Thai format: 08XXXXXXXX (Mobile), 02XXXXXXX (Landline), or +66XXXXXXXXX',
  })
  @TransformThaiPhone()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Street name and house/unit number',
    example: '123/45 Sukhumvit Road',
    minLength: 5,
    maxLength: 255,
  })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Address line cannot be blank' })
  @IsString({ message: 'Address line must be a valid text string' })
  @MinLength(5, { message: 'Address line must be at least 5 characters long' })
  @MaxLength(255, { message: 'Address line cannot exceed 255 characters' })
  addressLine?: string;

  @ApiPropertyOptional({
    description: 'Province level, e.g. checkout\'s "select state" field',
    example: 'Bangkok',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'State cannot be blank' })
  @IsString({ message: 'State must be a valid text string' })
  @MinLength(2, { message: 'State must be at least 2 characters long' })
  @MaxLength(100, { message: 'State cannot exceed 100 characters' })
  state?: string;

  @ApiPropertyOptional({
    description: 'District level, e.g. checkout\'s "select region" field',
    example: 'Watthana',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Region cannot be blank' })
  @IsString({ message: 'Region must be a valid text string' })
  @MinLength(2, { message: 'Region must be at least 2 characters long' })
  @MaxLength(100, { message: 'Region cannot exceed 100 characters' })
  region?: string;

  @ApiPropertyOptional({
    description: 'Postal/ZIP code — exactly 5 digits',
    example: '10110',
  })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Postal code cannot be blank' })
  @IsString({ message: 'Postal code must be a valid text string' })
  @Matches(/^\d{5}$/, {
    message: 'Postal code must be a valid 5-digit Thai postal code, e.g. 10110',
  })
  postalCode?: string;

  @ApiPropertyOptional({
    description: 'Country name',
    example: 'Thailand',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(trimString(value)))
  @IsString({ message: 'Country must be a valid text string' })
  @MaxLength(100, { message: 'Country cannot exceed 100 characters' })
  country?: string;

  @ApiPropertyOptional({
    description: 'Mark this address as the default delivery address',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isDefault must be true or false' })
  isDefault?: boolean;
}
