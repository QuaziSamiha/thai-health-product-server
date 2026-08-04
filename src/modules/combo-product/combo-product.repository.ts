import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import {
  CategoryProductStatus,
  StockStatus,
} from '../../generated/prisma/enums';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';
import {
  COMBO_PRODUCT_SELECT_ADMIN,
  COMBO_PRODUCT_SELECT_PUBLIC,
} from './combo-product.select';
import type { ComboSortField } from './dto/all-combos-query.dto';
import type { PublicComboSortField } from './dto/published-combos-query.dto';

//* ALREADY-VALIDATED ADMIN LIST FILTERS — PULLING THEM OFF THE QUERY DTO IS
//* THE SERVICE'S JOB, SO THIS ONLY BUILDS THE PRISMA FILTER. sortBy IS SAFE TO
//* INTERPOLATE INTO orderBy BECAUSE AllCombosQueryDto WHITELISTS ITS VALUES.
//* MIRRORS StorefrontListFilters IN product.repository.ts.
export interface AdminComboListFilters {
  status?: CategoryProductStatus;
  stockStatus?: StockStatus;
  isFeatured?: boolean;
  sortBy?: ComboSortField;
}

//* SAME IDEA AS AdminComboListFilters, SCOPED TO THE ONE FILTER THE PUBLIC
//* LIST EXPOSES. VISIBILITY ITSELF IS NOT A FILTER HERE — publicVisibilityWhere()
//* IS ALWAYS APPLIED, NOT CONDITIONAL ON ANYTHING THE CALLER PASSES.
export interface PublicComboListFilters {
  isFeatured?: boolean;
  sortBy?: PublicComboSortField;
}

@Injectable()
export class ComboProductRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  // ─── Reads — Single Lookups (role-based) ────────────────────────────────────

  async findByIdAdmin(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboProduct.findUnique({
      where: { id },
      select: COMBO_PRODUCT_SELECT_ADMIN,
    });
  }

  async findBySlugAdmin(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboProduct.findUnique({
      where: { slug },
      select: COMBO_PRODUCT_SELECT_ADMIN,
    });
  }

  async findByTitle(title: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboProduct.findUnique({
      where: { title },
      select: COMBO_PRODUCT_SELECT_ADMIN,
    });
  }

  /** Uniqueness checks — `sku`/`barcode` are unique columns on the model. */
  async findBySku(sku: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboProduct.findUnique({
      where: { sku },
      select: { id: true, sku: true },
    });
  }

  async findByBarcode(barcode: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboProduct.findUnique({
      where: { barcode },
      select: { id: true, barcode: true },
    });
  }

  /**
   * Storefront visibility gate, applied to every public-facing read below:
   * not soft-deleted, status ACTIVE, AND published (`publishedAt <= now()`).
   * Unlike `Product`'s equivalent gate, `publishedAt` IS part of combo
   * visibility — see the "only publicly live once status = ACTIVE AND
   * publishedAt <= now()" contract on `ComboProductResponsePublicDto`, and
   * the scheduled-publish gate a combo defaults to `DRAFT` for.
   */
  private publicVisibilityWhere(): Prisma.ComboProductWhereInput {
    return {
      deletedAt: null,
      status: CategoryProductStatus.ACTIVE,
      publishedAt: { lte: new Date() },
    };
  }

  async findBySlugPublic(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboProduct.findFirst({
      where: { AND: [{ slug }, this.publicVisibilityWhere()] },
      select: COMBO_PRODUCT_SELECT_PUBLIC,
    });
  }

  /** Active, published combos, newest first — for a "Combo Deals" home section. */
  async findActiveCombosForHome(limit: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboProduct.findMany({
      where: this.publicVisibilityWhere(),
      select: COMBO_PRODUCT_SELECT_PUBLIC,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ─── Reads — Lists ───────────────────────────────────────────────────────────

  /**
   * Admin listing — every combo except soft-deleted ones, narrowed by the
   * optional status / stockStatus / isFeatured filters and sorted by a
   * whitelisted column.
   *
   * Soft-deleted rows stay out for the same reason they do in
   * `ProductRepository.findAllProductsAdmin`: leaving them in shows a delete
   * button that can only 409. Drafts, archived, and hidden combos still
   * appear — a management dashboard needs to see everything a customer
   * cannot.
   */
  async findAllCombosAdmin(
    params: PaginationQueryDto,
    filters: AdminComboListFilters = {},
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;

    //* AND-COMPOSED, NEVER SPREAD-MERGED WITH THE BASE `deletedAt` GATE — A
    //* LATER KEY CANNOT THEN SILENTLY OVERWRITE IT AND RESURRECT DELETED ROWS.
    //* SAME REASONING AS product.repository.ts's paginateStorefrontList.
    const where: Prisma.ComboProductWhereInput = {
      AND: [
        { deletedAt: null },
        ...(filters.status ? [{ status: filters.status }] : []),
        ...(filters.stockStatus ? [{ stockStatus: filters.stockStatus }] : []),
        //* EXPLICIT undefined CHECK, NOT TRUTHINESS — `isFeatured=false` IS A
        //* REAL FILTER ("SHOW ME THE NON-FEATURED ONES"), NOT AN ABSENT ONE.
        ...(filters.isFeatured !== undefined
          ? [{ isFeatured: filters.isFeatured }]
          : []),
      ],
    };

    return await this.paginationService.paginate<
      Prisma.ComboProductGetPayload<{
        select: typeof COMBO_PRODUCT_SELECT_ADMIN;
      }>,
      typeof client.comboProduct
    >(client.comboProduct, params, {
      select: COMBO_PRODUCT_SELECT_ADMIN,
      where,
      //* sku/barcode ARE SEARCHABLE HERE BUT NOT ON THE PUBLIC SIDE — AN ADMIN
      //* PASTES THEM STRAIGHT OFF A SUPPORT TICKET OR A PACKING SLIP.
      searchableFields: ['title', 'titleTh', 'slug', 'sku', 'barcode'],
      defaultSortField: filters.sortBy ?? 'createdAt',
    });
  }

  /**
   * Public storefront listing — ACTIVE, published, non-deleted combos only
   * (see `publicVisibilityWhere`), optionally narrowed to featured-only and
   * sorted by a whitelisted column. Backs the `/product` page's "Combo"
   * type filter and the home page's "Combo Deals" → "View all". Mirrors
   * `ProductRepository.paginateStorefrontList`.
   */
  async findPublishedCombos(
    params: PaginationQueryDto,
    filters: PublicComboListFilters = {},
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;

    //* publicVisibilityWhere() IS AND-COMPOSED, NEVER SPREAD-MERGED — SAME
    //* REASONING AS findAllCombosAdmin's deletedAt GATE, SO A FILTER CAN ONLY
    //* NARROW THE RESULT, NEVER WIDEN PAST WHAT VISIBILITY ALLOWS.
    const where: Prisma.ComboProductWhereInput = {
      AND: [
        this.publicVisibilityWhere(),
        ...(filters.isFeatured !== undefined
          ? [{ isFeatured: filters.isFeatured }]
          : []),
      ],
    };

    return await this.paginationService.paginate<
      Prisma.ComboProductGetPayload<{
        select: typeof COMBO_PRODUCT_SELECT_PUBLIC;
      }>,
      typeof client.comboProduct
    >(client.comboProduct, params, {
      select: COMBO_PRODUCT_SELECT_PUBLIC,
      where,
      //* NO sku HERE, UNLIKE THE ADMIN LIST — SEE THE NOTE ABOVE findAllCombosAdmin.
      searchableFields: ['title', 'titleTh', 'slug'],
      defaultSortField: filters.sortBy ?? 'createdAt',
    });
  }

  // ─── Reads — Item Bundling Validation ────────────────────────────────────────
  //* USED BY THE SERVICE TO CONFIRM EVERY BUNDLED product/variantId ACTUALLY
  //* EXISTS AND TO RESOLVE THE FALLBACK unitPrice SNAPSHOT WHEN THE CLIENT
  //* DOESN'T SUPPLY ONE. KEPT DELIBERATELY LEAN — NO GALLERY/CATEGORY JOINS.

  async findProductsByIds(ids: number[], tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    if (ids.length === 0) return [];
    return await client.product.findMany({
      where: { id: { in: ids } },
      //* type/name ARE FOR THE SIMPLE-vs-VARIABLE BUNDLING RULE AND ITS ERROR
      //* MESSAGE (SEE ComboProductService.resolveComboItems), NOT FOR PRICING.
      //* quantity FEEDS resolveComboAvailability — FOR AN UNPINNED ITEM THE
      //* PRODUCT IS ALWAYS SIMPLE, SO ITS OWN quantity IS THE BUNDLE LIMIT.
      select: {
        id: true,
        name: true,
        type: true,
        quantity: true,
        basePrice: true,
        salePrice: true,
      },
    });
  }

  async findVariantsByIds(ids: number[], tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    if (ids.length === 0) return [];
    return await client.productVariant.findMany({
      where: { id: { in: ids } },
      //* quantity FEEDS resolveComboAvailability — SEE findProductsByIds
      select: {
        id: true,
        productId: true,
        quantity: true,
        basePrice: true,
        salePrice: true,
      },
    });
  }

  // ─── Mutations ───────────────────────────────────────────────────────────────

  async createComboProduct(
    data: Omit<Prisma.ComboProductUncheckedCreateInput, 'images' | 'items'> & {
      images?: Prisma.ComboImageCreateManyComboInput[];
      items?: Prisma.ComboItemCreateManyComboInput[];
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const { images, items, ...comboData } = data;

    return await client.comboProduct.create({
      data: {
        ...comboData,
        images: images?.length ? { createMany: { data: images } } : undefined,
        items: items?.length ? { createMany: { data: items } } : undefined,
      },
      select: COMBO_PRODUCT_SELECT_ADMIN,
    });
  }

  async updateComboProduct(
    id: number,
    data: Prisma.ComboProductUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.comboProduct.update({
      where: { id },
      data,
      select: COMBO_PRODUCT_SELECT_ADMIN,
    });
  }

  /**
   * Swaps a combo's entire item list. Delete-then-insert rather than a
   * per-row merge because `combo_items` carries two unique indexes plus a
   * price-snapshot trigger — reconciling in place would have to sequence
   * updates to avoid transient collisions for no benefit, since the admin UI
   * submits the bundle as one unit. MUST run inside the caller's transaction.
   */
  async replaceComboItems(
    comboId: number,
    items: Prisma.ComboItemCreateManyComboInput[],
    tx: Prisma.TransactionClient,
  ) {
    await tx.comboItem.deleteMany({ where: { comboId } });
    if (items.length) {
      await tx.comboItem.createMany({
        data: items.map((item) => ({ ...item, comboId })),
      });
    }
  }

  /** The rows behind `deleteImageIds`, scoped to the combo so a foreign image ID can never be deleted through another combo's payload. */
  async findComboImagesByIds(
    comboId: number,
    imageIds: number[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    if (imageIds.length === 0) return [];
    return await client.comboImage.findMany({
      where: { comboId, id: { in: imageIds } },
      select: {
        id: true,
        url: true,
        thumbnailUrl: true,
        bannerUrl: true,
        iconUrl: true,
        isPrimary: true,
      },
    });
  }

  async deleteComboImages(imageIds: number[], tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    if (imageIds.length === 0) return;
    await client.comboImage.deleteMany({ where: { id: { in: imageIds } } });
  }

  async createComboImages(
    comboId: number,
    images: Prisma.ComboImageCreateManyComboInput[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    if (images.length === 0) return;
    await client.comboImage.createMany({
      data: images.map((image) => ({ ...image, comboId })),
    });
  }

  /** Highest `displayOrder` currently in a combo's gallery — new uploads append after it. */
  async findMaxImageDisplayOrder(
    comboId: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const result = await client.comboImage.aggregate({
      where: { comboId },
      _max: { displayOrder: true },
    });
    return result._max.displayOrder ?? -1;
  }

  /** Whether any image survives this edit as the cover — drives promoting a newly uploaded one. */
  async countPrimaryImages(comboId: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboImage.count({
      where: { comboId, isPrimary: true },
    });
  }

  /**
   * Rollback path for a create that failed after the row was written (e.g. a
   * later image upload), and the DB step behind the permanent-delete route.
   * `ON DELETE CASCADE` on the ComboItem/ComboImage relations removes their
   * rows automatically; it does NOT touch the actual files on disk — the
   * caller is responsible for cleaning those up (see
   * `findComboImagePathsForDeletion`).
   */
  async deleteComboProduct(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboProduct.delete({
      where: { id },
      select: { id: true },
    });
  }

  /** Gallery file paths to unlink after a hard delete — same shape/purpose as ProductRepository.findImagePathsForDeletion. */
  async findComboImagePathsForDeletion(
    id: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.comboProduct.findUnique({
      where: { id },
      select: {
        id: true,
        images: {
          select: {
            url: true,
            thumbnailUrl: true,
            bannerUrl: true,
            iconUrl: true,
          },
        },
      },
    });
  }
}
