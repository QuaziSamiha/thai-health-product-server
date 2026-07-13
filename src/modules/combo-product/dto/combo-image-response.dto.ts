import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { ComboImageModel } from '../../../generated/prisma/models';
import { toAbsoluteUrl } from './combo-product-shared.dto';

//* SHARED — COMBO GALLERY IMAGE. NO SENSITIVE FIELDS, SAFE FOR BOTH ADMIN
//* AND PUBLIC RESPONSES.
export class ComboImageResponseDto {
  @Expose()
  @ApiProperty({ description: 'Image ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Full-size image URL',
    example: 'http://localhost:8000/uploads/combos/gallery/abc.webp',
  })
  url!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Pre-resized thumbnail URL' })
  thumbnailUrl?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Pre-resized banner/hero URL' })
  bannerUrl?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Pre-resized icon URL' })
  iconUrl?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Accessibility / SEO alt text',
    example: 'Wellness Starter Bundle, hero shot',
  })
  altText?: string;

  @Expose()
  @ApiProperty({ description: 'Sort order within the gallery', example: 0 })
  displayOrder!: number;

  @Expose()
  @ApiProperty({
    description: 'Whether this is the hero/cover image',
    example: true,
  })
  isPrimary!: boolean;

  @Expose()
  @ApiProperty({
    description: 'Whether this image is currently shown',
    example: true,
  })
  isActive!: boolean;

  constructor(image: Partial<ComboImageModel>, baseUrl?: string) {
    this.id = image.id!;
    this.url = toAbsoluteUrl(image.url, baseUrl)!;
    this.thumbnailUrl = toAbsoluteUrl(image.thumbnailUrl, baseUrl);
    this.bannerUrl = toAbsoluteUrl(image.bannerUrl, baseUrl);
    this.iconUrl = toAbsoluteUrl(image.iconUrl, baseUrl);
    this.altText = image.altText ?? undefined;
    this.displayOrder = image.displayOrder!;
    this.isPrimary = image.isPrimary!;
    this.isActive = image.isActive!;
  }
}
