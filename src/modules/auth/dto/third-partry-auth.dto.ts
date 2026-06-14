// src/user/dto/social-auth.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
} from 'class-validator';
import { AuthProvider } from '../../../generated/prisma/enums';

export class SocialAuthDto {
  @ApiProperty({ example: 'quazisamiha@gmail.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'Quazi Samiha' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '1029384756', description: 'Google Provider ID' })
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @ApiProperty({ example: AuthProvider.GOOGLE, enum: AuthProvider })
  @IsEnum(AuthProvider)
  @IsNotEmpty()
  provider!: AuthProvider;

  @ApiPropertyOptional({ example: 'https://lh3.googleusercontent.com/a/...' })
  @IsOptional()
  @IsString()
  image?: string;
}
