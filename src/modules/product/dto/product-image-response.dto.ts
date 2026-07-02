import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { ProductImageModel } from '../../../generated/prisma/models';

//* SHARED — PRODUCT GALLERY IMAGE. NO SENSITIVE FIELDS, SAFE FOR BOTH ADMIN
//* AND PUBLIC RESPONSES.
export class ProductImageDto {
  @Expose()
  @ApiProperty({ description: 'Image ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Full-size image URL',
    example: 'http://localhost:8000/uploads/products/gallery/abc.webp',
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
    example: 'Organic Arabica Coffee, 500g bag, front view',
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

  @Expose()
  @ApiPropertyOptional({
    description: 'Variant this image belongs to, if it is variant-specific',
    example: 4,
  })
  variantId?: number;

  constructor(image: Partial<ProductImageModel>) {
    this.id = image.id!;
    this.url = image.url!;
    this.thumbnailUrl = image.thumbnailUrl ?? undefined;
    this.bannerUrl = image.bannerUrl ?? undefined;
    this.iconUrl = image.iconUrl ?? undefined;
    this.altText = image.altText ?? undefined;
    this.displayOrder = image.displayOrder!;
    this.isPrimary = image.isPrimary!;
    this.isActive = image.isActive!;
    this.variantId = image.variantId ?? undefined;
  }
}
