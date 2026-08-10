import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsThaiPhone } from '../../../common/decorators/validation/is-thai-phone.decorator';
import { TransformThaiPhone } from '../../../common/decorators/transformation/transform-thai-phone.decorator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'First name', example: 'Quazi Samiha' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'First name must be at least 1 character long' })
  @MaxLength(100, { message: 'First name must be at most 100 characters long' })
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name', example: 'Tasnim' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Last name must be at most 100 characters long' })
  lastName?: string;

  @ApiPropertyOptional({
    description:
      'The phone or telephone number (Mobile or Landline). Supports local and international formats.',
    example: '0812345678, 021234567, or +66812345678',
    minLength: 9,
    maxLength: 15,
  })
  @IsThaiPhone({
    message:
      'Phone must be a valid Thai format: 08XXXXXXXX (Mobile), 02XXXXXXX (Landline), or +66XXXXXXXXX',
  })
  @TransformThaiPhone()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Profile picture (avatar) image file',
  })
  @IsOptional()
  avatar?: Express.Multer.File;

  @ApiPropertyOptional({
    description:
      'Set to true to remove the current profile photo. Ignored if a new avatar file is also uploaded.',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'removeAvatar must be either true or false' })
  removeAvatar?: boolean;
}
