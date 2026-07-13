import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { toAbsoluteUrl, toPrice } from './combo-product-shared.dto';

//* NESTED SUMMARIES BELOW ARE INTENTIONALLY MINIMAL (name/slug/price — NO
//* STOCK COUNTS, COST BASIS, OR OTHER ADMIN-ONLY FIELDS), SO A SINGLE
//* ComboItemResponseDto IS SAFE TO REUSE IN BOTH THE ADMIN AND PUBLIC COMBO
//* RESPONSES BELOW, UNLIKE Product WHICH NEEDS SEPARATE ADMIN/PUBLIC VARIANT
//* DTOS FOR ITS OWN top-level variants LIST. NEITHER SUMMARY REPEATS ITS OWN
//* `id` — THE OWNING ComboItemResponseDto ALREADY EXPOSES IT AS THE RAW
//* `productId`/`variantId` FK ONE LEVEL UP.

export type ComboItemProductInput = {
  name: string;
  slug: string;
  categoryId?: number | null;
  category?: { id: number; name: string } | null;
  images?: { url: string; isPrimary: boolean }[] | null;
};

export class ComboItemProductResponseDto {
  @Expose()
  @ApiProperty({
    description: 'Product name in English',
    example: 'Organic Arabica Coffee',
  })
  name!: string;

  @Expose()
  @ApiProperty({
    description: 'URL-friendly slug',
    example: 'organic-arabica-coffee',
  })
  slug!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Owning category ID', example: 3 })
  categoryId?: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Owning category name',
    example: 'Beauty & Anti-Aging',
  })
  categoryName?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Absolute URL of the product primary image',
    example: 'http://localhost:8000/uploads/products/gallery/abc.webp',
  })
  primaryImageUrl?: string;

  constructor(product: ComboItemProductInput, baseUrl?: string) {
    this.name = product.name;
    this.slug = product.slug;
    this.categoryId = product.category?.id ?? product.categoryId ?? undefined;
    this.categoryName = product.category?.name ?? undefined;
    const primary =
      product.images?.find((img) => img.isPrimary)?.url ??
      product.images?.[0]?.url;
    this.primaryImageUrl = toAbsoluteUrl(primary, baseUrl);
  }
}

export type ComboItemVariantInput = {
  name: string;
  slug: string;
  size?: string | null;
  basePrice: unknown;
  salePrice?: unknown;
};

export class ComboItemVariantResponseDto {
  @Expose()
  @ApiProperty({
    description: 'Variant name in English',
    example: 'Organic Royal Jelly - 60 Capsules',
  })
  name!: string;

  @Expose()
  @ApiProperty({
    description: 'URL-friendly slug',
    example: 'organic-royal-jelly-60-capsules',
  })
  slug!: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Free-text size label',
    example: '60 Capsules',
  })
  size?: string;

  @Expose()
  @ApiProperty({
    description:
      "Variant's effective price shown to the customer — `salePrice` when discounted, otherwise `basePrice`",
    example: 700.0,
    type: 'number',
    format: 'float',
  })
  price!: number;

  //* TAKES THE VARIANT'S REAL COLUMN NAMES (basePrice/salePrice) DIRECTLY —
  //* SAME SHAPE THE REPOSITORY'S select ACTUALLY PRODUCES — AND RESOLVES THE
  //* EFFECTIVE PRICE HERE, SO NO SEPARATE SERVICE-LAYER MAPPING STEP IS
  //* NEEDED JUST TO RENAME A FIELD.
  constructor(variant: ComboItemVariantInput) {
    this.name = variant.name;
    this.slug = variant.slug;
    this.size = variant.size ?? undefined;
    this.price = Number(variant.salePrice ?? variant.basePrice);
  }
}

export type ComboItemInput = {
  id: number;
  productId: number;
  variantId?: number | null;
  quantity: number;
  unitPrice?: unknown;
  displayOrder: number;
  product?: ComboItemProductInput | null;
  variant?: ComboItemVariantInput | null;
};

export class ComboItemResponseDto {
  @Expose()
  @ApiProperty({ description: 'Combo item row ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({ description: 'Bundled product ID (raw FK)', example: 12 })
  productId!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Bundled variant ID (raw FK) — omitted when unpinned',
    example: 104,
  })
  variantId?: number;

  @Expose()
  @ApiProperty({
    description: 'How many units of this product/variant per combo purchase',
    example: 1,
  })
  quantity!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Snapshot of the unit price at the time this item was bundled',
    example: 450.0,
    type: 'number',
    format: 'float',
  })
  unitPrice?: number;

  @Expose()
  @ApiProperty({
    description: 'Sort position within the combo item list',
    example: 0,
  })
  displayOrder!: number;

  @Expose()
  @ApiPropertyOptional({ type: () => ComboItemProductResponseDto })
  product?: ComboItemProductResponseDto;

  @Expose()
  @ApiPropertyOptional({ type: () => ComboItemVariantResponseDto })
  variant?: ComboItemVariantResponseDto;

  constructor(item: ComboItemInput, baseUrl?: string) {
    this.id = item.id;
    this.productId = item.productId;
    this.variantId = item.variantId ?? undefined;
    this.quantity = item.quantity;
    this.unitPrice = toPrice(item.unitPrice);
    this.displayOrder = item.displayOrder;
    this.product = item.product
      ? new ComboItemProductResponseDto(item.product, baseUrl)
      : undefined;
    this.variant = item.variant
      ? new ComboItemVariantResponseDto(item.variant)
      : undefined;
  }
}
