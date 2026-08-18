import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  CategoryProductStatus,
  StockStatus,
} from '../../../generated/prisma/browser';

//* ═══════════════════════════════════════════════════════════════════════
//* RESPONSE FOR THE SINGLE-VARIANT STATUS ENDPOINT.
//*
//* NOT ProductResponseDto: re-sending the whole product (every variant,
//* the gallery, the audit trail) to report a one-column change is a lot of
//* payload for a toggle. What the admin actually needs back is the three
//* things this write MOVED — the variant's own state, the parent's
//* re-derived sellable stock, and which combos the change knocked out —
//* since only the first of those is visible from the request itself.
//* ═══════════════════════════════════════════════════════════════════════

//* ONE COMBO THE STATUS CHANGE PUSHED TO 0 ASSEMBLABLE BUNDLES. ONLY EVER
//* NON-LIVE COMBOS APPEAR HERE — A LIVE ONE WOULD HAVE REJECTED THE
//* DEACTIVATION OUTRIGHT (409), SEE ProductService.updateVariantStatus.
export class AffectedComboDto {
  @Expose()
  @ApiProperty({ description: 'Combo ID', example: 7 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Combo title',
    example: 'Royal Jelly Starter Bundle',
  })
  title!: string;

  @Expose()
  @ApiProperty({
    enum: CategoryProductStatus,
    enumName: 'CategoryProductStatus',
    description: "The combo's own workflow status",
    example: CategoryProductStatus.DRAFT,
  })
  status!: CategoryProductStatus;

  constructor(combo: {
    id: number;
    title: string;
    status: CategoryProductStatus;
  }) {
    this.id = combo.id;
    this.title = combo.title;
    this.status = combo.status;
  }
}

export class VariantStatusChangeResponseDto {
  @Expose()
  @ApiProperty({ description: 'Variant ID', example: 4 })
  variantId!: number;

  @Expose()
  @ApiProperty({
    description: 'Variant name in English',
    example: 'Organic Royal Jelly - 60 Capsules',
  })
  variantName!: string;

  @Expose()
  @ApiProperty({
    enum: CategoryProductStatus,
    enumName: 'CategoryProductStatus',
    description: "The variant's status after this write",
    example: CategoryProductStatus.INACTIVE,
  })
  variantStatus!: CategoryProductStatus;

  @Expose()
  @ApiProperty({
    description:
      'Whether this variant is the one pre-selected on the PDP. Retiring the default hands the flag to a surviving ACTIVE variant, so this can come back `false` on a variant that was `true` in the request.',
    example: false,
  })
  isDefault!: boolean;

  @Expose()
  @ApiProperty({ description: 'Parent product ID', example: 12 })
  productId!: number;

  @Expose()
  @ApiProperty({
    description: 'Parent product name',
    example: 'Organic Royal Jelly',
  })
  productName!: string;

  @Expose()
  @ApiProperty({
    description:
      "How many of the product's variants are ACTIVE after this write. Never 0 — the last ACTIVE variant of a product cannot be retired.",
    example: 2,
  })
  activeVariantCount!: number;

  @Expose()
  @ApiProperty({
    description:
      "The product's re-derived sellable stock: the sum of the quantity of its ACTIVE variants only. Retiring a variant lowers this even though no physical stock moved.",
    example: 40,
  })
  totalStock!: number;

  @Expose()
  @ApiProperty({
    enum: StockStatus,
    enumName: 'StockStatus',
    description: "The product's stock badge, re-derived from `totalStock`",
    example: StockStatus.IN_STOCK,
  })
  stockStatus!: StockStatus;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Combos that bundle this variant and can no longer be assembled because of this change (their `quantity` is now 0 / OUT_OF_STOCK). Empty on reactivation, and empty when the variant is in no combos. Live combos never appear here — retiring a variant a live combo depends on is rejected with a 409 instead.',
    type: [AffectedComboDto],
  })
  affectedCombos!: AffectedComboDto[];

  constructor(input: {
    variant: {
      id: number;
      name: string;
      variantStatus: CategoryProductStatus;
      isDefault: boolean;
    };
    product: {
      id: number;
      name: string;
      totalStock: number;
      stockStatus: StockStatus;
    };
    activeVariantCount: number;
    affectedCombos: {
      id: number;
      title: string;
      status: CategoryProductStatus;
    }[];
  }) {
    this.variantId = input.variant.id;
    this.variantName = input.variant.name;
    this.variantStatus = input.variant.variantStatus;
    this.isDefault = input.variant.isDefault;
    this.productId = input.product.id;
    this.productName = input.product.name;
    this.activeVariantCount = input.activeVariantCount;
    this.totalStock = input.product.totalStock;
    this.stockStatus = input.product.stockStatus;
    this.affectedCombos = input.affectedCombos.map(
      (combo) => new AffectedComboDto(combo),
    );
  }
}
