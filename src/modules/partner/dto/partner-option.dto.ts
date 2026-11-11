import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PartnerOptionStatus } from '../../../generated/prisma/enums';
import { PaginationQueryDto } from '../../../shared/pagination';

//* PartnerType AND PartnerCountry ARE THE SAME SHAPE (name + status), SO ONE
//* SET OF REQUEST DTOs SERVES BOTH ADMIN-MANAGED DROPDOWN TABLES.

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePartnerOptionDto {
  @ApiProperty({
    description: 'Display name shown in the dropdown. Must be unique.',
    example: 'Distributor',
    maxLength: 100,
  })
  @Transform(trim)
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a valid text string' })
  @MaxLength(100, { message: 'Name cannot exceed 100 characters' })
  name!: string;

  @ApiPropertyOptional({
    description:
      'ACTIVE shows it on the public form, INACTIVE hides it. Defaults to ACTIVE.',
    enum: [PartnerOptionStatus.ACTIVE, PartnerOptionStatus.INACTIVE],
    default: PartnerOptionStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(PartnerOptionStatus, { message: 'Please select a valid status' })
  status?: PartnerOptionStatus;
}

export class UpdatePartnerOptionDto {
  @ApiPropertyOptional({
    description: 'New display name. Must be unique.',
    example: 'Wholesaler',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(trim)
  @IsNotEmpty({ message: 'Name cannot be empty' })
  @IsString({ message: 'Name must be a valid text string' })
  @MaxLength(100, { message: 'Name cannot exceed 100 characters' })
  name?: string;

  @ApiPropertyOptional({
    description:
      'ACTIVE or INACTIVE. Archived rows are read-only; use the delete endpoint to archive.',
    enum: PartnerOptionStatus,
  })
  @IsOptional()
  @IsEnum(PartnerOptionStatus, { message: 'Please select a valid status' })
  status?: PartnerOptionStatus;
}

export class PartnerOptionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter by status. When omitted, every row is returned (archived included).',
    enum: PartnerOptionStatus,
  })
  @IsOptional()
  @IsEnum(PartnerOptionStatus, { message: 'Please select a valid status' })
  status?: PartnerOptionStatus;
}
