import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  CategoryProductStatus,
  StockStatus,
} from '../../../generated/prisma/browser';
import {
  ComboProductModel,
  ComboImageModel,
} from '../../../generated/prisma/models';
import {
  MinifiedUser,
  UserMinifiedResponseDto,
  toPrice,
  toSeoMetadataDto,
  ComboSeoMetadataDto,
} from './combo-product-shared.dto';
import { ComboImageResponseDto } from './combo-image-response.dto';
import {
  ComboItemResponseDto,
  ComboItemInput,
} from './combo-item-response.dto';

export { UserMinifiedResponseDto };
export type { MinifiedUser };
export { ComboImageResponseDto } from './combo-image-response.dto';
export {
  ComboItemResponseDto,
  ComboItemProductResponseDto,
  ComboItemVariantResponseDto,
} from './combo-item-response.dto';

//* NOTE: `@nestjs/swagger`'s `OmitType` was tried for
//* `ComboProductResponsePublicDto` to de-duplicate the admin/public fields
//* below, but was reverted — same as product-response.dto.ts — it generates
//* a class whose synthetic constructor does NOT call the base class's real
//* constructor (verified empirically), so `super(combo)` would silently
//* drop the data and leave every field unset. Two independent classes,
//* sharing only the pure helpers from `combo-product-shared.dto.ts`, is the
//* correct and actually-safe approach given that these are response DTOs
//* built with `new Dto(rawPrismaRow)` and real field-mapping logic, not
//* request DTOs instantiated via `plainToInstance`.

type ComboProductResponseInput = Partial<ComboProductModel> & {
  images?: Partial<ComboImageModel>[] | null;
  items?: ComboItemInput[] | null;
};

//* ═══════════════════════════════════════════════════════════════════════
//* ADMIN RESPONSE — full detail for dashboard/management use. Includes the
//* raw workflow `status` and the full audit trail. Never return this DTO
//* from a public/unauthenticated route.
//* ═══════════════════════════════════════════════════════════════════════

export class ComboProductResponseDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Public-facing UUID, safe to expose in URLs and API responses',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  sid!: string;

  @Expose()
  @ApiProperty({
    enum: CategoryProductStatus,
    enumName: 'CategoryProductStatus',
    description: 'Lifecycle/visibility status of the combo',
    example: CategoryProductStatus.DRAFT,
  })
  status!: CategoryProductStatus;

  @Expose()
  @ApiProperty({
    description: 'Combo title in English',
    example: 'Wellness Starter Bundle',
  })
  title!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Combo title in Thai' })
  titleTh?: string;

  @Expose()
  @ApiProperty({
    description: 'URL-friendly slug auto-generated from the English title',
    example: 'wellness-starter-bundle',
  })
  slug!: string;

  @Expose()
  @ApiPropertyOptional({
    description: "SKU of the bundle itself — not derived from its items' SKUs",
    example: 'CMB-WELL-01',
  })
  sku?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'EAN/UPC barcode for POS/warehouse scanning',
    example: '8850001234567',
  })
  barcode?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Short summary for cards/listings' })
  shortDescription?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Short summary in Thai' })
  shortDescTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Long-form description in English' })
  description?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Long-form description in Thai' })
  descriptionTh?: string;

  @Expose()
  @ApiProperty({
    description: 'Sum-of-parts display price, computed from bundled items',
    example: 1850.0,
    type: 'number',
    format: 'float',
  })
  totalPrice!: number;

  @Expose()
  @ApiProperty({
    description: 'The bundle offer price the customer pays',
    example: 1499.0,
    type: 'number',
    format: 'float',
  })
  comboPrice!: number;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Landed cost of the bundle, for margin reporting against `comboPrice`. Admin-only.',
    example: 900.0,
    type: 'number',
    format: 'float',
  })
  costPrice?: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Promotion window start' })
  startsAt?: Date;

  @Expose()
  @ApiPropertyOptional({ description: 'Promotion window end' })
  endsAt?: Date;

  @Expose()
  @ApiProperty({
    description: 'Whether this combo is promoted in featured sections',
    example: false,
  })
  isFeatured!: boolean;

  @Expose()
  @ApiProperty({
    description:
      'How many complete bundles the current component stock can assemble — the MIN across items of floor(item stock / item quantity), NOT a sum. Fully derived: never accepted from the client. A combo holds no inventory of its own, so this is a live view of its parts, not a warehouse count.',
    example: 7,
  })
  availableQuantity!: number;

  @Expose()
  @ApiPropertyOptional({
    description:
      'How many bundles the admin put on sale — the cap on the whole promotion. The one availability field that is NOT derived. Null means no cap: sell whatever component stock allows.',
    example: 20,
  })
  offeredQuantity?: number;

  @Expose()
  @ApiProperty({
    description:
      'How many bundles have actually been sold. Incremented when an order claims the combo and given back if that order is cancelled, failed, or returned. Once this reaches `offeredQuantity` the combo is forced INACTIVE automatically.',
    example: 12,
  })
  soldQuantity!: number;

  @Expose()
  @ApiProperty({
    enum: StockStatus,
    enumName: 'StockStatus',
    description:
      'Derived from the *sellable* count — `offeredQuantity` null ? `availableQuantity` : min(availableQuantity, max(offeredQuantity - soldQuantity, 0)). OUT_OF_STOCK at 0, LOW_STOCK from 1 up to `lowStockThreshold`, IN_STOCK above it. A sold-out capped offer reads OUT_OF_STOCK even with plenty of component stock behind it.',
    example: StockStatus.IN_STOCK,
  })
  stockStatus!: StockStatus;

  @Expose()
  @ApiProperty({
    description:
      'Bundle count at or below which the combo reports LOW_STOCK, down to 1',
    example: 10,
  })
  lowStockThreshold!: number;

  @Expose()
  @ApiPropertyOptional({ type: () => ComboSeoMetadataDto })
  seoMetadata?: ComboSeoMetadataDto;

  @Expose()
  @ApiProperty({
    type: () => [ComboImageResponseDto],
    description: 'Combo gallery images',
  })
  images!: ComboImageResponseDto[];

  @Expose()
  @ApiProperty({
    type: () => [ComboItemResponseDto],
    description: 'Products/variants bundled into this combo',
  })
  items!: ComboItemResponseDto[];

  @Expose()
  @ApiProperty({ description: 'ISO timestamp when the record was created' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp of the last update' })
  updatedAt!: Date;

  @Expose()
  @ApiPropertyOptional({
    description: 'Soft-delete marker — non-null once the combo is retired',
  })
  deletedAt?: Date;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Scheduled-publish gate. A combo is only publicly live once `status = ACTIVE` AND `publishedAt <= now()`',
  })
  publishedAt?: Date;

  @Expose()
  @ApiPropertyOptional({ type: () => UserMinifiedResponseDto })
  createdByUser?: UserMinifiedResponseDto;

  @Expose()
  @ApiPropertyOptional({ type: () => UserMinifiedResponseDto })
  updatedByUser?: UserMinifiedResponseDto;

  @Expose()
  @ApiPropertyOptional({
    type: () => UserMinifiedResponseDto,
    description: 'Who soft-deleted this combo — paired with `deletedAt`',
  })
  deletedByUser?: UserMinifiedResponseDto;

  constructor(
    combo: ComboProductResponseInput & {
      createdByUser?: MinifiedUser | null;
      updatedByUser?: MinifiedUser | null;
      deletedByUser?: MinifiedUser | null;
    },
    baseUrl?: string,
  ) {
    this.id = combo.id!;
    this.sid = combo.sid!;
    this.status = combo.status!;
    this.title = combo.title!;
    this.titleTh = combo.titleTh ?? undefined;
    this.slug = combo.slug!;
    this.sku = combo.sku ?? undefined;
    this.barcode = combo.barcode ?? undefined;
    this.shortDescription = combo.shortDescription ?? undefined;
    this.shortDescTh = combo.shortDescTh ?? undefined;
    this.description = combo.description ?? undefined;
    this.descriptionTh = combo.descriptionTh ?? undefined;
    this.totalPrice = Number(combo.totalPrice ?? 0);
    this.comboPrice = Number(combo.comboPrice ?? 0);
    this.costPrice = toPrice(combo.costPrice);
    this.startsAt = combo.startsAt ?? undefined;
    this.endsAt = combo.endsAt ?? undefined;
    this.isFeatured = combo.isFeatured!;
    this.availableQuantity = combo.availableQuantity ?? 0;
    this.offeredQuantity = combo.offeredQuantity ?? undefined;
    this.soldQuantity = combo.soldQuantity ?? 0;
    this.stockStatus = combo.stockStatus!;
    this.lowStockThreshold = combo.lowStockThreshold!;
    this.seoMetadata = toSeoMetadataDto(combo.seoMetadata);
    this.images = (combo.images ?? []).map(
      (img) => new ComboImageResponseDto(img, baseUrl),
    );
    this.items = (combo.items ?? []).map(
      (item) => new ComboItemResponseDto(item, baseUrl),
    );
    this.createdAt = combo.createdAt!;
    this.updatedAt = combo.updatedAt!;
    this.deletedAt = combo.deletedAt ?? undefined;
    this.publishedAt = combo.publishedAt ?? undefined;
    this.createdByUser = combo.createdByUser
      ? new UserMinifiedResponseDto(combo.createdByUser)
      : undefined;
    this.updatedByUser = combo.updatedByUser
      ? new UserMinifiedResponseDto(combo.updatedByUser)
      : undefined;
    this.deletedByUser = combo.deletedByUser
      ? new UserMinifiedResponseDto(combo.deletedByUser)
      : undefined;
  }
}

//* ═══════════════════════════════════════════════════════════════════════
//* PUBLIC RESPONSE — public storefront/PDP view.
//* Deliberately excludes: `status` (internal workflow state — public routes
//* only ever query ACTIVE rows, same convention as Support's
//* SUPPORT_SELECT_PUBLIC), `createdAt`/`updatedAt`/`deletedAt`, and the
//* entire audit trail (`createdByUser`/`updatedByUser`) — never expose
//* staff/admin identity on a public endpoint.
//* ═══════════════════════════════════════════════════════════════════════

export class ComboProductResponsePublicDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Public-facing UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  sid!: string;

  @Expose()
  @ApiProperty({
    description: 'Combo title in English',
    example: 'Wellness Starter Bundle',
  })
  title!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Combo title in Thai' })
  titleTh?: string;

  @Expose()
  @ApiProperty({
    description: 'URL-friendly slug',
    example: 'wellness-starter-bundle',
  })
  slug!: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'SKU of the bundle — safe to quote in support requests',
    example: 'CMB-WELL-01',
  })
  sku?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Short summary for cards/listings' })
  shortDescription?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Short summary in Thai' })
  shortDescTh?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Long-form description in English' })
  description?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Long-form description in Thai' })
  descriptionTh?: string;

  @Expose()
  @ApiProperty({
    description:
      'Sum-of-parts display price — show with a strike-through against `comboPrice`',
    example: 1850.0,
    type: 'number',
    format: 'float',
  })
  totalPrice!: number;

  @Expose()
  @ApiProperty({
    description: 'The bundle offer price the customer pays',
    example: 1499.0,
    type: 'number',
    format: 'float',
  })
  comboPrice!: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Promotion window start' })
  startsAt?: Date;

  @Expose()
  @ApiPropertyOptional({ description: 'Promotion window end' })
  endsAt?: Date;

  @Expose()
  @ApiProperty({
    description: 'Whether this combo is promoted in featured sections',
    example: false,
  })
  isFeatured!: boolean;

  @Expose()
  @ApiProperty({
    enum: StockStatus,
    enumName: 'StockStatus',
    description:
      'Whether the bundle can currently be assembled from its items — drives the "Add to cart" / "Sold out" state. The raw bundle count is admin-only, same as Product.',
    example: StockStatus.IN_STOCK,
  })
  stockStatus!: StockStatus;

  @Expose()
  @ApiPropertyOptional({ type: () => ComboSeoMetadataDto })
  seoMetadata?: ComboSeoMetadataDto;

  @Expose()
  @ApiProperty({
    type: () => [ComboImageResponseDto],
    description: 'Combo gallery images',
  })
  images!: ComboImageResponseDto[];

  @Expose()
  @ApiProperty({
    type: () => [ComboItemResponseDto],
    description: 'Products/variants bundled into this combo',
  })
  items!: ComboItemResponseDto[];

  @Expose()
  @ApiPropertyOptional({
    description:
      'When the combo went/goes live — usable for a "New" or "Limited Time" badge',
  })
  publishedAt?: Date;

  constructor(combo: ComboProductResponseInput, baseUrl?: string) {
    this.id = combo.id!;
    this.sid = combo.sid!;
    this.title = combo.title!;
    this.titleTh = combo.titleTh ?? undefined;
    this.slug = combo.slug!;
    this.sku = combo.sku ?? undefined;
    this.shortDescription = combo.shortDescription ?? undefined;
    this.shortDescTh = combo.shortDescTh ?? undefined;
    this.description = combo.description ?? undefined;
    this.descriptionTh = combo.descriptionTh ?? undefined;
    this.totalPrice = Number(combo.totalPrice ?? 0);
    this.comboPrice = Number(combo.comboPrice ?? 0);
    this.startsAt = combo.startsAt ?? undefined;
    this.endsAt = combo.endsAt ?? undefined;
    this.isFeatured = combo.isFeatured!;
    this.stockStatus = combo.stockStatus!;
    this.seoMetadata = toSeoMetadataDto(combo.seoMetadata);
    this.images = (combo.images ?? []).map(
      (img) => new ComboImageResponseDto(img, baseUrl),
    );
    this.items = (combo.items ?? []).map(
      (item) => new ComboItemResponseDto(item, baseUrl),
    );
    this.publishedAt = combo.publishedAt ?? undefined;
  }
}

//* ═══════════════════════════════════════════════════════════════════════
//* MINIFIED — embedded in other entities: homepage "combo of the day"
//* widgets, cart lines, related-combos rails. Keep this list-shaped and
//* cheap to select; don't add fields that require extra joins — no
//* items/images array here on purpose. `thumbnailUrl` is reserved for once
//* the repository joins the primary image — safe to leave undefined
//* until then.
//* ═══════════════════════════════════════════════════════════════════════

export class ComboProductMinifiedResponseDto {
  @Expose()
  @ApiProperty({ description: 'Internal auto-increment ID', example: 1 })
  id!: number;

  @Expose()
  @ApiProperty({
    description: 'Public-facing UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  sid!: string;

  @Expose()
  @ApiProperty({
    description: 'Combo title in English',
    example: 'Wellness Starter Bundle',
  })
  title!: string;

  @Expose()
  @ApiProperty({
    description: 'URL-friendly slug',
    example: 'wellness-starter-bundle',
  })
  slug!: string;

  @Expose()
  @ApiProperty({
    description: 'The bundle offer price the customer pays',
    example: 1499.0,
    type: 'number',
    format: 'float',
  })
  comboPrice!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Sum-of-parts display price, for a "you save X" comparison',
    example: 1850.0,
    type: 'number',
    format: 'float',
  })
  totalPrice?: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Absolute URL of the primary combo image',
    example: 'http://localhost:8000/uploads/combos/gallery/abc.webp',
  })
  thumbnailUrl?: string;

  constructor(
    combo: Partial<ComboProductModel> & { thumbnailUrl?: string | null },
    baseUrl?: string,
  ) {
    this.id = combo.id!;
    this.sid = combo.sid!;
    this.title = combo.title!;
    this.slug = combo.slug!;
    this.comboPrice = Number(combo.comboPrice ?? 0);
    this.totalPrice = toPrice(combo.totalPrice);
    this.thumbnailUrl = combo.thumbnailUrl
      ? combo.thumbnailUrl.startsWith('http') || !baseUrl
        ? combo.thumbnailUrl
        : `${baseUrl}${combo.thumbnailUrl}`
      : undefined;
  }
}
