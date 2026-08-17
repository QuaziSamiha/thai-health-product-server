import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  MinLength,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CreateProfileDto } from './create-profile.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsThaiPhone } from '../../../common/decorators/validation/is-thai-phone.decorator';
import { TransformThaiPhone } from '../../../common/decorators/transformation/transform-thai-phone.decorator';

//* EMAIL/PASSWORD REGISTRATION ONLY — DELIBERATELY HAS NO authProvider/
//* providerId FIELDS. THIS ENDPOINT IS PUBLIC AND UNAUTHENTICATED, SO IT
//* MUST NEVER LET A CALLER SELF-ASSERT AN OAUTH IDENTITY; OAUTH ACCOUNTS ARE
//* ONLY EVER CREATED VIA AuthService.socialAuth's VERIFIED-TOKEN FLOW.
//*
//* FOR THE SAME REASON THERE IS NO `security` SUB-OBJECT HERE: UserSecurity's
//* assignedIp IS AN ADMIN-ASSIGNED IP ALLOWLIST VALUE FOR INTERNAL/VENDOR
//* RESTRICTED ACCESS, AND A SELF-REGISTERED VALUE WOULD DEFEAT THAT CONTROL
//* THE MOMENT ANYTHING CONSULTS IT. IT IS SET ONLY THROUGH THE ADMIN-GUARDED
//* PATCH /user/update-user-security/:id — SEE UpdateUserSecurityDto. THE
//* GLOBAL ValidationPipe RUNS WITH forbidNonWhitelisted, SO A LEGACY CLIENT
//* STILL POSTING `security` GETS A LOUD 400 RATHER THAN A SILENT STRIP.
export class CreateUserDto {
  @ApiProperty({
    description: 'The email address of the user',
    example: 'quazisamiha@gmail.com',
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Email must be at most 100 characters long' })
  //* CASE-INSENSITIVE UNIQUENESS IS ENFORCED BY ALWAYS STORING/COMPARING
  //* LOWERCASE — SEE UserRepository's email LOOKUPS.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email!: string;
  // @IsUnique(['User', 'email'])

  @ApiProperty({
    description: 'The password of the user',
    example: 'Password@123',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
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
}
