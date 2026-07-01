import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { CategoryProductStatus } from '../../../generated/prisma/browser';
import { CategoryModel } from '../../../generated/prisma/models';
import {
  MinifiedUser,
  UserMinifiedResponseDto,
} from '../../user/dto/user-response.dto';

export { UserMinifiedResponseDto };
export type { MinifiedUser };

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN RESPONSE — full detail for dashboard/management use
// ─────────────────────────────────────────────────────────────────────────────

export class CategoryResponseDto {
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
    enum: CategoryProductStatus,
    description: 'Visibility/lifecycle status of the category',
    example: CategoryProductStatus.ACTIVE,
  })
  status!: CategoryProductStatus;

  @Expose()
  @ApiProperty({
    description: 'Category name in English',
    example: 'Beauty & Anti-Aging',
  })
  name!: string;

  @Expose()
  @ApiProperty({
    description: 'URL-friendly slug auto-generated from the English name',
    example: 'beauty-anti-aging',
  })
  slug!: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Long-form description in English',
    example: 'Premium skincare and anti-aging product lines.',
  })
  description?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Category display name in Thai',
    example: 'ความงามและต้านวัย',
  })
  nameTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Long-form description in Thai',
    example: 'ผลิตภัณฑ์ดูแลผิวและต้านการเสื่อมของวัย',
  })
  descriptionTh?: string;

  @Expose()
  @ApiProperty({
    description: 'Depth level in the category tree. 0 = root category.',
    example: 0,
  })
  level!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Absolute URL of the thumbnail image',
    example:
      'http://localhost:8000/uploads/categories/thumbnail-images/abc.webp',
  })
  thumbnailUrl?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Absolute URL of the hero banner image',
    example: 'http://localhost:8000/uploads/categories/banner-images/abc.webp',
  })
  bannerUrl?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Absolute URL of the icon image',
    example: 'http://localhost:8000/uploads/categories/icon-images/abc.webp',
  })
  iconUrl?: string;

  @Expose()
  @ApiProperty({
    description: 'Manual sort position for menus and lists. Lower = first.',
    example: 1,
  })
  displayOrder!: number;

  @Expose()
  @ApiProperty({
    description: 'Whether this category is promoted in featured sections',
    example: false,
  })
  isFeatured!: boolean;

  @Expose()
  @ApiProperty({
    description: 'Denormalized count of products assigned to this category',
    example: 25,
  })
  productCount!: number;

  @Expose()
  @ApiProperty({
    description: 'Number of direct child sub-categories',
    example: 5,
  })
  childrenCount!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Internal FK to the parent category',
    example: 2,
  })
  parentId?: number | null;

  // ─── SEO ───────────────────────────────────────────────────────────────────

  @Expose()
  @ApiPropertyOptional({
    description: 'SEO <title> tag in English',
    example: 'Best Beauty & Anti-Aging Products',
  })
  metaTitle?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'SEO <meta description> tag in English',
    example:
      'Explore our curated range of premium beauty and anti-aging products.',
  })
  metaDescription?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'SEO <title> tag in Thai',
    example: 'สินค้าความงามและต้านวัยที่ดีที่สุด',
  })
  metaTitleTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'SEO <meta description> tag in Thai',
    example: 'สำรวจผลิตภัณฑ์ความงามและต้านการเสื่อมของวัยระดับพรีเมียม',
  })
  metaDescriptionTh?: string;

  // ─── Audit ─────────────────────────────────────────────────────────────────

  @Expose()
  @ApiProperty({ description: 'ISO timestamp when the record was created' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp of the last update' })
  updatedAt!: Date;

  @Expose()
  @ApiPropertyOptional({
    type: () => UserMinifiedResponseDto,
    description: 'User who created this category',
  })
  @Type(() => UserMinifiedResponseDto)
  createdByUser?: UserMinifiedResponseDto;

  @Expose()
  @ApiPropertyOptional({
    type: () => UserMinifiedResponseDto,
    description: 'User who last updated this category',
  })
  @Type(() => UserMinifiedResponseDto)
  updatedByUser?: UserMinifiedResponseDto;

  // ─── Relations ─────────────────────────────────────────────────────────────

  @Expose()
  @ApiPropertyOptional({
    type: () => CategoryResponseDto,
    description: 'Parent category snapshot',
  })
  @Type(() => CategoryResponseDto)
  parent?: CategoryResponseDto | null;

  @Expose()
  @ApiPropertyOptional({
    type: () => [CategoryResponseDto],
    description: 'Direct child sub-categories',
  })
  @Type(() => CategoryResponseDto)
  children?: CategoryResponseDto[];

  constructor(
    category: Partial<CategoryModel> & {
      parent?: Partial<CategoryModel> | null;
      children?: Partial<CategoryModel>[] | null;
      createdByUser?: MinifiedUser | null;
      updatedByUser?: MinifiedUser | null;
      _count?: { children?: number; products?: number } | null;
    },
    baseUrl?: string,
  ) {
    this.id = category.id!;
    this.sid = category.sid!;
    this.status = category.status!;
    this.name = category.name!;
    this.slug = category.slug!;
    this.description = category.description ?? undefined;
    this.nameTh = category.nameTh ?? undefined;
    this.descriptionTh = category.descriptionTh ?? undefined;
    this.level = category.level!;
    this.thumbnailUrl = category.thumbnailUrl
      ? category.thumbnailUrl.startsWith('http')
        ? category.thumbnailUrl
        : `${baseUrl}${category.thumbnailUrl}`
      : undefined;
    this.bannerUrl = category.bannerUrl
      ? category.bannerUrl.startsWith('http')
        ? category.bannerUrl
        : `${baseUrl}${category.bannerUrl}`
      : undefined;
    this.iconUrl = category.iconUrl
      ? category.iconUrl.startsWith('http')
        ? category.iconUrl
        : `${baseUrl}${category.iconUrl}`
      : undefined;
    this.displayOrder = category.displayOrder!;
    this.isFeatured = category.isFeatured!;
    this.productCount = category.productCount!;
    this.childrenCount = category._count?.children ?? 0;
    this.metaTitle = category.metaTitle ?? undefined;
    this.metaDescription = category.metaDescription ?? undefined;
    this.metaTitleTh = category.metaTitleTh ?? undefined;
    this.metaDescriptionTh = category.metaDescriptionTh ?? undefined;
    this.createdAt = category.createdAt!;
    this.updatedAt = category.updatedAt!;
    this.parentId =
      category.parentId !== undefined ? category.parentId : undefined;
    this.createdByUser =
      category.createdByUser && typeof category.createdByUser === 'object'
        ? new UserMinifiedResponseDto(category.createdByUser)
        : undefined;
    this.updatedByUser =
      category.updatedByUser && typeof category.updatedByUser === 'object'
        ? new UserMinifiedResponseDto(category.updatedByUser)
        : undefined;
    this.parent = category.parent
      ? new CategoryResponseDto(category.parent, baseUrl)
      : null;
    this.children = category.children
      ? category.children.map(
          (child) => new CategoryResponseDto(child, baseUrl),
        )
      : [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER RESPONSE — minimal, safe for public/authenticated customer use
// Excludes: audit fields, SEO metadata, displayOrder, admin user trails
// ─────────────────────────────────────────────────────────────────────────────

class CategoryMinifiedDto {
  @Expose()
  @ApiProperty({ description: 'Category ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Category name in English',
    example: 'Beauty & Anti-Aging',
  })
  name!: string;

  @Expose()
  @ApiProperty({ description: 'URL slug', example: 'beauty-anti-aging' })
  slug!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Thumbnail image URL' })
  thumbnailUrl?: string;

  constructor(category: Partial<CategoryModel>, baseUrl?: string) {
    this.id = category.id!;
    this.name = category.name!;
    this.slug = category.slug!;
    this.thumbnailUrl = category.thumbnailUrl
      ? category.thumbnailUrl.startsWith('http')
        ? category.thumbnailUrl
        : `${baseUrl}${category.thumbnailUrl}`
      : undefined;
  }
}

export class CategoryResponseCustomerDto {
  @Expose()
  @ApiProperty({
    description: 'Public UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sid!: string;

  @Expose()
  @ApiProperty({
    description: 'Category name in English',
    example: 'Beauty & Anti-Aging',
  })
  name!: string;

  @Expose()
  @ApiProperty({ description: 'URL slug', example: 'beauty-anti-aging' })
  slug!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Description in English' })
  description?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Category name in Thai',
    example: 'ความงามและต้านวัย',
  })
  nameTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Description in Thai' })
  descriptionTh?: string;

  @Expose()
  @ApiProperty({ description: 'Depth in category tree. 0 = root.', example: 0 })
  level!: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Thumbnail image URL' })
  thumbnailUrl?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Banner image URL' })
  bannerUrl?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Icon image URL' })
  iconUrl?: string;

  @Expose()
  @ApiProperty({ description: 'Whether featured on homepage', example: false })
  isFeatured!: boolean;

  @Expose()
  @ApiProperty({
    description: 'Number of products in this category',
    example: 25,
  })
  productCount!: number;

  @Expose()
  @ApiProperty({ description: 'Number of child sub-categories', example: 3 })
  childrenCount!: number;

  @Expose()
  @ApiPropertyOptional({
    type: () => CategoryMinifiedDto,
    description: 'Parent category (for breadcrumb navigation)',
  })
  @Type(() => CategoryMinifiedDto)
  parent?: CategoryMinifiedDto | null;

  @Expose()
  @ApiPropertyOptional({
    type: () => [CategoryMinifiedDto],
    description: 'Direct child sub-categories',
  })
  @Type(() => CategoryMinifiedDto)
  children?: CategoryMinifiedDto[];

  constructor(
    category: Partial<CategoryModel> & {
      parent?: Partial<CategoryModel> | null;
      children?: Partial<CategoryModel>[] | null;
      _count?: { children?: number } | null;
    },
    baseUrl?: string,
  ) {
    this.sid = category.sid!;
    this.name = category.name!;
    this.slug = category.slug!;
    this.description = category.description ?? undefined;
    this.nameTh = category.nameTh ?? undefined;
    this.descriptionTh = category.descriptionTh ?? undefined;
    this.level = category.level!;
    this.thumbnailUrl = category.thumbnailUrl
      ? category.thumbnailUrl.startsWith('http')
        ? category.thumbnailUrl
        : `${baseUrl}${category.thumbnailUrl}`
      : undefined;
    this.bannerUrl = category.bannerUrl
      ? category.bannerUrl.startsWith('http')
        ? category.bannerUrl
        : `${baseUrl}${category.bannerUrl}`
      : undefined;
    this.iconUrl = category.iconUrl
      ? category.iconUrl.startsWith('http')
        ? category.iconUrl
        : `${baseUrl}${category.iconUrl}`
      : undefined;
    this.isFeatured = category.isFeatured!;
    this.productCount = category.productCount!;
    this.childrenCount = category._count?.children ?? 0;
    this.parent = category.parent
      ? new CategoryMinifiedDto(category.parent, baseUrl)
      : null;
    this.children = category.children
      ? category.children.map(
          (child) => new CategoryMinifiedDto(child, baseUrl),
        )
      : [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED — minimal root category list (used in nav/menu dropdowns)
// ─────────────────────────────────────────────────────────────────────────────

export class RootActiveCategoryResponseDto {
  @Expose()
  @ApiProperty({ description: 'Category ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Category name in English',
    example: 'Beauty & Anti-Aging',
  })
  name!: string;

  constructor(category: Partial<CategoryModel>) {
    this.id = category.id!;
    this.name = category.name!;
  }
}
