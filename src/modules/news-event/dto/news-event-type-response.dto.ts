import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { NewsEventTypeModel } from '../../../generated/prisma/models';
import { UserMinifiedResponseDto } from '../../user/dto/user-response.dto';
import type { MinifiedUser } from '../../user/dto/user-response.dto';

//* ═══════════════════════════════════════════════════════════════════════
//* ADMIN RESPONSE — full detail incl. internal id, active flag, usage count
//* and audit users. Never return this from a public route.
//* ═══════════════════════════════════════════════════════════════════════

export class NewsEventTypeResponseDto {
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
  @ApiProperty({ description: 'English type name', example: 'Event' })
  name!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai type name', example: 'กิจกรรม' })
  nameTh?: string;

  @Expose()
  @ApiProperty({ description: 'URL slug, derived from name', example: 'event' })
  slug!: string;

  @Expose()
  @ApiProperty({
    description: 'Shown in the storefront filter list',
    example: true,
  })
  isActive!: boolean;

  @Expose()
  @ApiProperty({ description: 'Position in the filter list', example: 0 })
  displayOrder!: number;

  @Expose()
  @ApiProperty({
    description:
      'Number of posts (not soft-deleted) using this type. Only present on admin list/detail reads.',
    example: 12,
  })
  newsEventCount!: number;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Set when the type was archived (soft-deleted). One-way — archived types are read-only.',
  })
  deletedAt?: Date;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp when the record was created' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp of the last update' })
  updatedAt!: Date;

  @Expose()
  @ApiPropertyOptional({
    type: () => UserMinifiedResponseDto,
    description: 'Admin who created this type. null if unassigned/deleted.',
  })
  @Type(() => UserMinifiedResponseDto)
  createdByUser!: UserMinifiedResponseDto | null;

  @Expose()
  @ApiPropertyOptional({
    type: () => UserMinifiedResponseDto,
    description:
      'Admin who last updated this type. null if unassigned/deleted.',
  })
  @Type(() => UserMinifiedResponseDto)
  updatedByUser!: UserMinifiedResponseDto | null;

  constructor(
    type: Partial<NewsEventTypeModel> & {
      createdByUser?: MinifiedUser | null;
      updatedByUser?: MinifiedUser | null;
      _count?: { newsEvents: number };
    },
  ) {
    this.id = type.id!;
    this.sid = type.sid!;
    this.name = type.name!;
    this.nameTh = type.nameTh ?? undefined;
    this.slug = type.slug!;
    this.isActive = type.isActive!;
    this.displayOrder = type.displayOrder!;
    this.newsEventCount = type._count?.newsEvents ?? 0;
    this.deletedAt = type.deletedAt ?? undefined;
    this.createdAt = type.createdAt!;
    this.updatedAt = type.updatedAt!;
    this.createdByUser = type.createdByUser
      ? new UserMinifiedResponseDto(type.createdByUser)
      : null;
    this.updatedByUser = type.updatedByUser
      ? new UserMinifiedResponseDto(type.updatedByUser)
      : null;
  }
}

//* ═══════════════════════════════════════════════════════════════════════
//* PUBLIC RESPONSE — storefront filter list / post badge. No internal id,
//* active flag, counts or audit fields. Filter by `slug`.
//* ═══════════════════════════════════════════════════════════════════════

export class NewsEventTypePublicDto {
  @Expose()
  @ApiProperty({
    description: 'Public-facing UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sid!: string;

  @Expose()
  @ApiProperty({ description: 'English type name', example: 'Event' })
  name!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai type name', example: 'กิจกรรม' })
  nameTh?: string;

  @Expose()
  @ApiProperty({
    description: 'URL slug — use as the `type` filter',
    example: 'event',
  })
  slug!: string;

  constructor(type: Partial<NewsEventTypeModel>) {
    this.sid = type.sid!;
    this.name = type.name!;
    this.nameTh = type.nameTh ?? undefined;
    this.slug = type.slug!;
  }
}

//* ═══════════════════════════════════════════════════════════════════════
//* ADMIN FORM OPTION — the "Type" dropdown in the add/edit post modal.
//* Carries the internal `id` (the form submits it as typeId) but nothing
//* else the dropdown doesn't need.
//* ═══════════════════════════════════════════════════════════════════════

export class NewsEventTypeOptionDto {
  @Expose()
  @ApiProperty({ description: 'Type ID — submit as `typeId`', example: 2 })
  id!: number;

  @Expose()
  @ApiProperty({ description: 'English type name', example: 'Event' })
  name!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai type name', example: 'กิจกรรม' })
  nameTh?: string;

  constructor(type: Partial<NewsEventTypeModel>) {
    this.id = type.id!;
    this.name = type.name!;
    this.nameTh = type.nameTh ?? undefined;
  }
}
