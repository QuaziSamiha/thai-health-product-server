import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { SupportType, SupportStatus } from '../../../generated/prisma/browser';
import { SupportModel } from '../../../generated/prisma/models';
import { UserMinifiedResponseDto } from '../../user/dto/user-response.dto';
import type { MinifiedUser } from '../../user/dto/user-response.dto';

export class SupportResponseDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Public-facing UUID, safe to expose in URLs and API responses',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sid!: string;

  @Expose()
  @ApiProperty({
    enum: SupportType,
    description: 'Which support/policy tab this row belongs to',
    example: SupportType.DELIVERY_POLICY,
  })
  type!: SupportType;

  @Expose()
  @ApiProperty({
    enum: SupportStatus,
    description: 'Lifecycle/visibility status',
    example: SupportStatus.ACTIVE,
  })
  status!: SupportStatus;

  @Expose()
  @ApiProperty({
    description: 'English page title',
    example: 'Delivery Policy',
  })
  title!: string;

  @Expose()
  @ApiProperty({
    description: 'URL slug, derived from title',
    example: 'delivery-policy',
  })
  slug!: string;

  @Expose()
  @ApiProperty({
    description: 'English page content',
    example: 'Orders are delivered within 3-5 business days across Thailand.',
  })
  content!: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Extra note/disclaimer rendered below the main content',
  })
  note?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai page title' })
  titleTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai page content' })
  contentTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai extra note' })
  noteTh?: string;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp when the record was created' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp of the last update' })
  updatedAt!: Date;

  @Expose()
  @ApiPropertyOptional({
    type: () => UserMinifiedResponseDto,
    description: 'Admin who created this row. null if unassigned/deleted.',
  })
  @Type(() => UserMinifiedResponseDto)
  createdByUser!: UserMinifiedResponseDto | null;

  @Expose()
  @ApiPropertyOptional({
    type: () => UserMinifiedResponseDto,
    description: 'Admin who last updated this row. null if unassigned/deleted.',
  })
  @Type(() => UserMinifiedResponseDto)
  updatedByUser!: UserMinifiedResponseDto | null;

  constructor(
    support: Partial<SupportModel> & {
      createdByUser?: MinifiedUser | null;
      updatedByUser?: MinifiedUser | null;
    },
  ) {
    this.id = support.id!;
    this.sid = support.sid!;
    this.type = support.type!;
    this.status = support.status!;
    this.title = support.title!;
    this.slug = support.slug!;
    this.content = support.content!;
    this.note = support.note ?? undefined;
    this.titleTh = support.titleTh ?? undefined;
    this.contentTh = support.contentTh ?? undefined;
    this.noteTh = support.noteTh ?? undefined;
    this.createdAt = support.createdAt!;
    this.updatedAt = support.updatedAt!;
    this.createdByUser =
      support.createdByUser && typeof support.createdByUser === 'object'
        ? new UserMinifiedResponseDto(support.createdByUser)
        : null;
    this.updatedByUser =
      support.updatedByUser && typeof support.updatedByUser === 'object'
        ? new UserMinifiedResponseDto(support.updatedByUser)
        : null;
  }
}

//* ═══════════════════════════════════════════════════════════════════════
//* PUBLIC RESPONSE — storefront view. Deliberately excludes `status`
//* (internal workflow state — only ACTIVE rows are ever queried for this
//* shape) and every audit field.
//* ═══════════════════════════════════════════════════════════════════════

export class SupportResponsePublicDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Public-facing UUID, safe to expose in URLs and API responses',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sid!: string;

  @Expose()
  @ApiProperty({
    enum: SupportType,
    description: 'Which support/policy tab this row belongs to',
    example: SupportType.DELIVERY_POLICY,
  })
  type!: SupportType;

  @Expose()
  @ApiProperty({
    description: 'English page title',
    example: 'Delivery Policy',
  })
  title!: string;

  @Expose()
  @ApiProperty({
    description: 'URL slug, derived from title',
    example: 'delivery-policy',
  })
  slug!: string;

  @Expose()
  @ApiProperty({ description: 'English page content' })
  content!: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Extra note/disclaimer rendered below the main content',
  })
  note?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai page title' })
  titleTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai page content' })
  contentTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai extra note' })
  noteTh?: string;

  constructor(support: Partial<SupportModel>) {
    this.id = support.id!;
    this.sid = support.sid!;
    this.type = support.type!;
    this.title = support.title!;
    this.slug = support.slug!;
    this.content = support.content!;
    this.note = support.note ?? undefined;
    this.titleTh = support.titleTh ?? undefined;
    this.contentTh = support.contentTh ?? undefined;
    this.noteTh = support.noteTh ?? undefined;
  }
}
