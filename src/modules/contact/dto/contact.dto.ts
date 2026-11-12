import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsInternationalPhone } from '../../../common/decorators/validation/is-international-phone.decorator';
import { PaginationQueryDto } from '../../../shared/pagination';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

//* AN EMPTY STRING FROM AN OPTIONAL INPUT MEANS "NOT PROVIDED"
const trimToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

// ─── Contact Info (admin-edited singleton) ───────────────────────────────────

export class UpdateContactInfoDto {
  @ApiProperty({ example: '+66 2 123 4567', maxLength: 50 })
  @Transform(trim)
  @IsNotEmpty({ message: 'Hotline is required' })
  @IsString({ message: 'Hotline must be a valid text string' })
  @MaxLength(50, { message: 'Hotline cannot exceed 50 characters' })
  hotline!: string;

  @ApiPropertyOptional({ example: '@thaihealth', maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Line ID must be a valid text string' })
  @MaxLength(100, { message: 'Line ID cannot exceed 100 characters' })
  lineId?: string;

  @ApiProperty({ example: 'support@example.com', maxLength: 255 })
  @Transform(trim)
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email address' })
  @MaxLength(255, { message: 'Email cannot exceed 255 characters' })
  email!: string;

  @ApiProperty({ example: 'Get in touch', maxLength: 255 })
  @Transform(trim)
  @IsNotEmpty({ message: 'Heading is required' })
  @IsString({ message: 'Heading must be a valid text string' })
  @MaxLength(255, { message: 'Heading cannot exceed 255 characters' })
  heading!: string;

  @ApiProperty({ example: 'We usually reply within one business day.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'Description is required' })
  @IsString({ message: 'Description must be a valid text string' })
  @MaxLength(5000, { message: 'Description cannot exceed 5000 characters' })
  description!: string;
}

// ─── Contact Message (public form) ───────────────────────────────────────────

export class CreateContactMessageDto {
  @ApiProperty({ example: 'Somchai Jaidee', maxLength: 150 })
  @Transform(trim)
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a valid text string' })
  @MaxLength(150, { message: 'Name cannot exceed 150 characters' })
  name!: string;

  @ApiProperty({ example: 'somchai@example.com', maxLength: 255 })
  @Transform(trim)
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email address' })
  @MaxLength(255, { message: 'Email cannot exceed 255 characters' })
  email!: string;

  //* ANY COUNTRY: "+<country code>…" IS CHECKED AGAINST THAT COUNTRY'S
  //* NUMBERING PLAN; A NUMBER WITHOUT A COUNTRY CODE IS TREATED AS THAI
  @ApiPropertyOptional({
    example: '+44 20 7946 0958',
    description:
      'Optional. Any country — include the country code; numbers without one are treated as Thai (e.g. 0812345678).',
  })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsInternationalPhone()
  @MaxLength(20, { message: 'Phone cannot exceed 20 characters' })
  phone?: string;

  @ApiProperty({ example: 'Do you ship to Chiang Mai?', maxLength: 5000 })
  @Transform(trim)
  @IsNotEmpty({ message: 'Message is required' })
  @IsString({ message: 'Message must be a valid text string' })
  @MaxLength(5000, { message: 'Message cannot exceed 5000 characters' })
  message!: string;
}

export class ContactMessageQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by read state', example: false })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @Type(() => Boolean)
  @IsBoolean({ message: 'isRead must be true or false' })
  isRead?: boolean;
}
