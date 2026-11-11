import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PartnerRequestStatus } from '../../../generated/prisma/enums';
import { PaginationQueryDto } from '../../../shared/pagination';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

//* PUBLIC "BECOME A PARTNER" FORM SUBMISSION
export class CreatePartnerRequestDto {
  @ApiProperty({
    description: 'Contact person name',
    example: 'Somchai Jaidee',
    maxLength: 150,
  })
  @Transform(trim)
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a valid text string' })
  @MaxLength(150, { message: 'Name cannot exceed 150 characters' })
  name!: string;

  @ApiProperty({
    description: 'Company name',
    example: 'Siam Health Co., Ltd.',
    maxLength: 200,
  })
  @Transform(trim)
  @IsNotEmpty({ message: 'Company name is required' })
  @IsString({ message: 'Company name must be a valid text string' })
  @MaxLength(200, { message: 'Company name cannot exceed 200 characters' })
  companyName!: string;

  @ApiProperty({
    description: 'ID of an ACTIVE partner type',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'Please select a valid partner type' })
  @Min(1, { message: 'Please select a valid partner type' })
  partnerTypeId!: number;

  @ApiProperty({
    description: 'ID of an ACTIVE partner country',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'Please select a valid country' })
  @Min(1, { message: 'Please select a valid country' })
  partnerCountryId!: number;

  @ApiPropertyOptional({
    description: 'Optional message from the applicant',
    example: 'We would like to distribute your products in Chiang Mai.',
    maxLength: 2000,
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Message must be a valid text string' })
  @MaxLength(2000, { message: 'Message cannot exceed 2000 characters' })
  message?: string;
}

//* ADMIN WORKFLOW — MOVE A REQUEST THROUGH ITS STATUSES
export class UpdatePartnerRequestStatusDto {
  @ApiProperty({
    enum: PartnerRequestStatus,
    example: PartnerRequestStatus.CONTACTED,
  })
  @IsEnum(PartnerRequestStatus, { message: 'Please select a valid status' })
  status!: PartnerRequestStatus;
}

export class PartnerRequestQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: PartnerRequestStatus,
    description: 'Filter by status',
  })
  @IsOptional()
  @IsEnum(PartnerRequestStatus, { message: 'Please select a valid status' })
  status?: PartnerRequestStatus;

  @ApiPropertyOptional({ description: 'Filter by partner type ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Partner type ID must be a whole number' })
  @Min(1)
  partnerTypeId?: number;

  @ApiPropertyOptional({
    description: 'Filter by partner country ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Partner country ID must be a whole number' })
  @Min(1)
  partnerCountryId?: number;
}
