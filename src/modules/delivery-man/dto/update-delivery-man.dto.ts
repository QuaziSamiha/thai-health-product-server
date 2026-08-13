import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  DeliveryEmploymentType,
  DeliveryVehicleType,
} from '../../../generated/prisma/enums';
import { IsThaiPhone } from '../../../common/decorators/validation/is-thai-phone.decorator';
import { TransformThaiPhone } from '../../../common/decorators/transformation/transform-thai-phone.decorator';

export class UpdateDeliveryManDto {
  @ApiPropertyOptional({ description: 'First name' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'First name must be at least 1 character long' })
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Phone number, Thai format' })
  @IsThaiPhone({
    message:
      'Phone must be a valid Thai format: 08XXXXXXXX (Mobile), 02XXXXXXX (Landline), or +66XXXXXXXXX',
  })
  @TransformThaiPhone()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    description:
      'Resubmitting this resets nidVerificationStatus back to PENDING.',
    example: '1234567890123',
  })
  @IsOptional()
  @Matches(/^\d{13}$/, { message: 'NID number must be exactly 13 digits' })
  nidNumber?: string;

  @ApiPropertyOptional({ enum: DeliveryVehicleType })
  @IsOptional()
  @IsEnum(DeliveryVehicleType)
  vehicleType?: DeliveryVehicleType;

  @ApiPropertyOptional({ description: 'License plate' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleRegistrationNo?: string;

  @ApiPropertyOptional({ description: 'Driving license number' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  drivingLicenseNo?: string;

  @ApiPropertyOptional({ description: 'Free-text delivery coverage area' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  coverageArea?: string;

  @ApiPropertyOptional({ enum: DeliveryEmploymentType })
  @IsOptional()
  @IsEnum(DeliveryEmploymentType)
  employmentType?: DeliveryEmploymentType;

  @ApiPropertyOptional({ description: 'Date joined', example: '2026-01-15' })
  @IsOptional()
  @IsDateString({}, { message: 'joinedAt must be a valid date string' })
  joinedAt?: string;

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
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'removeAvatar must be either true or false' })
  removeAvatar?: boolean;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description:
      'New NID scan/PDF. Resubmitting this resets nidVerificationStatus back to PENDING.',
  })
  @IsOptional()
  nidDocument?: Express.Multer.File;
}
