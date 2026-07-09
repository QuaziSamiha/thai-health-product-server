import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  HomeContentType,
  HomeContentStatus,
} from '../../../generated/prisma/browser';
import { HomeModel } from '../../../generated/prisma/models';
import { UserMinifiedResponseDto } from '../../user/dto/user-response.dto';
import type { MinifiedUser } from '../../user/dto/user-response.dto';

export class HomeResponseDto {
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
    enum: HomeContentType,
    description: 'Which landing-page section this row belongs to',
    example: HomeContentType.HERO_SLIDER,
  })
  type!: HomeContentType;

  @Expose()
  @ApiProperty({
    enum: HomeContentStatus,
    description: 'Lifecycle/visibility status',
    example: HomeContentStatus.ACTIVE,
  })
  status!: HomeContentStatus;

  @Expose()
  @ApiPropertyOptional({
    description: 'English slide heading (HERO_SLIDER only)',
    example: 'Better Health Made Simple',
  })
  heading?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'English body copy (HERO_SLIDER only)',
    example:
      'Science-backed healthcare products designed to support your daily health',
  })
  bodyText?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai heading' })
  headingTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai body copy' })
  bodyTextTh?: string;

  @Expose()
  @ApiProperty({
    description: 'Cover image URL',
    example: 'https://cdn.example.com/hero/couple.jpg',
  })
  imageUrl!: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Video source URL (OVC only)',
    example: 'https://cdn.example.com/ovc/ad.mp4',
  })
  videoUrl?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Click-through target',
    example: '/products',
  })
  redirectUrl?: string;

  @Expose()
  @ApiProperty({
    description: 'Manual sort position within this content type',
    example: 0,
  })
  displayOrder!: number;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp when the record was created' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp of the last update' })
  updatedAt!: Date;

  @Expose()
  @ApiPropertyOptional({
    type: () => UserMinifiedResponseDto,
    description: 'Admin who created this row',
  })
  @Type(() => UserMinifiedResponseDto)
  createdByUser?: UserMinifiedResponseDto | null;

  @Expose()
  @ApiPropertyOptional({
    type: () => UserMinifiedResponseDto,
    description: 'Admin who last updated this row',
  })
  @Type(() => UserMinifiedResponseDto)
  updatedByUser?: UserMinifiedResponseDto | null;

  constructor(
    home: Partial<HomeModel> & {
      createdByUser?: MinifiedUser | null;
      updatedByUser?: MinifiedUser | null;
    },
    baseUrl?: string,
  ) {
    this.id = home.id!;
    this.sid = home.sid!;
    this.type = home.type!;
    this.status = home.status!;
    this.heading = home.heading ?? undefined;
    this.bodyText = home.bodyText ?? undefined;
    this.headingTh = home.headingTh ?? undefined;
    this.bodyTextTh = home.bodyTextTh ?? undefined;
    this.imageUrl = home.imageUrl
      ? home.imageUrl.startsWith('http')
        ? home.imageUrl
        : `${baseUrl}${home.imageUrl}`
      : home.imageUrl!;
    this.videoUrl = home.videoUrl ?? undefined;
    this.redirectUrl = home.redirectUrl ?? undefined;
    this.displayOrder = home.displayOrder!;
    this.createdAt = home.createdAt!;
    this.updatedAt = home.updatedAt!;
    this.createdByUser =
      home.createdByUser && typeof home.createdByUser === 'object'
        ? new UserMinifiedResponseDto(home.createdByUser)
        : null;
    this.updatedByUser =
      home.updatedByUser && typeof home.updatedByUser === 'object'
        ? new UserMinifiedResponseDto(home.updatedByUser)
        : null;
  }
}

//* ═══════════════════════════════════════════════════════════════════════
//* PUBLIC RESPONSE — storefront/landing-page view. Deliberately excludes
//* `status` (internal workflow state — only ACTIVE rows are ever queried
//* for this shape) and every audit field.
//* ═══════════════════════════════════════════════════════════════════════

export class HomeResponsePublicDto {
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
    enum: HomeContentType,
    description: 'Which landing-page section this row belongs to',
    example: HomeContentType.HERO_SLIDER,
  })
  type!: HomeContentType;

  @Expose()
  @ApiPropertyOptional({
    description: 'English slide heading (HERO_SLIDER only)',
  })
  heading?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'English body copy (HERO_SLIDER only)' })
  bodyText?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai heading' })
  headingTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thai body copy' })
  bodyTextTh?: string;

  @Expose()
  @ApiProperty({
    description: 'Cover image URL',
    example: 'https://cdn.example.com/hero/couple.jpg',
  })
  imageUrl!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Video source URL (OVC only)' })
  videoUrl?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Click-through target' })
  redirectUrl?: string;

  @Expose()
  @ApiProperty({
    description: 'Manual sort position within this content type',
    example: 0,
  })
  displayOrder!: number;

  constructor(home: Partial<HomeModel>, baseUrl?: string) {
    this.id = home.id!;
    this.sid = home.sid!;
    this.type = home.type!;
    this.heading = home.heading ?? undefined;
    this.bodyText = home.bodyText ?? undefined;
    this.headingTh = home.headingTh ?? undefined;
    this.bodyTextTh = home.bodyTextTh ?? undefined;
    this.imageUrl = home.imageUrl
      ? home.imageUrl.startsWith('http')
        ? home.imageUrl
        : `${baseUrl}${home.imageUrl}`
      : home.imageUrl!;
    this.videoUrl = home.videoUrl ?? undefined;
    this.redirectUrl = home.redirectUrl ?? undefined;
    this.displayOrder = home.displayOrder!;
  }
}
