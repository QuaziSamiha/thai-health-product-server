import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  blankNumberToUndefined,
  parseBooleanInput,
  trimString,
} from '../../../common/utils/json-transform.util';

//* PARTIAL, HAND-WRITTEN RATHER THAN PartialType(CreateDeliveryServiceDto) —
//* THE CROSS-FIELD @IsGteField CHECK ON maxDeliveryDays ONLY MAKES SENSE
//* AGAINST THE INCOMING minDeliveryDays, NOT THE ROW'S EXISTING ONE, SO THAT
//* COMPARISON IS DONE IN DeliveryService INSTEAD — SEE updateExternalDeliveryService.
export class UpdateDeliveryServiceDto {
  // ─── Provider (Company) — applied to the owning DeliveryProvider ───────────

  @ApiPropertyOptional({
    description:
      "Courier company name. Renames the zone's provider — every other zone under the same provider is renamed too.",
    example: 'KEX Express',
    maxLength: 150,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Company name must be a valid text string' })
  @MaxLength(150, { message: 'Company name cannot exceed 150 characters' })
  companyName?: string;

  @ApiPropertyOptional({
    description: "Courier's contact phone number.",
    example: '+66 2 123 4567',
    maxLength: 20,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Phone number must be a valid text string' })
  @MaxLength(20, { message: 'Phone number cannot exceed 20 characters' })
  phone?: string;

  @ApiPropertyOptional({
    description: "Courier's own hub/head-office address.",
    example: 'Bangkok, Thailand',
    maxLength: 255,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Location must be a valid text string' })
  @MaxLength(255, { message: 'Location cannot exceed 255 characters' })
  officeLocation?: string;

  // ─── Zone (Coverage / Time / Fee) ───────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Delivery coverage area.',
    example: 'Bangkok, Thailand',
    maxLength: 150,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'Delivery area must be a valid text string' })
  @MaxLength(150, { message: 'Delivery area cannot exceed 150 characters' })
  areaName?: string;

  @ApiPropertyOptional({
    description: 'Fastest-case delivery time, in days.',
    example: 3,
    minimum: 0,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Minimum delivery days must be a whole number' })
  @Min(0, { message: 'Minimum delivery days cannot be negative' })
  minDeliveryDays?: number;

  @ApiPropertyOptional({
    description: 'Slowest-case delivery time, in days.',
    example: 7,
    minimum: 0,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Maximum delivery days must be a whole number' })
  @Min(0, { message: 'Maximum delivery days cannot be negative' })
  maxDeliveryDays?: number;

  @ApiPropertyOptional({
    description: 'Flat delivery charge for this area/tier.',
    example: 60.0,
    minimum: 0,
  })
  @Transform(blankNumberToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Base fee must be a valid number' })
  @Min(0, { message: 'Base fee cannot be negative' })
  baseFee?: number;

  @ApiPropertyOptional({
    description: 'Whether Cash-on-Delivery is available for this area/tier.',
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'codAvailable must be true or false' })
  codAvailable?: boolean;
}
