import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { NewsEventStatus } from '../../../generated/prisma/browser';
import {
  NewsEventImageModel,
  NewsEventModel,
  NewsEventTypeModel,
} from '../../../generated/prisma/models';
import { UserMinifiedResponseDto } from '../../user/dto/user-response.dto';
import type { MinifiedUser } from '../../user/dto/user-response.dto';
import { toAbsoluteUrl } from '../../../common/utils/url.util';
import { formatDisplayName } from '../../../common/utils/display-name.util';
import { NewsEventTypePublicDto } from './news-event-type-response.dto';

//* ═══════════════════════════════════════════════════════════════════════
//* SHARED PIECES
//* ═══════════════════════════════════════════════════════════════════════

export class NewsEventSeoMetadataDto {
  @Expose() @ApiPropertyOptional() metaTitle?: string;
  @Expose() @ApiPropertyOptional() metaDescription?: string;
  @Expose() @ApiPropertyOptional() metaTitleTh?: string;
  @Expose() @ApiPropertyOptional() metaDescriptionTh?: string;

  //* JSONB HAS NO DB-LEVEL SCHEMA — COPY ONLY KNOWN STRING KEYS
  static from(value: unknown): NewsEventSeoMetadataDto | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const raw = value as Record<string, unknown>;
    const pick = (key: string) =>
      typeof raw[key] === 'string' ? raw[key] : undefined;
    const dto = new NewsEventSeoMetadataDto();
    dto.metaTitle = pick('metaTitle');
    dto.metaDescription = pick('metaDescription');
    dto.metaTitleTh = pick('metaTitleTh');
    dto.metaDescriptionTh = pick('metaDescriptionTh');
    return dto;
  }
}

type ImageInput = Partial<NewsEventImageModel>;

export class NewsEventImagePublicDto {
  @Expose()
  @ApiProperty({
    example: 'https://api.example.com/uploads/news-events/images/a.webp',
  })
  url!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Resized variant, when available' })
  thumbnailUrl?: string;

  @Expose()
  @ApiPropertyOptional()
  altText?: string;

  @Expose()
  @ApiProperty({ example: true })
  isCover!: boolean;

  constructor(image: ImageInput, baseUrl?: string) {
    this.url = toAbsoluteUrl(image.url, baseUrl) ?? '';
    this.thumbnailUrl = toAbsoluteUrl(image.thumbnailUrl, baseUrl);
    this.altText = image.altText ?? undefined;
    this.isCover = image.isCover ?? false;
  }
}

//* ADMIN ADDS THE id (NEEDED FOR deleteImageIds / coverImage), ORDER AND DATE
export class NewsEventImageResponseDto extends NewsEventImagePublicDto {
  @Expose()
  @ApiProperty({ example: 12 })
  id!: number;

  @Expose()
  @ApiProperty({ example: 0 })
  displayOrder!: number;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  constructor(image: ImageInput, baseUrl?: string) {
    super(image, baseUrl);
    this.id = image.id!;
    this.displayOrder = image.displayOrder ?? 0;
    this.createdAt = image.createdAt!;
  }
}

export class NewsEventTypeMinifiedAdminDto {
  @Expose() @ApiProperty({ example: 1 }) id!: number;
  @Expose() @ApiProperty({ example: 'Event' }) name!: string;
  @Expose() @ApiPropertyOptional({ example: 'กิจกรรม' }) nameTh?: string;
  @Expose() @ApiProperty({ example: 'event' }) slug!: string;
  @Expose() @ApiProperty({ example: true }) isActive!: boolean;
  @Expose()
  @ApiProperty({
    description:
      'Type was archived — the post must move to another type to go Active',
    example: false,
  })
  isArchived!: boolean;

  constructor(type: Partial<NewsEventTypeModel>) {
    this.id = type.id!;
    this.name = type.name!;
    this.nameTh = type.nameTh ?? undefined;
    this.slug = type.slug!;
    this.isActive = type.isActive!;
    this.isArchived = Boolean(type.deletedAt);
  }
}

type AuthorInput = {
  profile?: { firstName?: string | null; lastName?: string | null } | null;
} | null;

type NewsEventInput = Partial<NewsEventModel> & {
  type?: Partial<NewsEventTypeModel> | null;
  images?: ImageInput[];
};

//* ═══════════════════════════════════════════════════════════════════════
//* ADMIN RESPONSE — everything: internal ids, status, soft-delete state,
//* timestamps, author account. Never return this from a public route.
//* ═══════════════════════════════════════════════════════════════════════

export class NewsEventResponseDto {
  @Expose() @ApiProperty({ example: 1 }) id!: number;
  @Expose() @ApiProperty() sid!: string;

  @Expose()
  @ApiProperty({ enum: NewsEventStatus, example: NewsEventStatus.ACTIVE })
  status!: NewsEventStatus;

  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty() slug!: string;
  @Expose() @ApiPropertyOptional() excerpt?: string;
  @Expose() @ApiProperty({ description: 'Rich-text HTML' }) content!: string;
  @Expose() @ApiPropertyOptional() titleTh?: string;
  @Expose() @ApiPropertyOptional() excerptTh?: string;
  @Expose() @ApiPropertyOptional() contentTh?: string;

  @Expose() @ApiPropertyOptional() startsAt?: Date;
  @Expose() @ApiPropertyOptional() endsAt?: Date;
  @Expose() @ApiPropertyOptional() location?: string;
  @Expose() @ApiPropertyOptional() locationTh?: string;

  @Expose() @ApiProperty() isFeatured!: boolean;

  @Expose()
  @ApiPropertyOptional({ type: () => NewsEventSeoMetadataDto })
  @Type(() => NewsEventSeoMetadataDto)
  seoMetadata?: NewsEventSeoMetadataDto;

  @Expose()
  @ApiProperty({ type: () => NewsEventTypeMinifiedAdminDto })
  @Type(() => NewsEventTypeMinifiedAdminDto)
  type!: NewsEventTypeMinifiedAdminDto;

  @Expose()
  @ApiPropertyOptional({
    description: 'Cover image (also present in `images`)',
  })
  @Type(() => NewsEventImageResponseDto)
  coverImage?: NewsEventImageResponseDto;

  @Expose()
  @ApiProperty({ type: () => [NewsEventImageResponseDto] })
  @Type(() => NewsEventImageResponseDto)
  images!: NewsEventImageResponseDto[];

  @Expose()
  @ApiPropertyOptional({ type: () => UserMinifiedResponseDto })
  @Type(() => UserMinifiedResponseDto)
  author!: UserMinifiedResponseDto | null;

  @Expose()
  @ApiProperty({
    description:
      'True when ACTIVE, not deleted, publishedAt has passed and its type is active — i.e. visible on the storefront right now.',
  })
  isLive!: boolean;

  @Expose() @ApiPropertyOptional() publishedAt?: Date;
  @Expose() @ApiProperty() createdAt!: Date;
  @Expose() @ApiProperty() updatedAt!: Date;
  @Expose()
  @ApiPropertyOptional({ description: 'Set when soft-deleted' })
  deletedAt?: Date;

  constructor(
    newsEvent: NewsEventInput & { author?: MinifiedUser | null },
    baseUrl?: string,
  ) {
    this.id = newsEvent.id!;
    this.sid = newsEvent.sid!;
    this.status = newsEvent.status!;
    this.title = newsEvent.title!;
    this.slug = newsEvent.slug!;
    this.excerpt = newsEvent.excerpt ?? undefined;
    this.content = newsEvent.content!;
    this.titleTh = newsEvent.titleTh ?? undefined;
    this.excerptTh = newsEvent.excerptTh ?? undefined;
    this.contentTh = newsEvent.contentTh ?? undefined;
    this.startsAt = newsEvent.startsAt ?? undefined;
    this.endsAt = newsEvent.endsAt ?? undefined;
    this.location = newsEvent.location ?? undefined;
    this.locationTh = newsEvent.locationTh ?? undefined;
    this.isFeatured = newsEvent.isFeatured ?? false;
    this.seoMetadata = NewsEventSeoMetadataDto.from(newsEvent.seoMetadata);
    this.type = new NewsEventTypeMinifiedAdminDto(newsEvent.type ?? {});
    this.images = (newsEvent.images ?? []).map(
      (image) => new NewsEventImageResponseDto(image, baseUrl),
    );
    this.coverImage = this.images.find((image) => image.isCover);
    this.author = newsEvent.author
      ? new UserMinifiedResponseDto(newsEvent.author)
      : null;
    this.publishedAt = newsEvent.publishedAt ?? undefined;
    this.createdAt = newsEvent.createdAt!;
    this.updatedAt = newsEvent.updatedAt!;
    this.deletedAt = newsEvent.deletedAt ?? undefined;
    this.isLive =
      this.status === NewsEventStatus.ACTIVE &&
      !this.deletedAt &&
      !!this.publishedAt &&
      this.publishedAt.getTime() <= Date.now() &&
      this.type.isActive;
  }
}

//* ═══════════════════════════════════════════════════════════════════════
//* PUBLIC CARD — storefront listing & "You May Also Like". Lightweight: no
//* body content, no internal id, status, timestamps or author account.
//* ═══════════════════════════════════════════════════════════════════════

export class NewsEventCardDto {
  @Expose() @ApiProperty() sid!: string;
  @Expose()
  @ApiProperty({ example: 'expanding-access-to-premium-wellness' })
  slug!: string;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiPropertyOptional() titleTh?: string;
  @Expose() @ApiPropertyOptional() excerpt?: string;
  @Expose() @ApiPropertyOptional() excerptTh?: string;
  @Expose() @ApiPropertyOptional() startsAt?: Date;
  @Expose() @ApiPropertyOptional() endsAt?: Date;
  @Expose() @ApiProperty() isFeatured!: boolean;

  @Expose()
  @ApiProperty({ description: 'Date shown on the card' })
  publishedAt!: Date;

  @Expose()
  @ApiProperty({ type: () => NewsEventTypePublicDto })
  @Type(() => NewsEventTypePublicDto)
  type!: NewsEventTypePublicDto;

  @Expose()
  @ApiPropertyOptional({ type: () => NewsEventImagePublicDto })
  @Type(() => NewsEventImagePublicDto)
  coverImage?: NewsEventImagePublicDto;

  constructor(newsEvent: NewsEventInput, baseUrl?: string) {
    this.sid = newsEvent.sid!;
    this.slug = newsEvent.slug!;
    this.title = newsEvent.title!;
    this.titleTh = newsEvent.titleTh ?? undefined;
    this.excerpt = newsEvent.excerpt ?? undefined;
    this.excerptTh = newsEvent.excerptTh ?? undefined;
    this.startsAt = newsEvent.startsAt ?? undefined;
    this.endsAt = newsEvent.endsAt ?? undefined;
    this.isFeatured = newsEvent.isFeatured ?? false;
    this.publishedAt = newsEvent.publishedAt!;
    this.type = new NewsEventTypePublicDto(newsEvent.type ?? {});
    const cover =
      newsEvent.images?.find((image) => image.isCover) ?? newsEvent.images?.[0];
    this.coverImage = cover
      ? new NewsEventImagePublicDto(cover, baseUrl)
      : undefined;
  }
}

//* ═══════════════════════════════════════════════════════════════════════
//* PUBLIC DETAIL — the detail page. Card fields + body, location, SEO,
//* gallery and the author's display name only (no email/role/status).
//* ═══════════════════════════════════════════════════════════════════════

export class NewsEventPublicDto extends NewsEventCardDto {
  @Expose() @ApiProperty({ description: 'Rich-text HTML' }) content!: string;
  @Expose() @ApiPropertyOptional() contentTh?: string;
  @Expose() @ApiPropertyOptional() location?: string;
  @Expose() @ApiPropertyOptional() locationTh?: string;

  @Expose()
  @ApiPropertyOptional({ type: () => NewsEventSeoMetadataDto })
  @Type(() => NewsEventSeoMetadataDto)
  seoMetadata?: NewsEventSeoMetadataDto;

  @Expose()
  @ApiProperty({ type: () => [NewsEventImagePublicDto] })
  @Type(() => NewsEventImagePublicDto)
  images!: NewsEventImagePublicDto[];

  @Expose()
  @ApiPropertyOptional({
    description: 'Author display name',
    example: 'Somchai P.',
  })
  authorName?: string;

  constructor(
    newsEvent: NewsEventInput & { author?: AuthorInput },
    baseUrl?: string,
  ) {
    super(newsEvent, baseUrl);
    this.content = newsEvent.content!;
    this.contentTh = newsEvent.contentTh ?? undefined;
    this.location = newsEvent.location ?? undefined;
    this.locationTh = newsEvent.locationTh ?? undefined;
    this.seoMetadata = NewsEventSeoMetadataDto.from(newsEvent.seoMetadata);
    this.images = (newsEvent.images ?? []).map(
      (image) => new NewsEventImagePublicDto(image, baseUrl),
    );
    this.authorName = formatDisplayName(newsEvent.author?.profile) ?? undefined;
  }
}
