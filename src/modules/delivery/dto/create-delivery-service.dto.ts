import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  blankNumberToUndefined,
  parseBooleanInput,
  trimString,
} from '../../../common/utils/json-transform.util';
import { IsGteField } from '../../../common/decorators/validation/is-gte-field.decorator';

//* ONE FLAT SUBMISSION = ONE Set Up TABLE ROW (COMPANY NAME / NUMBER /
//* LOCATION / DELIVERY AREA / DELIVERY TIME), MATCHING THE ADMIN FORM'S UX.
//* UNDERNEATH, THIS CREATES A DeliveryZone AND EITHER CREATES A NEW
//* DeliveryProvider OR ATTACHES TO AN EXISTING ONE BY NAME — SEE
//* DeliveryService.createExternalDeliveryService FOR THE find-or-create LOGIC.
//* THIS IS WHY "KEX Express" CAN BE SUBMITTED TWICE WITH DIFFERENT AREA/TIME
//* VALUES AND PRODUCE TWO ROWS UNDER ONE PROVIDER INSTEAD OF A DUPLICATE-NAME
//* CONFLICT — SEE docs/delivery.md'S "Conventions" SECTION.
export class CreateDeliveryServiceDto {
  // ─── Provider (Company) ─────────────────────────────────────────────────────

  @ApiProperty({
    description:
      'Courier company name. If a provider with this name already exists, the new zone is attached to it instead of creating a duplicate provider.',
    example: 'KEX Express',
    maxLength: 150,
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Company name is required' })
  @IsString({ message: 'Company name must be a valid text string' })
  @MaxLength(150, { message: 'Company name cannot exceed 150 characters' })
  companyName!: string;

  @ApiProperty({
    description: "Courier's contact phone number.",
    example: '+66 2 123 4567',
    maxLength: 20,
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString({ message: 'Phone number must be a valid text string' })
  @MaxLength(20, { message: 'Phone number cannot exceed 20 characters' })
  phone!: string;

  @ApiPropertyOptional({
    description:
      "Courier's own hub/head-office address — distinct from the delivery area it serves.",
    example: 'Bangkok, Thailand',
    maxLength: 255,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Location must be a valid text string' })
  @MaxLength(255, { message: 'Location cannot exceed 255 characters' })
  officeLocation?: string;

  // ─── Zone (Coverage / Time / Fee) ───────────────────────────────────────────

  @ApiProperty({
    description: 'Delivery coverage area, displayed as-is in the admin table.',
    example: 'Bangkok, Thailand',
    maxLength: 150,
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Delivery area is required' })
  @IsString({ message: 'Delivery area must be a valid text string' })
  @MaxLength(150, { message: 'Delivery area cannot exceed 150 characters' })
  areaName!: string;

  @ApiProperty({
    description: 'Fastest-case delivery time, in days.',
    example: 3,
    minimum: 0,
  })
  @Transform(blankNumberToUndefined)
  @Type(() => Number)
  @IsInt({ message: 'Minimum delivery days must be a whole number' })
  @Min(0, { message: 'Minimum delivery days cannot be negative' })
  minDeliveryDays!: number;

  @ApiProperty({
    description:
      'Slowest-case delivery time, in days. Must be greater than or equal to minDeliveryDays.',
    example: 7,
    minimum: 0,
  })
  @Transform(blankNumberToUndefined)
  @Type(() => Number)
  @IsInt({ message: 'Maximum delivery days must be a whole number' })
  @Min(0, { message: 'Maximum delivery days cannot be negative' })
  @IsGteField('minDeliveryDays', {
    message:
      'Maximum delivery days must be greater than or equal to minimum delivery days',
  })
  maxDeliveryDays!: number;

  @ApiPropertyOptional({
    description: 'Flat delivery charge for this area/tier. Defaults to 0.',
    example: 60.0,
    minimum: 0,
    default: 0,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Base fee must be a valid number' })
  @Min(0, { message: 'Base fee cannot be negative' })
  baseFee?: number;

  @ApiPropertyOptional({
    description: 'Whether Cash-on-Delivery is available for this area/tier.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'codAvailable must be true or false' })
  codAvailable?: boolean;
}
