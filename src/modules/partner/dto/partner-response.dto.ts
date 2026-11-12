import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  PartnerOptionStatus,
  PartnerRequestStatus,
} from '../../../generated/prisma/browser';
import {
  MinifiedUser,
  UserMinifiedResponseDto,
} from '../../user/dto/user-response.dto';
import { getCountryName } from '../../../common/geography/countries';

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC DROPDOWN OPTION — id + name only
// ─────────────────────────────────────────────────────────────────────────────

export class PartnerOptionMinifiedResponseDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({ example: 'Distributor' })
  name!: string;

  constructor(option: { id: number; name: string }) {
    this.id = option.id;
    this.name = option.name;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN OPTION — PartnerType full detail
// ─────────────────────────────────────────────────────────────────────────────

export class PartnerOptionResponseDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Public-facing UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sid!: string;

  @Expose()
  @ApiProperty({ example: 'Distributor' })
  name!: string;

  @Expose()
  @ApiProperty({
    enum: PartnerOptionStatus,
    example: PartnerOptionStatus.ACTIVE,
  })
  status!: PartnerOptionStatus;

  @Expose()
  @ApiProperty({
    description: 'How many partner requests use this option',
    example: 4,
  })
  requestCount!: number;

  @Expose()
  @ApiPropertyOptional({ type: () => UserMinifiedResponseDto })
  @Type(() => UserMinifiedResponseDto)
  createdByUser?: UserMinifiedResponseDto;

  @Expose()
  @ApiPropertyOptional({ type: () => UserMinifiedResponseDto })
  @Type(() => UserMinifiedResponseDto)
  updatedByUser?: UserMinifiedResponseDto;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;

  constructor(option: {
    id: number;
    sid: string;
    name: string;
    status: PartnerOptionStatus;
    createdAt: Date;
    updatedAt: Date;
    createdByUser?: MinifiedUser | null;
    updatedByUser?: MinifiedUser | null;
    _count?: { partnerRequests: number };
  }) {
    this.id = option.id;
    this.sid = option.sid;
    this.name = option.name;
    this.status = option.status;
    this.requestCount = option._count?.partnerRequests ?? 0;
    this.createdByUser = option.createdByUser
      ? new UserMinifiedResponseDto(option.createdByUser)
      : undefined;
    this.updatedByUser = option.updatedByUser
      ? new UserMinifiedResponseDto(option.updatedByUser)
      : undefined;
    this.createdAt = option.createdAt;
    this.updatedAt = option.updatedAt;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNTRY — STATIC ISO 3166-1 DATA, NAME RESOLVED FROM THE CODE
// ─────────────────────────────────────────────────────────────────────────────

export class PartnerCountryResponseDto {
  @Expose()
  @ApiProperty({ description: 'ISO 3166-1 alpha-2 code', example: 'TH' })
  code!: string;

  @Expose()
  @ApiProperty({ description: 'English country name', example: 'Thailand' })
  name!: string;

  constructor(code: string) {
    this.code = code;
    this.name = getCountryName(code);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTNER REQUEST
// ─────────────────────────────────────────────────────────────────────────────

export class PartnerRequestResponseDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  sid!: string;

  @Expose()
  @ApiProperty({ example: 'Somchai Jaidee' })
  name!: string;

  @Expose()
  @ApiProperty({ example: 'Siam Health Co., Ltd.' })
  companyName!: string;

  @Expose()
  @ApiPropertyOptional({
    example: 'We would like to distribute your products in Chiang Mai.',
  })
  message?: string;

  @Expose()
  @ApiProperty({
    enum: PartnerRequestStatus,
    example: PartnerRequestStatus.PENDING,
  })
  status!: PartnerRequestStatus;

  @Expose()
  @ApiProperty({ type: () => PartnerOptionMinifiedResponseDto })
  @Type(() => PartnerOptionMinifiedResponseDto)
  partnerType!: PartnerOptionMinifiedResponseDto;

  @Expose()
  @ApiProperty({ type: () => PartnerCountryResponseDto })
  @Type(() => PartnerCountryResponseDto)
  country!: PartnerCountryResponseDto;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;

  constructor(request: {
    id: number;
    sid: string;
    name: string;
    companyName: string;
    message: string | null;
    status: PartnerRequestStatus;
    createdAt: Date;
    updatedAt: Date;
    countryCode: string;
    partnerType: { id: number; name: string };
  }) {
    this.id = request.id;
    this.sid = request.sid;
    this.name = request.name;
    this.companyName = request.companyName;
    this.message = request.message ?? undefined;
    this.status = request.status;
    this.partnerType = new PartnerOptionMinifiedResponseDto(
      request.partnerType,
    );
    this.country = new PartnerCountryResponseDto(request.countryCode);
    this.createdAt = request.createdAt;
    this.updatedAt = request.updatedAt;
  }
}
