import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  blankNumberToUndefined,
  parseBooleanInput,
  trimString,
} from '../../../common/utils/json-transform.util';
import { trimToNull } from './news-event-transform.util';

export class CreateNewsEventTypeDto {
  @ApiProperty({
    description: 'English type name. The URL slug is derived from this.',
    example: 'Event',
    maxLength: 100,
  })
  @Transform(({ value }) => trimString(value))
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a valid text string' })
  @MaxLength(100, { message: 'Name cannot exceed 100 characters' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Thai type name, mirrors `name`.',
    example: 'กิจกรรม',
    maxLength: 100,
  })
  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString({ message: 'Thai name must be a valid text string' })
  @MaxLength(100, { message: 'Thai name cannot exceed 100 characters' })
  nameTh?: string | null;

  @ApiPropertyOptional({
    description:
      'Whether the type shows in the storefront filter list. Defaults to true.',
    default: true,
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Position in the filter list. Lower comes first.',
    default: 0,
    example: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @Transform(blankNumberToUndefined)
  @IsInt({ message: 'Display order must be a whole number' })
  @Min(0, { message: 'Display order cannot be negative' })
  displayOrder?: number;
}
