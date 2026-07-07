import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ProductRepository,
  VariantReconcilePlan,
} from './product.repository';
import { CategoryService } from '../category/category.service';
import {
  ProductResponseDto,
  ProductResponsePublicDto,
} from './dto/product-response.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PublishedProductsQueryDto } from './dto/published-products-query.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { parseStoragePath } from '../../common/utils/storage-path.util';
import { STORAGE_SERVICE_TOKEN } from '../../shared/storage/storage.constants';
import type { IStorageService } from '../../shared/storage/interfaces/storage.interface';
import { Prisma } from '../../generated/prisma/client';
import { ProductType, StockStatus } from '../../generated/prisma/enums';
import type {
  IPaginatedResult,
  PaginationQueryDto,
} from '../../shared/pagination';

const PRODUCT_IMAGE_FOLDER = 'products/gallery';

//* THE SLICE OF A STORED VARIANT THE RECONCILE LOGIC NEEDS — STRUCTURALLY
//* SATISFIED BY THE ROWS `findByIdAdmin` ALREADY LOADS.
interface ExistingVariantState {
  id: number;
  name: string;
  quantity: number;
  isDefault: boolean;
}

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryService: CategoryService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: IStorageService,
  ) {}

  async getProductBySlug(slug: string): Promise<ProductResponsePublicDto> {
    const product = await this.productRepository.findBySlugPublic(slug);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return new ProductResponsePublicDto(
      product,
      this.configService.get<string>('app.baseUrl'),
    );
  }

  /**
   * Admin listing — unlike the public storefront list, this applies no
   * visibility filter at all: drafts, archived, hidden, and soft-deleted
   * products are all included, since a management dashboard needs to see
   * everything, not just what customers can.
   */
  async getAllProducts(
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<ProductResponseDto>> {
    const paginated = await this.productRepository.findAllProductsAdmin(params);
    const baseUrl = this.configService.get<string>('app.baseUrl');
    return {
      ...paginated,
      data: paginated.data.map(
        (product) => new ProductResponseDto(product, baseUrl),
      ),
    };
  }

  /**
   * Storefront listing — the only parsing that belongs here (not in the
   * repository, per `findAllProductsPublic`'s own contract) is turning the
   * CSV `categoryIds` query param into `number[]`; everything else is passed
   * straight through to the already-filtered repository query.
   */
  async getPublishedProducts(
    query: PublishedProductsQueryDto,
  ): Promise<IPaginatedResult<ProductResponsePublicDto>> {
    const { categoryIds, productType, ...paginationParams } = query;

    const paginated = await this.productRepository.findAllProductsPublic(
      paginationParams,
      {
        categoryIds: categoryIds
          ?.split(',')
          .map((id) => Number(id.trim()))
          .filter((id) => Number.isInteger(id)),
        type: productType,
      },
    );

    const baseUrl = this.configService.get<string>('app.baseUrl');
    return {
      ...paginated,
      data: paginated.data.map(
        (product) => new ProductResponsePublicDto(product, baseUrl),
      ),
    };
  }

  /**
   * Creates a product with optional gallery images and variants.
   *
   * Order of operations matters: images are uploaded to disk *before* the DB
   * write, because the nested `images`/`variants` create needs their final
   * paths as input. If the DB write then fails, the already-uploaded files
   * are rolled back — otherwise a failed create would leave orphaned files
   * with nothing in the DB pointing at them.
   */
  async createProduct(
    userId: number,
    dto: CreateProductDto,
    images: Express.Multer.File[],
  ): Promise<ProductResponseDto> {
    await this.categoryService.assertCategoryAssignableToProduct(
      dto.categoryId,
    );

    const existingByName = await this.productRepository.findByName(dto.name);
    if (existingByName) {
      throw new ConflictException('A product with this name already exists');
    }

    const slug = generateSlug(dto.name);
    const existingBySlug = await this.productRepository.findBySlugAdmin(slug);
    if (existingBySlug) {
      throw new ConflictException(
        'A product with this name results in a duplicate slug',
      );
    }

    const uploadedPaths: string[] = [];
    try {
      for (const file of images) {
        uploadedPaths.push(await this.uploadFile(file, PRODUCT_IMAGE_FOLDER));
      }
    } catch (uploadError) {
      await Promise.all(
        uploadedPaths.map((path) => this.deleteStoredFile(path)),
      );
      throw uploadError;
    }

    try {
      const { hasVariants, quantity, totalStock, stockStatus, variants } =
        this.buildStockAndVariants(slug, dto.variants, dto.quantity);

      //* A VARIABLE PRODUCT MAY OMIT ITS OWN BASE PRICE — FALL BACK TO THE
      //* DEFAULT VARIANT'S SO LISTINGS SHOW A REAL PRICE INSTEAD OF THE
      //* COLUMN DEFAULT 0.
      const defaultVariant = variants.find((v) => v.isDefault) ?? variants[0];
      const basePrice = dto.basePrice ?? defaultVariant?.basePrice;

      const created = await this.productRepository.createProduct({
        name: dto.name,
        slug,
        nameTh: dto.nameTh,
        sku: dto.sku,
        barcode: dto.barcode,
        description: dto.description,
        descriptionTh: dto.descriptionTh,
        shortDescription: dto.shortDescription,
        shortDescTh: dto.shortDescTh,
        //* VARIABLE IS THE DEFAULT PRODUCT TYPE — FALLING THROUGH TO THE SCHEMA'S
        //* OWN COLUMN DEFAULT HERE WOULD SILENTLY CREATE A SIMPLE PRODUCT INSTEAD
        //* WHENEVER `dto.type` IS OMITTED.
        type: dto.type ?? ProductType.VARIABLE,
        status: dto.status,
        isFeatured: dto.isFeatured,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined,
        basePrice,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        salePrice: dto.salePrice,
        costPrice: dto.costPrice,
        weight: dto.weight,
        dimensions: toPlainJson(dto.dimensions),
        seoMetadata: toPlainJson(dto.seoMetadata),
        tags: dto.tags ?? [],
        dosage: dto.dosage,
        dosageTh: dto.dosageTh,
        ingredients: dto.ingredients,
        ingredientsTh: dto.ingredientsTh,
        healthBenefits: dto.healthBenefits,
        healthBenefitsTh: dto.healthBenefitsTh,
        warning: dto.warning,
        warningTh: dto.warningTh,
        storageInstructions: dto.storageInstructions,
        storageInstructionsTh: dto.storageInstructionsTh,
        origin: dto.origin,
        genericName: dto.genericName,
        categoryId: dto.categoryId,
        createdBy: userId,
        hasVariants,
        quantity,
        totalStock,
        stockStatus,
        images: uploadedPaths.map((path, index) => ({
          url: path,
          displayOrder: index,
          isPrimary: index === 0,
        })),
        variants,
      });

      return new ProductResponseDto(
        created,
        this.configService.get<string>('app.baseUrl'),
      );
    } catch (createError) {
      await Promise.all(
        uploadedPaths.map((path) => this.deleteStoredFile(path)),
      );
      throw createError;
    }
  }

  /**
   * Derives the fields that must be computed rather than taken verbatim from
   * the request: `hasVariants` (presence of `variants`), `quantity`/`totalStock`
   * (SIMPLE: `quantity` — from the request's `dto.quantity` — is authoritative
   * and `totalStock` mirrors it; VARIABLE: `quantity` is forced to 0 and
   * `totalStock` is the sum of variant stock, regardless of what the client
   * sent for `quantity`, since this invariant is what the rest of the app
   * relies on), `stockStatus` (derived from the effective stock count), and
   * each variant's own slug/stockStatus. If no variant is marked `isDefault`,
   * the first one is — the storefront always needs some variant pre-selected.
   */
  private buildStockAndVariants(
    productSlug: string,
    variantDto: CreateProductVariantDto[] | undefined,
    simpleQuantity: number | undefined,
  ): {
    hasVariants: boolean;
    quantity: number;
    totalStock: number;
    stockStatus: StockStatus;
    variants: Prisma.ProductVariantCreateManyProductInput[];
  } {
    const hasVariants = Boolean(variantDto?.length);

    if (!hasVariants) {
      const quantity = simpleQuantity ?? 0;
      return {
        hasVariants,
        quantity,
        totalStock: quantity,
        stockStatus: this.computeStockStatus(quantity),
        variants: [],
      };
    }

    const variants = variantDto!.map((variant, index) =>
      this.buildVariantInput(productSlug, variant, index),
    );
    if (!variants.some((v) => v.isDefault)) {
      variants[0].isDefault = true;
    }

    const totalStock = variants.reduce((sum, v) => sum + (v.quantity ?? 0), 0);

    return {
      hasVariants,
      quantity: 0,
      totalStock,
      stockStatus: this.computeStockStatus(totalStock),
      variants,
    };
  }

  private buildVariantInput(
    productSlug: string,
    variant: CreateProductVariantDto,
    index: number,
  ): Prisma.ProductVariantCreateManyProductInput {
    const quantity = variant.quantity ?? 0;
    const slugSeed = variant.name ?? variant.size ?? `variant-${index + 1}`;

    return {
      // Variant name/slug are unique across ALL products in the current
      // schema (not scoped per-product) — prefixing with the parent's own
      // unique slug keeps this collision-free in practice.
      name: variant.name ?? `${productSlug} ${variant.size ?? ''}`.trim(),
      slug: `${productSlug}-${generateSlug(slugSeed)}`,
      size: variant.size,
      basePrice: variant.basePrice ?? 0,
      discountType: variant.discountType,
      discountValue: variant.discountValue,
      salePrice: variant.salePrice,
      costPrice: variant.costPrice,
      quantity,
      stockStatus: this.computeStockStatus(quantity),
      sku: variant.sku,
      barcode: variant.barcode,
      weight: variant.weight,
      attributes: toPlainJson(variant.attributes) ?? {},
      isDefault: variant.isDefault ?? false,
    };
  }

  private computeStockStatus(quantity: number): StockStatus {
    return quantity > 0 ? StockStatus.IN_STOCK : StockStatus.OUT_OF_STOCK;
  }

  /**
   * Partial update. Only fields actually present in `dto` are touched —
   * everything else on the row is left exactly as it was.
   *
   * - **Name change** re-derives the slug and re-checks both for conflicts
   *   (excluding the product's own row).
   * - **New images** are *appended* to the existing gallery; existing images
   *   are only removed when explicitly listed in `deleteImageIds` (rows in
   *   the transaction, physical files best-effort after commit).
   * - **`variants`, if provided, is reconciled by `id`** (see
   *   `buildVariantReconcilePlan`): entries with an `id` update that variant
   *   in place, entries without one are created, and existing variants
   *   missing from the list are deleted — while guaranteeing at least one
   *   variant survives. Omitting `variants` entirely leaves existing
   *   variants untouched. Re-triggers the same stock invariant as
   *   `createProduct`.
   * - `reconcileVariants` + the new images + the scalar field update all run
   *   inside one transaction, so a failure partway never leaves, say, new
   *   variants committed alongside stale scalar fields.
   * - Uploaded files are rolled back if anything in the transaction fails,
   *   same as `createProduct`.
   */
  async updateProduct(
    id: number,
    userId: number,
    dto: UpdateProductDto,
    images: Express.Multer.File[],
  ): Promise<ProductResponseDto> {
    const existing = await this.productRepository.findByIdAdmin(id);
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    if (dto.categoryId !== undefined) {
      await this.categoryService.assertCategoryAssignableToProduct(
        dto.categoryId,
      );
    }

    let slug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      const nameConflict = await this.productRepository.findByName(dto.name);
      if (nameConflict && nameConflict.id !== id) {
        throw new ConflictException('A product with this name already exists');
      }
      const newSlug = generateSlug(dto.name);
      const slugConflict =
        await this.productRepository.findBySlugAdmin(newSlug);
      if (slugConflict && slugConflict.id !== id) {
        throw new ConflictException('This name results in a duplicate slug');
      }
      slug = newSlug;
    }

    //* RESOLVE IMAGE DELETIONS AGAINST THE PRODUCT'S OWN GALLERY UP FRONT —
    //* A FOREIGN OR UNKNOWN IMAGE ID FAILS THE WHOLE REQUEST BEFORE ANY
    //* FILES ARE UPLOADED OR ROWS TOUCHED.
    const requestedImageIds = [...new Set(dto.deleteImageIds ?? [])];
    const imagesToDelete = existing.images.filter((img) =>
      requestedImageIds.includes(img.id),
    );
    if (imagesToDelete.length !== requestedImageIds.length) {
      throw new BadRequestException(
        'One or more image IDs do not belong to this product',
      );
    }

    const uploadedPaths: string[] = [];
    try {
      for (const file of images) {
        uploadedPaths.push(await this.uploadFile(file, PRODUCT_IMAGE_FOLDER));
      }
    } catch (uploadError) {
      await Promise.all(
        uploadedPaths.map((path) => this.deleteStoredFile(path)),
      );
      throw uploadError;
    }

    try {
      const { fields: stockFields, variantPlan } = this.resolveStockUpdate(
        existing,
        dto,
        slug,
      );

      const updated = await this.productRepository.withTransaction(
        async (tx) => {
          if (variantPlan) {
            await this.productRepository.reconcileVariants(
              id,
              variantPlan,
              tx,
            );
          }
          if (imagesToDelete.length) {
            await this.productRepository.deleteImages(
              imagesToDelete.map((img) => img.id),
              tx,
            );
          }
          if (uploadedPaths.length) {
            const startOrder = existing.images.length;
            await this.productRepository.createImages(
              id,
              uploadedPaths.map((path, index) => ({
                url: path,
                displayOrder: startOrder + index,
                isPrimary: false,
              })),
              tx,
            );
          }
          return await this.productRepository.updateProduct(
            id,
            {
              name: dto.name,
              slug: dto.name ? slug : undefined,
              nameTh: dto.nameTh,
              sku: dto.sku,
              barcode: dto.barcode,
              description: dto.description,
              descriptionTh: dto.descriptionTh,
              shortDescription: dto.shortDescription,
              shortDescTh: dto.shortDescTh,
              type: dto.type,
              status: dto.status,
              isFeatured: dto.isFeatured,
              publishedAt: dto.publishedAt
                ? new Date(dto.publishedAt)
                : undefined,
              basePrice: dto.basePrice,
              discountType: dto.discountType,
              discountValue: dto.discountValue,
              salePrice: dto.salePrice,
              costPrice: dto.costPrice,
              weight: dto.weight,
              dimensions: toPlainJson(dto.dimensions),
              seoMetadata: toPlainJson(dto.seoMetadata),
              tags: dto.tags,
              dosage: dto.dosage,
              dosageTh: dto.dosageTh,
              ingredients: dto.ingredients,
              ingredientsTh: dto.ingredientsTh,
              healthBenefits: dto.healthBenefits,
              healthBenefitsTh: dto.healthBenefitsTh,
              warning: dto.warning,
              warningTh: dto.warningTh,
              storageInstructions: dto.storageInstructions,
              storageInstructionsTh: dto.storageInstructionsTh,
              origin: dto.origin,
              genericName: dto.genericName,
              categoryId: dto.categoryId,
              updatedBy: userId,
              ...stockFields,
            },
            tx,
          );
        },
      );

      //* ROWS ARE GONE — REMOVE THE PHYSICAL FILES BEST-EFFORT, SAME
      //* RATIONALE AS hardDeleteProduct: A FAILED UNLINK MUST NOT ROLL BACK
      //* A COMMITTED UPDATE.
      await Promise.all(
        imagesToDelete.flatMap((img) =>
          [img.url, img.thumbnailUrl, img.bannerUrl, img.iconUrl]
            .filter((path): path is string => Boolean(path))
            .map((path) => this.deleteStoredFile(path)),
        ),
      );

      return new ProductResponseDto(
        updated,
        this.configService.get<string>('app.baseUrl'),
      );
    } catch (updateError) {
      await Promise.all(
        uploadedPaths.map((path) => this.deleteStoredFile(path)),
      );
      throw updateError;
    }
  }

  /**
   * Recomputes `hasVariants`/`quantity`/`totalStock`/`stockStatus` only when
   * the update actually touches `type`, `quantity`, or `variants` — otherwise
   * these cached fields are left out of the update payload entirely (Prisma
   * ignores `undefined` keys, so they stay whatever they already were).
   * Reuses the exact same invariant as `createProduct`.
   *
   * Known limitation: flipping `type` between SIMPLE and VARIABLE without
   * also providing `variants` does not itself create/remove variant rows —
   * that's a separate, more destructive operation this method intentionally
   * doesn't attempt implicitly.
   */
  private resolveStockUpdate(
    current: {
      type: ProductType;
      quantity: number;
      variants: ExistingVariantState[];
    },
    dto: UpdateProductDto,
    productSlug: string,
  ): {
    fields: Partial<Prisma.ProductUncheckedUpdateInput>;
    variantPlan?: VariantReconcilePlan;
  } {
    const touchesStock =
      dto.type !== undefined ||
      dto.quantity !== undefined ||
      dto.variants !== undefined;
    if (!touchesStock) {
      return { fields: {} };
    }

    const effectiveType = dto.type ?? current.type;

    if (effectiveType === ProductType.VARIABLE) {
      if (dto.variants !== undefined) {
        const { plan, totalStock } = this.buildVariantReconcilePlan(
          productSlug,
          current.variants,
          dto.variants,
        );
        return {
          fields: {
            hasVariants: true,
            quantity: 0,
            totalStock,
            stockStatus: this.computeStockStatus(totalStock),
          },
          variantPlan: plan,
        };
      }
      return { fields: { hasVariants: true, quantity: 0 } };
    }

    const quantity = dto.quantity ?? current.quantity;
    return {
      fields: {
        hasVariants: false,
        quantity,
        totalStock: quantity,
        stockStatus: this.computeStockStatus(quantity),
      },
    };
  }

  /**
   * Turns the requested variant list into a reconcile plan against the
   * product's current variants. The list is the desired FINAL state:
   *
   * - An entry **with `id`** updates that variant in place — only the fields
   *   actually present in the entry are touched, the variant row (and its
   *   id) survives.
   * - An entry **without `id`** creates a new variant.
   * - An existing variant **absent from the list** is deleted.
   *
   * Guards: an `id` that doesn't belong to this product is a 404, a
   * duplicated `id` is a 400, and the DTO's `@ArrayMinSize(1)` upstream
   * guarantees the final set is never empty. Exactly one variant ends up
   * `isDefault` — an explicit flag in the payload wins, an existing default
   * that survives is kept, otherwise the first entry is promoted.
   *
   * Also returns `totalStock` for the final set (payload quantity when
   * given, the variant's current quantity otherwise) so the caller can
   * refresh the product's cached stock fields.
   */
  private buildVariantReconcilePlan(
    productSlug: string,
    existingVariants: ExistingVariantState[],
    requested: UpdateProductVariantDto[],
  ): { plan: VariantReconcilePlan; totalStock: number } {
    const existingById = new Map(existingVariants.map((v) => [v.id, v]));

    const seenIds = new Set<number>();
    for (const entry of requested) {
      if (entry.id === undefined) continue;
      if (!existingById.has(entry.id)) {
        throw new NotFoundException(
          `Variant with id ${entry.id} does not exist on this product`,
        );
      }
      if (seenIds.has(entry.id)) {
        throw new BadRequestException(
          `Variant id ${entry.id} appears more than once`,
        );
      }
      seenIds.add(entry.id);
    }

    const deleteIds = existingVariants
      .filter((variant) => !seenIds.has(variant.id))
      .map((variant) => variant.id);

    //* RESOLVE THE FINAL isDefault FLAGS ACROSS THE WHOLE SET UP FRONT:
    //* PAYLOAD FLAG > SURVIVING EXISTING FLAG > NONE. THEN FORCE EXACTLY ONE
    //* DEFAULT — THE FIRST FLAGGED ENTRY WINS, OR THE FIRST ENTRY OVERALL IF
    //* NOBODY IS FLAGGED (E.G. THE OLD DEFAULT WAS JUST DELETED).
    const intendedDefaults = requested.map(
      (entry) =>
        entry.isDefault ??
        (entry.id !== undefined
          ? existingById.get(entry.id)!.isDefault
          : false),
    );
    const firstDefault = intendedDefaults.indexOf(true);
    const defaultIndex = firstDefault === -1 ? 0 : firstDefault;

    const updates: VariantReconcilePlan['updates'] = [];
    const creates: VariantReconcilePlan['creates'] = [];
    let totalStock = 0;

    requested.forEach((entry, index) => {
      const isDefault = index === defaultIndex;
      const existing =
        entry.id !== undefined ? existingById.get(entry.id)! : undefined;

      if (existing) {
        totalStock += entry.quantity ?? existing.quantity;
        updates.push({
          id: existing.id,
          //* undefined FIELDS ARE SKIPPED BY PRISMA — ONLY WHAT THE PAYLOAD
          //* ACTUALLY PROVIDED (PLUS DERIVED slug/stockStatus/isDefault)
          //* GETS WRITTEN.
          data: {
            name: entry.name,
            slug:
              entry.name && entry.name !== existing.name
                ? `${productSlug}-${generateSlug(entry.name)}`
                : undefined,
            size: entry.size,
            basePrice: entry.basePrice,
            discountType: entry.discountType,
            discountValue: entry.discountValue,
            salePrice: entry.salePrice,
            costPrice: entry.costPrice,
            quantity: entry.quantity,
            stockStatus:
              entry.quantity !== undefined
                ? this.computeStockStatus(entry.quantity)
                : undefined,
            sku: entry.sku,
            barcode: entry.barcode,
            weight: entry.weight,
            attributes: toPlainJson(entry.attributes),
            isDefault,
          },
        });
      } else {
        totalStock += entry.quantity ?? 0;
        creates.push({
          ...this.buildVariantInput(productSlug, entry, index),
          isDefault,
        });
      }
    });

    return { plan: { deleteIds, updates, creates }, totalStock };
  }

  /**
   * Soft delete — retires the product (status ARCHIVED, `deletedAt`/`deletedBy`
   * set) and hides its gallery images. Reversible: nothing is destroyed.
   */
  async softDeleteProduct(id: number, deletedBy: number): Promise<void> {
    const product = await this.productRepository.findByIdAdmin(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.deletedAt) {
      throw new ConflictException('Product is already deleted');
    }

    await this.productRepository.softDeleteProduct(id, deletedBy);
  }

  /**
   * Hard delete — permanently removes the product row, its variants, and its
   * images. The DB relations cascade the row deletion for us; the physical
   * image files are cleaned up here afterward, best-effort, since a failed
   * file unlink shouldn't roll back a delete the DB has already committed.
   */
  async hardDeleteProduct(id: number): Promise<void> {
    const product = await this.productRepository.findImagePathsForDeletion(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.productRepository.hardDeleteProduct(id);

    const filePaths = product.images.flatMap((image) =>
      [image.url, image.thumbnailUrl, image.bannerUrl, image.iconUrl].filter(
        (path): path is string => Boolean(path),
      ),
    );
    await Promise.all(filePaths.map((path) => this.deleteStoredFile(path)));
  }

  private async uploadFile(
    file: Express.Multer.File,
    folder: string,
  ): Promise<string> {
    const saved = await this.storageService.saveFile(file, folder);
    return saved.path;
  }

  private async deleteStoredFile(path: string): Promise<void> {
    const { filename, folder } = parseStoragePath(path);
    await this.storageService
      .deleteFile(filename, folder)
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Could not delete orphaned file ${path}: ${message}`);
      });
  }
}

//* JSONB COLUMNS NEED A PLAIN, SERIALIZABLE VALUE — STRIPS class-transformer
//* INSTANCE METADATA AND ANY undefined FIELDS FROM THE VALIDATED NESTED DTOS.
function toPlainJson(
  value: object | undefined,
): Prisma.InputJsonValue | undefined {
  return value
    ? (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue)
    : undefined;
}
