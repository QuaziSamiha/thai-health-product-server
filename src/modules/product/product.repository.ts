import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import {
  CategoryProductStatus,
  ProductType,
} from '../../generated/prisma/enums';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';
import {
  PRODUCT_SELECT_ADMIN,
  PRODUCT_SELECT_PUBLIC,
  PRODUCT_SELECT_MINIFIED,
} from './product.select';
import type { ProductSortField } from './dto/active-products-query.dto';

//* ALREADY-PARSED STOREFRONT LIST FILTERS — CSV/QUERY-STRING PARSING IS THE
//* SERVICE'S JOB; sortBy IS SAFE TO INTERPOLATE INTO orderBy BECAUSE THE
//* QUERY DTO WHITELISTS ITS VALUES.
export interface StorefrontListFilters {
  categoryIds?: number[];
  type?: ProductType;
  sortBy?: ProductSortField;
}

@Injectable()
export class ProductRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  // ─── Reads — Single Lookups (role-based) ────────────────────────────────────

  async findByIdAdmin(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.product.findUnique({
      where: { id },
      select: PRODUCT_SELECT_ADMIN,
    });
  }

  async findBySlugAdmin(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.product.findUnique({
      where: { slug },
      select: PRODUCT_SELECT_ADMIN,
    });
  }

  /**
   * Storefront visibility gate, applied to every public-facing read below:
   * not soft-deleted and status ACTIVE. The `publishedAt` column still
   * exists in the DB (and is stamped on create/update), but it is
   * deliberately NOT part of public visibility — the storefront shows all
   * active products regardless of launch schedule.
   */
  private activeVisibilityWhere(): Prisma.ProductWhereInput {
    return {
      deletedAt: null,
      status: CategoryProductStatus.ACTIVE,
    };
  }

  //* THE GATE IS ALWAYS COMPOSED VIA `AND`, NEVER OBJECT-SPREAD-MERGED WITH
  //* CALLER CONDITIONS. SPREADING (`{ ...activeVisibilityWhere(), ...rest }`)
  //* LETS A LATER KEY IN `rest` SILENTLY OVERWRITE status/deletedAt IF IT
  //* EVER HAPPENS TO SHARE A FIELD NAME — `AND` MAKES THAT STRUCTURALLY
  //* IMPOSSIBLE: BOTH CONDITIONS MUST HOLD, SO A CONFLICTING CONDITION CAN
  //* ONLY NARROW THE RESULT (TO NOTHING), NEVER WIDEN IT PAST "ACTIVE".
  async findByIdPublic(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.product.findFirst({
      where: { AND: [{ id }, this.activeVisibilityWhere()] },
      select: PRODUCT_SELECT_PUBLIC,
    });
  }

  async findBySlugPublic(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.product.findFirst({
      where: { AND: [{ slug }, this.activeVisibilityWhere()] },
      select: PRODUCT_SELECT_PUBLIC,
    });
  }

  async findByIdMinified(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.product.findUnique({
      where: { id },
      select: PRODUCT_SELECT_MINIFIED,
    });
  }

  /** Existence/uniqueness check — `name` is unique on the model. */
  async findByName(name: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.product.findUnique({
      where: { name },
      select: { id: true, name: true },
    });
  }

  // ─── Reads — Lists ───────────────────────────────────────────────────────────

  async findAllProductsAdmin(
    params: PaginationQueryDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await this.paginationService.paginate<
      Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT_ADMIN }>,
      typeof client.product
    >(client.product, params, {
      select: PRODUCT_SELECT_ADMIN,
      //* SOFT-DELETED PRODUCTS STAY OUT OF THE ADMIN LIST — LEAVING THEM IN
      //* SHOWS A DELETE BUTTON THAT CAN ONLY 409 ("Product is already
      //* deleted"). MANUALLY ARCHIVED (NOT DELETED) PRODUCTS STILL APPEAR.
      where: { deletedAt: null },
      searchableFields: ['name', 'slug', 'sku', 'nameTh'],
      defaultSortField: 'createdAt',
    });
  }

  /**
   * Shared storefront list query. Callers pick the visibility gate; the
   * filters arrive already parsed (e.g. CSV splitting belongs in the
   * service) — this only builds the Prisma filter. `sortBy` is applied as
   * the orderBy column and MUST come from the query DTO's whitelist, never
   * raw user input.
   */
  private async paginateStorefrontList(
    params: PaginationQueryDto,
    filters: StorefrontListFilters,
    baseWhere: Prisma.ProductWhereInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    //* `baseWhere` (THE VISIBILITY GATE) IS COMPOSED VIA `AND`, NEVER
    //* SPREAD-MERGED WITH THE CALLER'S FILTERS — SEE THE NOTE ABOVE
    //* `findByIdPublic`. NO FILTER FIELD CAN EVER WIDEN VISIBILITY PAST
    //* WHATEVER `baseWhere` REQUIRES.
    const where: Prisma.ProductWhereInput = {
      AND: [
        baseWhere,
        ...(filters.categoryIds?.length
          ? [{ categoryId: { in: filters.categoryIds } }]
          : []),
        ...(filters.type ? [{ type: filters.type }] : []),
      ],
    };

    return await this.paginationService.paginate<
      Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT_PUBLIC }>,
      typeof client.product
    >(client.product, params, {
      select: PRODUCT_SELECT_PUBLIC,
      where,
      searchableFields: ['name', 'slug', 'sku', 'nameTh'],
      defaultSortField: filters.sortBy ?? 'createdAt',
    });
  }

  /**
   * Storefront listing — every ACTIVE, non-deleted product, optionally
   * narrowed by category IDs / type and sorted by a whitelisted column.
   */
  async findAllProductsActive(
    params: PaginationQueryDto,
    filters: StorefrontListFilters = {},
    tx?: Prisma.TransactionClient,
  ) {
    return await this.paginateStorefrontList(
      params,
      filters,
      this.activeVisibilityWhere(),
      tx,
    );
  }

  /**
   * Shared unpaginated storefront list — active products matching
   * `extraWhere`, newest first, capped at `limit`. Used for the small,
   * fixed-size sections a home/landing page needs (combos, featured,
   * best-sellers) where full pagination metadata is unnecessary overhead.
   */
  private async findActiveProductsList(
    extraWhere: Prisma.ProductWhereInput,
    limit: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    //* AND-COMPOSED, NOT SPREAD-MERGED — SAME REASONING AS `findByIdPublic`.
    return await client.product.findMany({
      where: { AND: [this.activeVisibilityWhere(), extraWhere] },
      select: PRODUCT_SELECT_PUBLIC,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Active products flagged `isFeatured`, newest first. */
  async findFeaturedProducts(limit: number, tx?: Prisma.TransactionClient) {
    return await this.findActiveProductsList({ isFeatured: true }, limit, tx);
  }

  /** Active products NOT flagged `isFeatured`, newest first. */
  async findNonFeaturedProducts(limit: number, tx?: Prisma.TransactionClient) {
    return await this.findActiveProductsList({ isFeatured: false }, limit, tx);
  }

  /**
   * "Best" products — no sales/order-volume ranking exists yet in this
   * schema, so this is the same active-product pool as everything else,
   * newest first. Swap the `orderBy` here for a real popularity metric
   * (e.g. order-line aggregation) once that data is available; callers
   * don't need to change.
   */
  async findBestProducts(limit: number, tx?: Prisma.TransactionClient) {
    return await this.findActiveProductsList({}, limit, tx);
  }

  /**
   * Lightweight source rows for the admin dropdown list: id/slug/name/sku/
   * quantity/costPrice/barcode/basePrice/salePrice for the product itself
   * plus the same for each of its variants, plus the product's own
   * type/status (variants have neither — both are product-level concepts).
   * The service flattens this into one option per variant (falling back to
   * the product row itself when it has none) — this query only fetches
   * what that flattening needs.
   */
  async findProductDropdownOptions(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.product.findMany({
      where: { deletedAt: null, status: CategoryProductStatus.ACTIVE },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        barcode: true,
        type: true,
        status: true,
        quantity: true,
        costPrice: true,
        basePrice: true,
        salePrice: true,
        stockStatus: true,
        //* ProductVariant HAS NO updatedAt COLUMN OF ITS OWN (SEE SCHEMA) — SO
        //* THIS IS ALWAYS THE PARENT PRODUCT'S OWN TIMESTAMP, SAME RULE AS
        //* type/status/image BELOW.
        updatedAt: true,
        //* PRODUCT-LEVEL GALLERY ONLY (variantId: null) — SAME IMAGE IS SHOWN
        //* FOR EVERY OPTION THIS PRODUCT CONTRIBUTES, MIRRORING type/status
        //* BELOW, WHICH ARE ALSO ALWAYS THE PRODUCT'S OWN VALUE REGARDLESS OF
        //* WHICH OPTION THIS IS. `isPrimary: 'desc'` THEN `displayOrder: 'asc'`
        //* PICKS THE PRIMARY IMAGE IF ONE IS FLAGGED, OTHERWISE FALLS BACK TO
        //* THE FIRST (DEFAULT) IMAGE IN GALLERY ORDER — take: 1 KEEPS THIS A
        //* SINGLE-ROW READ, NOT A FULL GALLERY FETCH.
        images: {
          where: { variantId: null },
          select: { url: true },
          orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
          take: 1,
        },
        variants: {
          select: {
            id: true,
            name: true,
            slug: true,
            sku: true,
            barcode: true,
            quantity: true,
            costPrice: true,
            basePrice: true,
            salePrice: true,
            stockStatus: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });
  }

  /**
   * Same flattening source as `findProductDropdownOptions`, plus
   * `comboQuantity` on the product and each variant — needed by the
   * combo-inventory endpoint to compute `availableForCombo`
   * (quantity - comboQuantity) per option. No stock filter here: the
   * "usable for a combo" condition compares two columns
   * (`quantity > comboQuantity`), which the query API can't express as a
   * `where` filter (Prisma has no field-to-field comparison operator here),
   * so it's applied by `ProductService.getProductComboInventoryOptions`
   * after the DTO — and its computed `availableForCombo` — is built.
   */
  async findProductComboInventoryOptions(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.product.findMany({
      where: { deletedAt: null, status: CategoryProductStatus.ACTIVE },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        barcode: true,
        type: true,
        status: true,
        quantity: true,
        comboQuantity: true,
        costPrice: true,
        basePrice: true,
        salePrice: true,
        stockStatus: true,
        updatedAt: true,
        images: {
          where: { variantId: null },
          select: { url: true },
          orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
          take: 1,
        },
        variants: {
          select: {
            id: true,
            name: true,
            slug: true,
            sku: true,
            barcode: true,
            quantity: true,
            comboQuantity: true,
            costPrice: true,
            basePrice: true,
            salePrice: true,
            stockStatus: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });
  }

  // ─── Mutations ───────────────────────────────────────────────────────────────

  async createProduct(
    data: Omit<Prisma.ProductUncheckedCreateInput, 'images' | 'variants'> & {
      images?: Prisma.ProductImageCreateManyProductInput[];
      variants?: Prisma.ProductVariantCreateManyProductInput[];
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const { images, variants, ...productData } = data;

    return await client.product.create({
      data: {
        ...productData,
        images: images?.length ? { createMany: { data: images } } : undefined,
        variants: variants?.length
          ? { createMany: { data: variants } }
          : undefined,
      },
      select: PRODUCT_SELECT_ADMIN,
    });
  }

  async updateProduct(
    id: number,
    data: Prisma.ProductUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.product.update({
      where: { id },
      data,
      select: PRODUCT_SELECT_ADMIN,
    });
  }

  /**
   * Soft delete: marks the product retired (`deletedAt`/`deletedBy`, status
   * ARCHIVED) and hides its whole gallery (`isActive: false` on every image —
   * product-level and variant-level alike, since both are scoped by
   * `productId`). Variants have no soft-delete field of their own — nothing
   * queries them independently of their parent product, so once the parent
   * drops out of `activeVisibilityWhere()`, its variants become unreachable
   * through the API right along with it.
   */
  async softDeleteProduct(
    id: number,
    deletedBy: number,
    tx?: Prisma.TransactionClient,
  ) {
    const run = async (client: Prisma.TransactionClient) => {
      const product = await client.product.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy,
          status: CategoryProductStatus.ARCHIVED,
        },
        select: PRODUCT_SELECT_ADMIN,
      });
      await client.productImage.updateMany({
        where: { productId: id },
        data: { isActive: false },
      });
      return product;
    };

    return tx ? run(tx) : this.withTransaction(run);
  }

  /**
   * Lean lookup used only to prepare a hard delete: just enough to confirm
   * the product exists and to collect every stored file path so the caller
   * can clean them up after. Returns `null` if the product doesn't exist.
   */
  async findImagePathsForDeletion(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.product.findUnique({
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

  /**
   * Irreversible — permanently removes the row. `ON DELETE CASCADE` on the
   * ProductImage/ProductVariant relations removes their DB rows
   * automatically; it does NOT touch the actual files on disk — the caller
   * is responsible for cleaning those up (see `findImagePathsForDeletion`).
   * Prefer `softDeleteProduct` for anything that has shipped or been ordered.
   */
  async hardDeleteProduct(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.product.delete({
      where: { id },
      select: { id: true, name: true },
    });
  }

  // ─── Mutations — Images ──────────────────────────────────────────────────────

  async createImages(
    productId: number,
    images: Prisma.ProductImageCreateManyProductInput[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.productImage.createMany({
      data: images.map((image) => ({ ...image, productId })),
    });
  }

  async findImagesByIds(ids: number[], tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.productImage.findMany({
      where: { id: { in: ids } },
      select: { id: true, url: true },
    });
  }

  async deleteImages(ids: number[], tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.productImage.deleteMany({
      where: { id: { in: ids } },
    });
  }

  /**
   * Applies a full gallery reorder: `plan[i]` is the image that belongs at
   * `displayOrder = i`, and `plan[0]` is the new primary. Existing rows are
   * updated in place (by id) and new files are inserted at their planned
   * position — the caller has already resolved uploaded file paths onto
   * each `new` entry.
   *
   * Every current primary is cleared *before* any row is set primary again,
   * sequentially (not in parallel — the transaction runs on one connection)
   * so the `product_images_one_primary_per_product` partial unique index
   * never sees two `is_primary = true` rows for the same product at once.
   */
  async reorderImages(
    productId: number,
    plan: ImageReorderPlan,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;

    await client.productImage.updateMany({
      where: { productId },
      data: { isPrimary: false },
    });

    for (let index = 0; index < plan.length; index++) {
      const entry = plan[index];
      if (entry.type === 'existing') {
        await client.productImage.update({
          //* SCOPED BY productId SO A FOREIGN IMAGE ID CAN NEVER BE UPDATED
          //* THROUGH ANOTHER PRODUCT'S PAYLOAD
          where: { id: entry.id, productId },
          data: { displayOrder: index, isPrimary: index === 0 },
        });
      }
    }

    const newImages = plan
      .map((entry, index) => ({ entry, index }))
      .filter(
        (
          x,
        ): x is {
          entry: Extract<ImageReorderPlan[number], { type: 'new' }>;
          index: number;
        } => x.entry.type === 'new',
      );
    if (newImages.length) {
      await client.productImage.createMany({
        data: newImages.map(({ entry, index }) => ({
          productId,
          url: entry.path,
          displayOrder: index,
          isPrimary: index === 0,
        })),
      });
    }
  }

  // ─── Reads — Combo References ────────────────────────────────────────────────

  /**
   * Which of the given variants are still bundled into a combo, and by which
   * combo. `combo_items_variant_id_fkey` is ON DELETE RESTRICT, so deleting
   * any of these would fail with a raw Prisma P2003 — the service calls this
   * first to reject the request with a message that names the blocking combos.
   */
  async findCombosUsingVariants(
    variantIds: number[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    if (variantIds.length === 0) return [];
    return await client.comboItem.findMany({
      where: { variantId: { in: variantIds } },
      select: {
        variantId: true,
        variant: { select: { name: true } },
        combo: { select: { id: true, title: true } },
      },
    });
  }

  // ─── Mutations — Variants ────────────────────────────────────────────────────

  /**
   * Applies a pre-computed variant reconcile plan: removes the listed IDs,
   * updates surviving variants in place (preserving their IDs and any
   * references to them), and inserts the new ones. Self-wraps in a
   * transaction when the caller doesn't already supply one, so the plan is
   * never left half-applied.
   */
  async reconcileVariants(
    productId: number,
    plan: VariantReconcilePlan,
    tx?: Prisma.TransactionClient,
  ) {
    const run = async (client: Prisma.TransactionClient) => {
      if (plan.deleteIds.length) {
        await client.productVariant.deleteMany({
          where: { productId, id: { in: plan.deleteIds } },
        });
      }
      for (const { id, data } of plan.updates) {
        await client.productVariant.update({
          //* SCOPED BY productId SO A FOREIGN VARIANT ID CAN NEVER BE UPDATED
          //* THROUGH ANOTHER PRODUCT'S PAYLOAD
          where: { id, productId },
          data,
        });
      }
      if (plan.creates.length) {
        await client.productVariant.createMany({
          data: plan.creates.map((variant) => ({ ...variant, productId })),
        });
      }
    };

    return tx ? run(tx) : this.withTransaction(run);
  }
}

//* THE SERVICE COMPUTES THIS PLAN (WHAT TO REMOVE / UPDATE / INSERT) AND THE
//* REPOSITORY ONLY EXECUTES IT — KEEPS THE MERGE RULES OUT OF THE DATA LAYER.
export interface VariantReconcilePlan {
  deleteIds: number[];
  updates: { id: number; data: Prisma.ProductVariantUncheckedUpdateInput }[];
  creates: Prisma.ProductVariantCreateManyProductInput[];
}

//* INDEX IN THIS ARRAY *IS* THE FINAL displayOrder — INDEX 0 IS THE NEW
//* PRIMARY. THE SERVICE RESOLVES dto.imageOrder's `id` / `new:<n>` TOKENS
//* INTO THIS SHAPE (ATTACHING THE ACTUAL UPLOADED PATH TO EACH `new` ENTRY)
//* SO THE REPOSITORY NEVER HAS TO KNOW ABOUT THE WIRE FORMAT.
export type ImageReorderPlan = (
  | { type: 'existing'; id: number }
  | { type: 'new'; path: string }
)[];
