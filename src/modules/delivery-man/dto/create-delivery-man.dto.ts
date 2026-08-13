import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  DeliveryEmploymentType,
  DeliveryVehicleType,
} from '../../../generated/prisma/enums';
import { IsThaiPhone } from '../../../common/decorators/validation/is-thai-phone.decorator';
import { TransformThaiPhone } from '../../../common/decorators/transformation/transform-thai-phone.decorator';

export class CreateDeliveryManDto {
  @ApiProperty({
    description: 'Email address',
    example: 'somchai.rakdee@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Email must be at most 100 characters long' })
  email!: string;

  @ApiProperty({ description: 'First name', example: 'Somchai' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: 'First name must be at least 1 character long' })
  @MaxLength(100, { message: 'First name must be at most 100 characters long' })
  firstName!: string;

  @ApiPropertyOptional({ description: 'Last name', example: 'Rakdee' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Last name must be at most 100 characters long' })
  lastName?: string;

  @ApiPropertyOptional({
    description:
      'The phone or telephone number (Mobile or Landline). Supports local and international formats.',
    example: '0812345678, 021234567, or +66812345678',
  })
  @IsThaiPhone({
    message:
      'Phone must be a valid Thai format: 08XXXXXXXX (Mobile), 02XXXXXXX (Landline), or +66XXXXXXXXX',
  })
  @TransformThaiPhone()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    description:
      'Thai national ID number (13 digits). Format-only validation — no checksum check yet.',
    example: '1234567890123',
  })
  @IsOptional()
  @Matches(/^\d{13}$/, { message: 'NID number must be exactly 13 digits' })
  nidNumber?: string;

  @ApiPropertyOptional({ enum: DeliveryVehicleType })
  @IsOptional()
  @IsEnum(DeliveryVehicleType)
  vehicleType?: DeliveryVehicleType;

  @ApiPropertyOptional({ description: 'License plate', example: 'กก 1234' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleRegistrationNo?: string;

  @ApiPropertyOptional({ description: 'Driving license number' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  drivingLicenseNo?: string;

  @ApiPropertyOptional({
    description: 'Free-text description of the delivery coverage area',
    example: 'Bangkok, Thailand',
  })
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
    type: 'string',
    format: 'binary',
    description: 'NID scan/PDF for KYC review',
  })
  @IsOptional()
  nidDocument?: Express.Multer.File;
}
