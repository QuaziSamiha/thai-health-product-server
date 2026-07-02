import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

//* ═══════════════════════════════════════════════════════════════════════
//* SHARED BUILDING BLOCKS — REUSED ACROSS EVERY PRODUCT RESPONSE VARIANT
//* (product-response.dto.ts, product-variant-response.dto.ts,
//* product-image-response.dto.ts)
//* ═══════════════════════════════════════════════════════════════════════

export class ProductCategoryMinifiedDto {
  @Expose()
  @ApiProperty({ description: 'Category ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Category name',
    example: 'Beauty & Anti-Aging',
  })
  name!: string;

  @Expose()
  @ApiProperty({ description: 'Category slug', example: 'beauty-anti-aging' })
  slug!: string;

  constructor(category: { id: number; name: string; slug: string }) {
    this.id = category.id;
    this.name = category.name;
    this.slug = category.slug;
  }
}

export type ProductCategoryInput = {
  id: number;
  name: string;
  slug: string;
} | null;

export class ProductDimensionsDto {
  @Expose()
  @ApiPropertyOptional({ description: 'Length, in `unit`', example: 15.5 })
  length?: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Width, in `unit`', example: 10 })
  width?: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Height, in `unit`', example: 25 })
  height?: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Unit of measurement for length/width/height',
    example: 'cm',
    enum: ['cm', 'in'],
  })
  unit?: string;
}

export class ProductSeoMetadataDto {
  @Expose()
  @ApiPropertyOptional({
    description: 'SEO <title> tag in English',
    example: 'Organic Arabica Coffee | Thai Health Product',
  })
  metaTitle?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'SEO <meta description> tag in English',
    example: 'Grown in Chiang Mai, roasted fresh weekly.',
  })
  metaDescription?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'SEO <title> tag in Thai',
    example: 'กาแฟอาราบิก้าออร์แกนิก | Thai Health Product',
  })
  metaTitleTh?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'SEO <meta description> tag in Thai',
    example: 'ปลูกที่เชียงใหม่ คั่วสดทุกสัปดาห์',
  })
  metaDescriptionTh?: string;
}

//* JSONB COLUMNS HAVE NO DB-LEVEL SCHEMA — NARROW THE UNKNOWN SHAPE HERE SO
//* SWAGGER DOCUMENTS A REAL STRUCTURE INSTEAD OF AN OPAQUE `object`
export function toDimensionsDto(
  value: unknown,
): ProductDimensionsDto | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const dto = new ProductDimensionsDto();
  dto.length = typeof raw.length === 'number' ? raw.length : undefined;
  dto.width = typeof raw.width === 'number' ? raw.width : undefined;
  dto.height = typeof raw.height === 'number' ? raw.height : undefined;
  dto.unit = typeof raw.unit === 'string' ? raw.unit : undefined;
  return dto;
}

export function toSeoMetadataDto(
  value: unknown,
): ProductSeoMetadataDto | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const dto = new ProductSeoMetadataDto();
  dto.metaTitle = typeof raw.metaTitle === 'string' ? raw.metaTitle : undefined;
  dto.metaDescription =
    typeof raw.metaDescription === 'string' ? raw.metaDescription : undefined;
  dto.metaTitleTh =
    typeof raw.metaTitleTh === 'string' ? raw.metaTitleTh : undefined;
  dto.metaDescriptionTh =
    typeof raw.metaDescriptionTh === 'string'
      ? raw.metaDescriptionTh
      : undefined;
  return dto;
}

export function toPrice(value: unknown): number | undefined {
  return value !== null && value !== undefined ? Number(value) : undefined;
}

export function toAttributes(
  value: unknown,
): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}
