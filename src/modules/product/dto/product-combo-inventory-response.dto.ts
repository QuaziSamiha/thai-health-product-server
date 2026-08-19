import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  CategoryProductStatus,
  ProductType,
  StockStatus,
} from '../../../generated/prisma/browser';
import { toAbsoluteUrl } from './product-shared.dto';

//* ═══════════════════════════════════════════════════════════════════════
//* ADMIN COMBO-INVENTORY OPTION — SAME FLATTENING RULE AS
//* ProductDropdownOptionDto (ONE ENTRY PER *SELECTABLE* THING, NOT PER
//* PRODUCT ROW), SCOPED TO WHAT A COMBO MAY BUNDLE (ACTIVE PRODUCTS, ACTIVE
//* VARIANTS ONLY).
//*
//* `quantity` IS THE WHOLE STOCK STORY HERE. THIS DTO ONCE ALSO CARRIED
//* `comboQuantity` AND `availableForCombo` (quantity - comboQuantity), WHICH
//* IMPLIED PART OF THE SHELF WAS SPOKEN FOR BY OTHER COMBOS. IT NEVER WAS: A
//* COMBO RESERVES NOTHING AND DRAWS FROM THE SAME POOL A DIRECT SALE DRAWS
//* FROM, AT CHECKOUT. BOTH FIELDS WERE DROPPED IN MIGRATION
//* 20260819160000_combo_available_sold_quantity — WHILE STOCK IS > 0 THE
//* OPTION IS AVAILABLE TO BUNDLE, AT 0 IT IS OUT OF STOCK, AND THERE IS NO
//* THIRD NUMBER IN BETWEEN.
//*
//* BUILT AS ITS OWN CLASS RATHER THAN EXTENDING ProductDropdownOptionDto —
//* SEE THE NOTE ABOVE ProductResponsePublicDto IN product-response.dto.ts FOR
//* WHY THIS CODEBASE KEEPS `new Dto(row)`-STYLE RESPONSE DTOS INDEPENDENT
//* RATHER THAN INHERITING.
//* ═══════════════════════════════════════════════════════════════════════
export class ProductComboInventoryOptionDto {
  @Expose()
  @ApiProperty({ description: 'Parent product ID', example: 12 })
  productId!: number;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Variant ID — present only when this option represents a variant of a VARIABLE product; absent for a SIMPLE product option',
    example: 4,
  })
  variantId?: number;

  @Expose()
  @ApiProperty({
    description:
      "URL-friendly slug — the variant's own slug for a variant option, otherwise the product's",
    example: 'colette-collins-23-july-variant-200-ml',
  })
  slug!: string;

  @Expose()
  @ApiProperty({
    description:
      "Display name for the dropdown option — the variant's own name for a variant option, otherwise the product's",
    example: 'Colette Collins 23 July variant 200 ml',
  })
  name!: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'SKU, if one is set on the variant (or product)',
    example: 'THP-CC-200ML',
  })
  sku?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Barcode, if one is set on the variant (or product)',
    example: '8850123457',
  })
  barcode?: string;

  @Expose()
  @ApiProperty({
    enum: ProductType,
    enumName: 'ProductType',
    description:
      "The parent product's own type — SIMPLE or VARIABLE. Not a per-variant concept, so this is always the product's value regardless of which option this is.",
    example: ProductType.VARIABLE,
  })
  type!: ProductType;

  @Expose()
  @ApiProperty({
    enum: CategoryProductStatus,
    enumName: 'CategoryProductStatus',
    description:
      "The parent product's own status. Not a per-variant concept, so this is always the product's value regardless of which option this is.",
    example: CategoryProductStatus.ACTIVE,
  })
  status!: CategoryProductStatus;

  @Expose()
  @ApiProperty({
    description:
      "Current stock count — the variant's own quantity for a variant option, otherwise the product's. This is also exactly how much is available to bundle: combos reserve nothing, so no part of this figure is spoken for by another combo.",
    example: 42,
  })
  quantity!: number;

  @Expose()
  @ApiProperty({
    enum: StockStatus,
    enumName: 'StockStatus',
    description:
      "Stock badge — the variant's own stockStatus for a variant option, otherwise the product's",
    example: StockStatus.IN_STOCK,
  })
  stockStatus!: StockStatus;

  @Expose()
  @ApiPropertyOptional({
    description:
      "Absolute URL of the product's primary gallery image, falling back to the first image if none is flagged primary. Always the parent product's own image — not per-variant.",
    example: 'http://localhost:8000/uploads/products/gallery/abc.webp',
  })
  image?: string;

  @Expose()
  @ApiProperty({
    description:
      "Last modified timestamp — always the parent product's own updatedAt (ProductVariant has no timestamp column of its own).",
    example: '2026-07-26T10:15:00.000Z',
  })
  updatedAt!: Date;

  @Expose()
  @ApiPropertyOptional({
    description:
      "Cost basis for margin reporting — the variant's own costPrice for a variant option, otherwise the product's. Admin/management only.",
    example: 900.0,
    type: 'number',
    format: 'float',
  })
  costPrice?: number;

  @Expose()
  @ApiProperty({
    description:
      "List price — the variant's own basePrice for a variant option, otherwise the product's",
    example: 1500.0,
    type: 'number',
    format: 'float',
  })
  basePrice!: number;

  @Expose()
  @ApiProperty({
    description:
      "Final discounted price — the variant's own salePrice for a variant option, otherwise the product's",
    example: 1350.0,
    type: 'number',
    format: 'float',
  })
  salePrice!: number;

  constructor(
    input: {
      product: {
        id: number;
        slug: string;
        name: string;
        sku: string | null;
        barcode: string | null;
        type: ProductType;
        status: CategoryProductStatus;
        quantity: number;
        costPrice: unknown;
        basePrice: unknown;
        salePrice: unknown;
        stockStatus: StockStatus;
        images?: { url: string }[];
        updatedAt: Date;
      };
      variant?: {
        id: number;
        slug: string;
        name: string;
        sku: string | null;
        barcode: string | null;
        quantity: number;
        costPrice: unknown;
        basePrice: unknown;
        salePrice: unknown;
        stockStatus: StockStatus;
      };
    },
    baseUrl?: string,
  ) {
    this.productId = input.product.id;
    this.variantId = input.variant?.id;
    this.slug = input.variant?.slug ?? input.product.slug;
    this.name = input.variant?.name ?? input.product.name;
    this.sku = input.variant?.sku ?? input.product.sku ?? undefined;
    this.barcode = input.variant?.barcode ?? input.product.barcode ?? undefined;
    this.type = input.product.type;
    this.status = input.product.status;
    this.quantity = input.variant?.quantity ?? input.product.quantity;

    this.stockStatus = input.variant?.stockStatus ?? input.product.stockStatus;
    this.image = toAbsoluteUrl(input.product.images?.[0]?.url, baseUrl);
    this.updatedAt = input.product.updatedAt;
    const costPrice = input.variant?.costPrice ?? input.product.costPrice;
    this.costPrice =
      costPrice !== null && costPrice !== undefined
        ? Number(costPrice)
        : undefined;
    this.basePrice = Number(
      input.variant?.basePrice ?? input.product.basePrice,
    );
    this.salePrice = Number(
      input.variant?.salePrice ?? input.product.salePrice,
    );
  }
}
