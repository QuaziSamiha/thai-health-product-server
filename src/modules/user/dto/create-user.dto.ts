import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  MinLength,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateProfileDto } from './create-profile.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateUserSecurityDto } from './create-user-security.dto';
import { IsThaiPhone } from '../../../common/decorators/validation/is-thai-phone.decorator';
import { TransformThaiPhone } from '../../../common/decorators/transformation/transform-thai-phone.decorator';

//* EMAIL/PASSWORD REGISTRATION ONLY — DELIBERATELY HAS NO authProvider/
//* providerId FIELDS. THIS ENDPOINT IS PUBLIC AND UNAUTHENTICATED, SO IT
//* MUST NEVER LET A CALLER SELF-ASSERT AN OAUTH IDENTITY; OAUTH ACCOUNTS ARE
//* ONLY EVER CREATED VIA AuthService.socialAuth's VERIFIED-TOKEN FLOW.
export class CreateUserDto {
  @ApiProperty({
    description: 'The email address of the user',
    example: 'quazisamiha@gmail.com',
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Email must be at most 100 characters long' })
  email!: string;
  // @IsUnique(['User', 'email'])

  @ApiProperty({
    description: 'The password of the user',
    example: 'Password@123',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 8 characters long' })
  @MaxLength(255, { message: 'Password must be at most 255 characters long' })
  password!: string;

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

  @ApiProperty({ description: 'User profile information' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => CreateProfileDto)
  profile!: CreateProfileDto;

  @ApiPropertyOptional({ description: 'User security information' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateUserSecurityDto)
  security?: CreateUserSecurityDto;
}
