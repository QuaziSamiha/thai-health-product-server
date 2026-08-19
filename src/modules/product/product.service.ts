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
  ImageReorderPlan,
  StorefrontListFilters,
} from './product.repository';
import { CategoryService } from '../category/category.service';
import {
  ProductResponseDto,
  ProductResponsePublicDto,
} from './dto/product-response.dto';
import { ProductDropdownOptionDto } from './dto/product-dropdown-response.dto';
import { ProductComboInventoryOptionDto } from './dto/product-combo-inventory-response.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { UpdateVariantStatusDto } from './dto/update-variant-status.dto';
import { VariantStatusChangeResponseDto } from './dto/variant-status-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ActiveProductsQueryDto } from './dto/active-products-query.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { parseStoragePath } from '../../common/utils/storage-path.util';
import { STORAGE_SERVICE_TOKEN } from '../../shared/storage/storage.constants';
import type { IStorageService } from '../../shared/storage/interfaces/storage.interface';
import { Prisma } from '../../generated/prisma/client';
import {
  CategoryProductStatus,
  ProductType,
  StockStatus,
  DiscountType,
} from '../../generated/prisma/enums';
import type {
  IPaginatedResult,
  PaginationQueryDto,
} from '../../shared/pagination';

const PRODUCT_IMAGE_FOLDER = 'products/gallery';

//* DEFAULT SECTION SIZE FOR THE UNPAGINATED HOME-PAGE-STYLE LISTS
//* (combo/featured/best) — CALLERS (E.G. A FUTURE home-content MODULE) MAY
//* OVERRIDE PER SECTION.
const DEFAULT_HOME_SECTION_LIMIT = 4;

//* MIRRORS THE SCHEMA COLUMN DEFAULT (Product.lowStockThreshold /
//* ProductVariant.lowStockThreshold) — USED WHEN A CREATE PAYLOAD OMITS IT,
//* SO THE APP-COMPUTED stockStatus MATCHES WHAT THE DB TRIGGER WILL ALSO
//* DERIVE FROM THE COLUMN'S OWN DEFAULT.
const DEFAULT_LOW_STOCK_THRESHOLD = 10;

//* THE SLICE OF A STORED VARIANT THE RECONCILE LOGIC NEEDS — STRUCTURALLY
//* SATISFIED BY THE ROWS `findByIdAdmin` ALREADY LOADS.
interface ExistingVariantState {
  id: number;
  name: string;
  size: string | null;
  quantity: number;
  lowStockThreshold: number;
  isDefault: boolean;
  variantStatus: CategoryProductStatus;
  basePrice: unknown;
  discountType: DiscountType;
  discountValue: unknown;
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
   * Admin detail — same visibility rules as the admin list: no filter at
   * all, so drafts, archived, hidden, and soft-deleted products are all
   * retrievable by id.
   */
  async getProductById(id: number): Promise<ProductResponseDto> {
    const product = await this.productRepository.findByIdAdmin(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return new ProductResponseDto(
      product,
      this.configService.get<string>('app.baseUrl'),
    );
  }

  /**
   * Shared query parsing for the storefront lists — the only parsing that
   * belongs here (not in the repository, per its own contract) is turning
   * the CSV `categoryIds` query param into `number[]`; everything else is
   * passed straight through to the already-filtered repository query.
   */
  private parseStorefrontQuery(query: ActiveProductsQueryDto): {
    paginationParams: PaginationQueryDto;
    filters: StorefrontListFilters;
  } {
    const { categoryIds, productType, sortBy, ...paginationParams } = query;
    return {
      paginationParams,
      filters: {
        categoryIds: categoryIds
          ?.split(',')
          .map((id) => Number(id.trim()))
          .filter((id) => Number.isInteger(id)),
        type: productType,
        sortBy,
      },
    };
  }

  private toPublicList(
    paginated: Awaited<ReturnType<ProductRepository['findAllProductsActive']>>,
  ): IPaginatedResult<ProductResponsePublicDto> {
    const baseUrl = this.configService.get<string>('app.baseUrl');
    return {
      ...paginated,
      data: paginated.data.map(
        (product) => new ProductResponsePublicDto(product, baseUrl),
      ),
    };
  }

  /**
   * Storefront listing — every ACTIVE, non-deleted product. `publishedAt`
   * is recorded in the DB but is intentionally not a visibility condition.
   */
  async getActiveProducts(
    query: ActiveProductsQueryDto,
  ): Promise<IPaginatedResult<ProductResponsePublicDto>> {
    const { paginationParams, filters } = this.parseStorefrontQuery(query);
    return this.toPublicList(
      await this.productRepository.findAllProductsActive(
        paginationParams,
        filters,
      ),
    );
  }

  //* ═══════════════════════════════════════════════════════════════════════
  //* HOME-PAGE-STYLE SECTIONS — small, unpaginated, fixed-size product
  //* arrays for landing-page widgets. Not exposed via this module's own
  //* controller: callers needing an HTTP surface (e.g. a home-content
  //* module composing categories + these sections into one response) import
  //* ProductModule and inject ProductService directly, which already
  //* exports it.
  //* ═══════════════════════════════════════════════════════════════════════

  private toPublicDtoList(
    rows: Awaited<ReturnType<ProductRepository['findBestProducts']>>,
  ): ProductResponsePublicDto[] {
    const baseUrl = this.configService.get<string>('app.baseUrl');
    return rows.map(
      (product) => new ProductResponsePublicDto(product, baseUrl),
    );
  }

  /** Active products flagged `isFeatured`. */
  async getFeaturedProducts(
    limit = DEFAULT_HOME_SECTION_LIMIT,
  ): Promise<ProductResponsePublicDto[]> {
    return this.toPublicDtoList(
      await this.productRepository.findFeaturedProducts(limit),
    );
  }

  /** Active products NOT flagged `isFeatured` — the general product grid. */
  async getNonFeaturedProducts(
    limit = DEFAULT_HOME_SECTION_LIMIT,
  ): Promise<ProductResponsePublicDto[]> {
    return this.toPublicDtoList(
      await this.productRepository.findNonFeaturedProducts(limit),
    );
  }

  /** "Best" products — see `findBestProducts` for the ranking caveat. */
  async getBestProducts(
    limit = DEFAULT_HOME_SECTION_LIMIT,
  ): Promise<ProductResponsePublicDto[]> {
    return this.toPublicDtoList(
      await this.productRepository.findBestProducts(limit),
    );
  }

  /**
   * Flattened admin dropdown list — one option per *selectable* thing, not
   * per product row: a SIMPLE product (no variants) contributes itself,
   * while a product with variants contributes one option per variant
   * instead of its own row, since a variant is what the caller (e.g. an
   * order line or discount rule picker) actually needs to reference.
   */
  async getProductDropdownOptions(): Promise<ProductDropdownOptionDto[]> {
    const products = await this.productRepository.findProductDropdownOptions();
    const baseUrl = this.configService.get<string>('app.baseUrl');
    return products.flatMap((product) =>
      product.variants.length
        ? product.variants.map(
            (variant) =>
              new ProductDropdownOptionDto({ product, variant }, baseUrl),
          )
        : [new ProductDropdownOptionDto({ product }, baseUrl)],
    );
  }

  /**
   * Same flattening rule as `getProductDropdownOptions`, plus
   * `comboQuantity`/`availableForCombo` (quantity - comboQuantity) per
   * option — how much of this product/variant's current stock is still
   * free to allocate to a combo, given the amount already earmarked as its
   * own per-bundle prefill.
   *
   * **Membership is decided by status alone**: every ACTIVE SIMPLE product
   * and every ACTIVE variant of an ACTIVE product, whatever their stock.
   * `availableForCombo` is *reported*, never used to filter — an earlier
   * revision dropped any option below 1, which silently hid a live product
   * from the combo builder for the entirely temporary reason that it
   * happened to be out of stock, and read to the admin as "my product is
   * missing" rather than "my product has no free stock". Stock is a
   * quantity question the caller answers per row (the forms cap Qty at
   * `availableForCombo` and block submit above it); presence in the list is
   * a sellability question, and sellability is `status`.
   *
   * The repository has already dropped non-ACTIVE variants (a combo cannot
   * bundle one), which leaves one case the flattening rule would otherwise
   * get wrong: a VARIABLE product whose every variant is retired arrives
   * with an empty `variants` array and would fall back to a product-level
   * option — an unpinned VARIABLE row, which `resolveComboItems` rejects on
   * save. Such a product contributes nothing instead.
   */
  async getProductComboInventoryOptions(): Promise<
    ProductComboInventoryOptionDto[]
  > {
    const products =
      await this.productRepository.findProductComboInventoryOptions();
    const baseUrl = this.configService.get<string>('app.baseUrl');
    return products.flatMap((product) => {
      if (product.variants.length) {
        return product.variants.map(
          (variant) =>
            new ProductComboInventoryOptionDto({ product, variant }, baseUrl),
        );
      }
      if (product.type === ProductType.VARIABLE) return [];
      return [new ProductComboInventoryOptionDto({ product }, baseUrl)];
    });
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

    if (dto.type === ProductType.SIMPLE && dto.variants?.length) {
      throw new BadRequestException('SIMPLE products cannot have variants');
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
      const {
        hasVariants,
        quantity,
        totalStock,
        stockStatus,
        lowStockThreshold,
        variants,
      } = this.buildStockAndVariants(
        dto.name,
        slug,
        dto.variants,
        dto.quantity,
        dto.lowStockThreshold,
      );

      //* A VARIABLE PRODUCT MAY OMIT ITS OWN BASE PRICE — FALL BACK TO THE
      //* DEFAULT VARIANT'S SO LISTINGS SHOW A REAL PRICE INSTEAD OF THE
      //* COLUMN DEFAULT 0. SAME FOR THE DISCOUNT: THE ADMIN FORM NEVER SENDS
      //* dto.discountType/dto.discountValue FOR A VARIABLE PRODUCT (THE
      //* DISCOUNT LIVES ON THE VARIANT), SO Product.salePrice MUST FALL BACK
      //* TO THE DEFAULT VARIANT'S OWN CONFIGURED DISCOUNT TOO — OTHERWISE IT
      //* SILENTLY ENDS UP "0% OFF" REGARDLESS OF WHAT THE VARIANT ACTUALLY
      //* HAS CONFIGURED, WHICH IS WRONG FOR ANY LISTING/SORT THAT READS THE
      //* PRODUCT ROW DIRECTLY INSTEAD OF THE VARIANT.
      //* A VARIABLE PRODUCT'S status IS DERIVED FROM ITS VARIANTS, NOT TAKEN
      //* FROM THE PAYLOAD — SEE resolveVariableProductStatus. `current` IS THE
      //* VALUE THE ROW WOULD OTHERWISE BE CREATED WITH, SO THE HELPER'S
      //* "undefined = ALREADY CORRECT" ANSWER STILL YIELDS THE RIGHT COLUMN.
      //* A SIMPLE PRODUCT KEEPS WHATEVER THE ADMIN CHOSE.
      const requestedStatus = dto.status ?? CategoryProductStatus.ACTIVE;
      const status =
        (dto.type ?? ProductType.VARIABLE) === ProductType.VARIABLE &&
        variants.length > 0
          ? (this.resolveVariableProductStatus(
              dto.status,
              requestedStatus,
              variants.map(
                (v) => v.variantStatus ?? CategoryProductStatus.ACTIVE,
              ),
            ) ?? requestedStatus)
          : requestedStatus;

      const defaultVariant = variants.find((v) => v.isDefault) ?? variants[0];
      const basePrice = dto.basePrice ?? Number(defaultVariant?.basePrice ?? 0);
      const defaultVariantDiscountValue =
        defaultVariant?.discountValue === null ||
        defaultVariant?.discountValue === undefined
          ? undefined
          : Number(defaultVariant.discountValue);
      const { discountType, discountValue, salePrice } = this.resolveSalePrice(
        basePrice,
        defaultVariant?.discountType ?? dto.discountType,
        defaultVariantDiscountValue ?? dto.discountValue,
      );

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
        status,
        isFeatured: dto.isFeatured,
        //* THE PUBLIC VISIBILITY GATE IS status = ACTIVE AND publishedAt <=
        //* now(), AND A null publishedAt NEVER MATCHES — SO AN ACTIVE
        //* PRODUCT CREATED WITHOUT AN EXPLICIT LAUNCH DATE MUST GO LIVE
        //* IMMEDIATELY, OTHERWISE EVERY DASHBOARD-CREATED PRODUCT 404s ON
        //* THE STOREFRONT. AN EXPLICIT dto.publishedAt (SCHEDULED LAUNCH)
        //* ALWAYS WINS.
        //* READS THE *RESOLVED* status, NOT dto.status — A VARIABLE PRODUCT
        //* WHOSE VARIANTS FORCED IT ACTIVE STILL NEEDS ITS LAUNCH STAMP, AND
        //* ONE THEY FORCED INACTIVE MUST NOT GET ONE.
        publishedAt: dto.publishedAt
          ? new Date(dto.publishedAt)
          : status === CategoryProductStatus.ACTIVE
            ? new Date()
            : undefined,
        basePrice,
        discountType,
        discountValue,
        salePrice,
        costPrice: dto.costPrice,
        weight: dto.weight,
        size: dto.size,
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
        lowStockThreshold,
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
   * `totalStock` is the sum of the ACTIVE variants' stock, regardless of what
   * the client sent for `quantity`, since this invariant is what the rest of
   * the app relies on), `stockStatus` (derived from the effective stock
   * count), and each variant's own slug/stockStatus. If no variant is marked
   * `isDefault`, the first ACTIVE one is — the storefront always needs some
   * variant pre-selected, and it has to be one it actually renders.
   *
   * `totalStock` summing ACTIVE variants only mirrors
   * `sync_product_total_stock_from_variants` (migration
   * 20260818100000_add_product_variant_status) — the same dual-rule contract
   * as `stockStatus`: the DB is the authority once rows exist, this exists so
   * the create/update response is already right.
   */
  private buildStockAndVariants(
    productName: string,
    productSlug: string,
    variantDto: CreateProductVariantDto[] | undefined,
    simpleQuantity: number | undefined,
    productLowStockThreshold: number | undefined,
  ): {
    hasVariants: boolean;
    quantity: number;
    totalStock: number;
    stockStatus: StockStatus;
    lowStockThreshold: number;
    variants: Prisma.ProductVariantCreateManyProductInput[];
  } {
    const hasVariants = Boolean(variantDto?.length);

    if (!hasVariants) {
      const quantity = simpleQuantity ?? 0;
      const lowStockThreshold =
        productLowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
      return {
        hasVariants,
        quantity,
        totalStock: quantity,
        stockStatus: this.computeStockStatus(quantity, lowStockThreshold),
        lowStockThreshold,
        variants: [],
      };
    }

    const variants = variantDto!.map((variant, index) =>
      this.buildVariantInput(productName, productSlug, variant, index),
    );

    //* CREATING A VARIABLE PRODUCT WITH EVERY VARIANT RETIRED IS ALLOWED —
    //* IT SIMPLY LANDS INACTIVE (SEE resolveVariableProductStatus, APPLIED BY
    //* createProduct). AN EARLIER REVISION REJECTED IT; THAT CONTRADICTED THE
    //* RULE THAT PRODUCT STATUS *FOLLOWS* ITS VARIANTS RATHER THAN
    //* CONSTRAINING THEM.
    const firstActive = variants.findIndex(
      (v) => v.variantStatus === CategoryProductStatus.ACTIVE,
    );
    //* THE DEFAULT SHOULD BE A VARIANT THE STOREFRONT ACTUALLY RENDERS, SO AN
    //* isDefault FLAG ON A RETIRED VARIANT IS OVERRIDDEN RATHER THAN HONOURED
    //* — UNLESS NOTHING IS ACTIVE AT ALL, IN WHICH CASE THE FIRST ROW TAKES IT
    //* SO THE PRODUCT STILL HAS EXACTLY ONE DEFAULT TO RESTORE LATER.
    if (
      !variants.some(
        (v) => v.isDefault && v.variantStatus === CategoryProductStatus.ACTIVE,
      )
    ) {
      variants.forEach((v) => {
        v.isDefault = false;
      });
      variants[firstActive === -1 ? 0 : firstActive].isDefault = true;
    }

    const totalStock = variants.reduce(
      (sum, v) =>
        v.variantStatus === CategoryProductStatus.ACTIVE
          ? sum + (v.quantity ?? 0)
          : sum,
      0,
    );
    const lowStockThreshold =
      productLowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;

    return {
      hasVariants,
      quantity: 0,
      totalStock,
      stockStatus: this.computeStockStatus(totalStock, lowStockThreshold),
      lowStockThreshold,
      variants,
    };
  }

  private buildVariantInput(
    productName: string,
    productSlug: string,
    variant: CreateProductVariantDto,
    index: number,
  ): Prisma.ProductVariantCreateManyProductInput {
    const quantity = variant.quantity ?? 0;
    const lowStockThreshold =
      variant.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    const slugSeed = variant.name ?? variant.size ?? `variant-${index + 1}`;
    const basePrice = variant.basePrice ?? 0;

    return {
      // Variant name/slug are unique across ALL products in the current
      // schema (not scoped per-product) — prefixing with the parent's own
      // unique slug (plus the size-derived seed) keeps this collision-free
      // in practice, since two variants of the same product always differ
      // by size.
      name:
        variant.name ?? `${productName} variant ${variant.size ?? ''}`.trim(),
      slug: `${productSlug}-variant-${generateSlug(slugSeed)}`,
      size: variant.size,
      basePrice,
      ...this.resolveSalePrice(
        basePrice,
        variant.discountType,
        variant.discountValue,
      ),
      costPrice: variant.costPrice,
      quantity,
      lowStockThreshold,
      stockStatus: this.computeStockStatus(quantity, lowStockThreshold),
      sku: variant.sku,
      barcode: variant.barcode,
      weight: variant.weight,
      attributes: toPlainJson(variant.attributes) ?? {},
      isDefault: variant.isDefault ?? false,
      //* MIRRORS THE COLUMN DEFAULT RATHER THAN FALLING THROUGH TO IT, SO THE
      //* ACTIVE-VARIANT INVARIANTS ABOVE CAN READ THE EFFECTIVE VALUE OFF THIS
      //* OBJECT INSTEAD OF RE-DERIVING THE DEFAULT AT EVERY CALL SITE.
      variantStatus: variant.variantStatus ?? CategoryProductStatus.ACTIVE,
    };
  }

  /**
   * The VARIABLE-product status rule: **a variable product is ACTIVE exactly
   * when at least one of its variants is.**
   *
   * A SIMPLE product's `status` is what the admin typed — it has no variants,
   * so there is nothing to derive it from and this helper is never consulted.
   * A VARIABLE product's is derived instead, because the admin already
   * expressed the same intent one level down and two sources of truth for
   * "is this on sale" would inevitably disagree:
   *
   * - **Any variant ACTIVE ⇒ the product is ACTIVE.** A request to deactivate
   *   it is overridden rather than rejected: something IS still on sale, so
   *   INACTIVE would hide a live variant behind a dead product page.
   * - **No variant ACTIVE ⇒ the product is INACTIVE**, automatically. This is
   *   what retiring the last variant does, and it is why doing so is allowed
   *   at all (an earlier revision returned 409 here instead).
   *
   * `DRAFT` / `ARCHIVED` / `HIDDEN` pass through untouched. They are explicit
   * lifecycle positions, not the "is it sellable" toggle this rule governs —
   * `ARCHIVED` is what `softDeleteProduct` writes, and forcing a DRAFT product
   * to ACTIVE the moment a variant went live would publish it out from under
   * the admin. All three already read as not-sellable, so leaving them alone
   * loses no safety.
   *
   * Returns `undefined` when the stored value already satisfies the rule, so
   * a no-op never lands in the update payload.
   *
   * Deliberately NOT a DB trigger, unlike `totalStock`/`stockStatus`: those
   * are pure caches, whereas `status` is coupled to `publishedAt` (a product
   * that becomes ACTIVE with no launch date on record must be stamped, or it
   * 404s on the storefront — see `createProduct`). A trigger could move the
   * status but not that pairing, which is exactly how the two would drift.
   */
  private resolveVariableProductStatus(
    requested: CategoryProductStatus | undefined,
    current: CategoryProductStatus,
    variantStatuses: CategoryProductStatus[],
  ): CategoryProductStatus | undefined {
    const effective = requested ?? current;
    if (
      effective !== CategoryProductStatus.ACTIVE &&
      effective !== CategoryProductStatus.INACTIVE
    ) {
      return requested;
    }

    //* AN EMPTY SET CANNOT SATISFY "SOME VARIANT IS ACTIVE", SO A VARIABLE
    //* PRODUCT MID-CREATE (ROW INSERTED, VARIANTS NOT YET) WOULD DERIVE
    //* INACTIVE. EVERY CALLER PASSES THE FINAL SET, SO THAT STATE IS NEVER
    //* OBSERVED — BUT KEEP IT IN MIND BEFORE CALLING THIS FROM A NEW PATH.
    const desired = variantStatuses.some(
      (status) => status === CategoryProductStatus.ACTIVE,
    )
      ? CategoryProductStatus.ACTIVE
      : CategoryProductStatus.INACTIVE;

    return desired === current ? undefined : desired;
  }

  private computeStockStatus(
    quantity: number,
    lowStockThreshold: number,
  ): StockStatus {
    if (quantity <= 0) return StockStatus.OUT_OF_STOCK;
    if (quantity <= lowStockThreshold) return StockStatus.LOW_STOCK;
    return StockStatus.IN_STOCK;
  }

  /**
   * `salePrice` is never accepted from the client — it's always derived here
   * from `basePrice` + `discountType`/`discountValue`, for both the product
   * and each variant. `discountType` defaults to PERCENTAGE whenever it's
   * omitted — including when there's no discount at all, since the column
   * is `NOT NULL DEFAULT PERCENTAGE`. No discount value means no discount:
   * `salePrice` mirrors `basePrice`. Rounded to 2 decimal places (currency).
   */
  private resolveSalePrice(
    basePrice: number,
    discountType: DiscountType | undefined,
    discountValue: number | undefined,
  ): {
    discountType: DiscountType;
    discountValue: number | undefined;
    salePrice: number;
  } {
    const effectiveType = discountType ?? DiscountType.PERCENTAGE;

    if (discountValue === undefined) {
      return {
        discountType: effectiveType,
        discountValue: undefined,
        salePrice: basePrice,
      };
    }

    let salePrice: number;
    if (effectiveType === DiscountType.PERCENTAGE) {
      if (discountValue > 100) {
        throw new BadRequestException(
          'Percentage discount value cannot exceed 100',
        );
      }
      salePrice = basePrice * (1 - discountValue / 100);
    } else {
      if (discountValue > basePrice) {
        throw new BadRequestException(
          'Fixed discount value cannot exceed the base price',
        );
      }
      salePrice = basePrice - discountValue;
    }

    return {
      discountType: effectiveType,
      discountValue,
      salePrice: Math.round(salePrice * 100) / 100,
    };
  }

  /**
   * Update-path counterpart to `resolveSalePrice`: only recomputes pricing
   * fields when this request actually touches `basePrice`/`discountType`/
   * `discountValue`, falling back to the row's current values for whatever
   * wasn't sent. Returns `{}` (nothing touched) when none of the three are
   * part of the payload.
   */
  private resolvePricingUpdate(
    current: {
      basePrice: unknown;
      discountType: DiscountType;
      discountValue: unknown;
    },
    dto: {
      basePrice?: number;
      discountType?: DiscountType;
      discountValue?: number;
    },
  ): {
    discountType?: DiscountType;
    discountValue?: number | null;
    salePrice?: number;
  } {
    const touchesPricing =
      dto.basePrice !== undefined ||
      dto.discountType !== undefined ||
      dto.discountValue !== undefined;
    if (!touchesPricing) {
      return {};
    }

    const { discountType, discountValue, salePrice } = this.resolveSalePrice(
      dto.basePrice ?? Number(current.basePrice),
      dto.discountType ?? current.discountType,
      dto.discountValue ??
        (current.discountValue !== null
          ? Number(current.discountValue)
          : undefined),
    );

    return {
      discountType,
      discountValue: discountValue ?? null,
      salePrice,
    };
  }

  /**
   * Resolves `dto.imageOrder`'s wire tokens (an existing image's id as a
   * numeric string, or `new:<n>` for the nth uploaded file) into a plan the
   * repository can apply — validated against the gallery as it will exist
   * *after* this request's deletions. `undefined` in ⇒ `undefined` out: the
   * caller falls back to the old append-only behavior when the client
   * doesn't send an order (e.g. an older client, or a request that isn't
   * touching images at all).
   *
   * Deliberately ignores the numeric suffix on `new:<n>` tokens beyond using
   * it to recognize the token shape — new entries are matched to uploaded
   * files positionally (the order they appear in `imageOrder`), which is
   * simpler for the caller to construct correctly than requiring the
   * indices to match exact upload order.
   */
  private resolveImageReorderPlan(
    imageOrder: string[] | undefined,
    remainingExistingIds: Set<number>,
    newFilesCount: number,
  ): ({ type: 'existing'; id: number } | { type: 'new' })[] | undefined {
    if (imageOrder === undefined) return undefined;

    const seenExisting = new Set<number>();
    let newCount = 0;
    const tokens = imageOrder.map((token) => {
      if (token.startsWith('new:')) {
        newCount++;
        return { type: 'new' as const };
      }
      const id = Number(token);
      if (
        !Number.isInteger(id) ||
        !remainingExistingIds.has(id) ||
        seenExisting.has(id)
      ) {
        throw new BadRequestException(
          "imageOrder references an image outside this product's surviving gallery, or references one more than once",
        );
      }
      seenExisting.add(id);
      return { type: 'existing' as const, id };
    });

    if (
      newCount !== newFilesCount ||
      seenExisting.size !== remainingExistingIds.size
    ) {
      throw new BadRequestException(
        'imageOrder must include every surviving existing image exactly once, plus exactly one `new:<n>` entry per uploaded file',
      );
    }

    return tokens;
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

    //* WHETHER A PRIMARY IMAGE SURVIVES THIS REQUEST — IF `deleteImageIds`
    //* REMOVES THE CURRENT PRIMARY (OR THE GALLERY WAS ALREADY EMPTY), THE
    //* FIRST NEWLY-UPLOADED IMAGE BELOW MUST TAKE OVER AS PRIMARY SO THE
    //* PRODUCT ISN'T LEFT WITHOUT ONE.
    const deletedImageIds = new Set(imagesToDelete.map((img) => img.id));
    const hasSurvivingPrimaryImage = existing.images.some(
      (img) => img.isPrimary && !deletedImageIds.has(img.id),
    );

    //* VALIDATED AGAINST images.length (NOT uploadedPaths, WHICH DOESN'T
    //* EXIST YET) — SAME COUNT, BUT THIS WAY A BAD imageOrder 400s BEFORE
    //* ANY FILE IS ACTUALLY UPLOADED
    const remainingExistingIds = new Set(
      existing.images
        .filter((img) => !deletedImageIds.has(img.id))
        .map((img) => img.id),
    );
    const reorderTokens = this.resolveImageReorderPlan(
      dto.imageOrder,
      remainingExistingIds,
      images.length,
    );

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
      const {
        fields: stockFields,
        variantPlan,
        deactivatedVariantIds,
        finalVariantStatuses,
      } = this.resolveStockUpdate(
        existing,
        dto,
        dto.name ?? existing.name,
        slug,
      );

      //* A VARIABLE PRODUCT'S status FOLLOWS ITS VARIANTS — SEE
      //* resolveVariableProductStatus. THIS COVERS BOTH WAYS THE PAIR CAN MOVE
      //* IN ONE REQUEST: `variants` WAS RECONCILED (USE THE POST-PLAN
      //* STATUSES), OR ONLY `status` WAS TOUCHED (USE THE STORED ONES). A
      //* SIMPLE PRODUCT SKIPS THE RULE ENTIRELY AND KEEPS dto.status.
      const effectiveType = dto.type ?? existing.type;
      const resolvedStatus =
        effectiveType === ProductType.VARIABLE
          ? this.resolveVariableProductStatus(
              dto.status,
              existing.status,
              finalVariantStatuses ??
                existing.variants.map((v) => v.variantStatus),
            )
          : dto.status;

      const pricingFields = this.resolvePricingUpdate(existing, dto);

      //* combo_items_variant_id_fkey IS ON DELETE RESTRICT, SO DROPPING A
      //* VARIANT THAT A COMBO STILL BUNDLES WOULD BLOW UP THE TRANSACTION
      //* BELOW WITH A RAW P2003. CHECK FIRST AND NAME THE BLOCKING COMBOS.
      if (variantPlan?.deleteIds.length) {
        await this.assertVariantsNotBundled(variantPlan.deleteIds);
      }

      //* RETIRING A BUNDLED VARIANT HAS NO FK TO STOP IT, BUT IT BREAKS A
      //* LIVE COMBO JUST AS THOROUGHLY AS DELETING ONE WOULD — A NON-ACTIVE
      //* VARIANT CONTRIBUTES 0 STOCK, SO recompute_combo_quantity DROPS THE
      //* WHOLE BUNDLE TO 0. SAME RULE, SAME MESSAGE SHAPE, AS THE SINGLE-
      //* VARIANT ENDPOINT (updateVariantStatus).
      if (deactivatedVariantIds?.length) {
        await this.assertVariantsNotInLiveCombo(deactivatedVariantIds);
      }

      const updated = await this.productRepository.withTransaction(
        async (tx) => {
          if (variantPlan) {
            await this.productRepository.reconcileVariants(id, variantPlan, tx);
          }
          if (imagesToDelete.length) {
            await this.productRepository.deleteImages(
              imagesToDelete.map((img) => img.id),
              tx,
            );
          }
          if (reorderTokens) {
            //* ATTACH THE NOW-KNOWN UPLOADED PATHS TO EACH `new` TOKEN, IN
            //* THE ORDER THEY APPEAR WITHIN imageOrder (SEE resolveImageReorderPlan)
            let newIndex = 0;
            const plan: ImageReorderPlan = reorderTokens.map((token) =>
              token.type === 'existing'
                ? token
                : { type: 'new' as const, path: uploadedPaths[newIndex++] },
            );
            await this.productRepository.reorderImages(id, plan, tx);
          } else if (uploadedPaths.length) {
            const startOrder = existing.images.length;
            await this.productRepository.createImages(
              id,
              uploadedPaths.map((path, index) => ({
                url: path,
                displayOrder: startOrder + index,
                isPrimary: !hasSurvivingPrimaryImage && index === 0,
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
              status: resolvedStatus,
              isFeatured: dto.isFeatured,
              //* SAME RULE AS CREATE: A PRODUCT THAT IS (OR BECOMES) ACTIVE
              //* WITH NO LAUNCH DATE ON RECORD IS PUBLISHED IMMEDIATELY —
              //* null NEVER PASSES THE PUBLIC publishedAt <= now() GATE.
              //* ALSO BACKFILLS PRE-FIX ROWS ON THEIR NEXT SAVE.
              //* READS THE *RESOLVED* STATUS, NOT dto.status — A VARIABLE
              //* PRODUCT THE RULE JUST FORCED ACTIVE (E.G. A VARIANT WAS
              //* REACTIVATED) STILL NEEDS ITS FIRST LAUNCH STAMP, OR IT STAYS
              //* INVISIBLE BEHIND THE publishedAt GATE.
              publishedAt: dto.publishedAt
                ? new Date(dto.publishedAt)
                : (resolvedStatus ?? existing.status) ===
                      CategoryProductStatus.ACTIVE && !existing.publishedAt
                  ? new Date()
                  : undefined,
              basePrice: dto.basePrice,
              costPrice: dto.costPrice,
              weight: dto.weight,
              size: dto.size,
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
              //* stockFields SPREADS LAST — WHEN dto.variants IS PROVIDED FOR A
              //* VARIABLE PRODUCT, IT CARRIES basePrice/discountType/
              //* discountValue/salePrice ALREADY RESOLVED FROM THE DEFAULT
              //* VARIANT (SEE resolveStockUpdate), WHICH MUST WIN OVER
              //* pricingFields' GENERIC dto.basePrice/discountType/discountValue
              //* READ — OTHERWISE A CLIENT THAT SENDS A REDUNDANT TOP-LEVEL
              //* basePrice ALONGSIDE `variants` (AS THE ADMIN FORM DOES) WOULD
              //* SILENTLY OVERWRITE THE CORRECT VARIANT-DERIVED DISCOUNT WITH
              //* THE PRODUCT ROW'S OWN, POSSIBLY STALE, discountType/discountValue.
              ...pricingFields,
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
   * Rejects a variant reconcile that would delete a variant still referenced
   * by a ComboItem. The DB already refuses it (ON DELETE RESTRICT, matching
   * the product FK) — this turns that into a 409 that tells the admin which
   * combo to edit first, instead of an opaque foreign-key failure.
   */
  private async assertVariantsNotBundled(variantIds: number[]): Promise<void> {
    const bundled =
      await this.productRepository.findCombosUsingVariants(variantIds);
    if (bundled.length === 0) return;

    const blockers = [
      ...new Set(
        bundled.map(
          (item) =>
            `"${item.variant?.name ?? `Variant ${item.variantId}`}" in combo "${item.combo.title}"`,
        ),
      ),
    ];
    throw new ConflictException(
      `Cannot remove a variant that is still bundled in a combo: ${blockers.join('; ')}. Remove it from the combo first.`,
    );
  }

  /**
   * Rejects retiring a variant that a LIVE combo still bundles. The parallel
   * to `assertVariantsNotBundled` is deliberate but the scope is narrower —
   * see `ProductRepository.findLiveCombosUsingVariants` for why deleting is
   * blocked by any combo while retiring is blocked only by a published one.
   *
   * Nothing in the DB enforces this; the DB's own reaction to a retired
   * bundled variant is to quietly recompute the combo to 0 assemblable
   * bundles. That is the correct end state, and exactly why this check
   * exists: an ACTIVE combo silently becoming unbuyable is a storefront
   * regression the admin should have to acknowledge (by unpublishing or
   * re-composing the combo) rather than discover from a sales report.
   */
  private async assertVariantsNotInLiveCombo(
    variantIds: number[],
  ): Promise<void> {
    const bundled =
      await this.productRepository.findLiveCombosUsingVariants(variantIds);
    if (bundled.length === 0) return;

    const blockers = [
      ...new Set(
        bundled.map(
          (item) =>
            `"${item.variant?.name ?? `Variant ${item.variantId}`}" in combo "${item.combo.title}"`,
        ),
      ),
    ];
    throw new ConflictException(
      `Cannot retire a variant that a live combo depends on: ${blockers.join('; ')}. Deactivate that combo, or swap the variant out of it, first.`,
    );
  }

  /**
   * Recomputes `hasVariants`/`quantity`/`totalStock`/`stockStatus` only when
   * the update actually touches `type`, `quantity`, or `variants` — otherwise
   * these cached fields are left out of the update payload entirely (Prisma
   * ignores `undefined` keys, so they stay whatever they already were).
   * Reuses the exact same invariant as `createProduct`.
   *
   * Also enforces the two type invariants against the product's *current*
   * DB state, which the DTO layer can't see on its own:
   * - VARIABLE must end up with at least one variant — flipping to VARIABLE
   *   (or re-affirming it) requires either an existing variant or a
   *   `variants` array in this same request.
   * - SIMPLE must end up with none — rejected if `variants` is sent, or if
   *   the product already has variants (remove them first, in a separate
   *   request, before flipping to SIMPLE).
   */
  private resolveStockUpdate(
    current: {
      type: ProductType;
      quantity: number;
      totalStock: number;
      lowStockThreshold: number;
      variants: ExistingVariantState[];
    },
    dto: UpdateProductDto,
    productName: string,
    productSlug: string,
  ): {
    fields: Partial<Prisma.ProductUncheckedUpdateInput>;
    variantPlan?: VariantReconcilePlan;
    //* CARRIED OUT ALONGSIDE THE PLAN RATHER THAN INSIDE IT: THE REPOSITORY
    //* EXECUTES VariantReconcilePlan VERBATIM, AND THIS IS A PRE-COMMIT
    //* *CHECK* THE SERVICE OWNS, NOT A WRITE. SEE buildVariantReconcilePlan.
    deactivatedVariantIds?: number[];
    //* EVERY SURVIVING VARIANT'S variantStatus AFTER THE PLAN APPLIES — FEEDS
    //* THE PRODUCT'S OWN status. PRESENT ONLY WHEN `variants` WAS SENT; THE
    //* CALLER FALLS BACK TO THE STORED SET OTHERWISE.
    finalVariantStatuses?: CategoryProductStatus[];
  } {
    const touchesStock =
      dto.type !== undefined ||
      dto.quantity !== undefined ||
      dto.variants !== undefined ||
      dto.lowStockThreshold !== undefined;
    if (!touchesStock) {
      return { fields: {} };
    }

    const effectiveType = dto.type ?? current.type;
    const lowStockThreshold =
      dto.lowStockThreshold ?? current.lowStockThreshold;

    if (effectiveType === ProductType.VARIABLE) {
      if (dto.variants !== undefined) {
        const {
          plan,
          totalStock,
          deactivatedIds,
          finalStatuses,
          defaultPricing,
        } = this.buildVariantReconcilePlan(
          productName,
          productSlug,
          current.variants,
          dto.variants,
        );
        //* MIRROR THE DEFAULT VARIANT'S OWN PRICING ONTO Product — SAME
        //* RATIONALE AS createProduct: dto.basePrice CAN STILL OVERRIDE (RARE/
        //* MANUAL), BUT discountType/discountValue ALWAYS COME FROM THE
        //* VARIANT (THE ADMIN FORM NEVER SENDS THEM AT THE TOP LEVEL FOR A
        //* VARIABLE PRODUCT) — RE-RESOLVED AGAINST WHATEVER basePrice WINS SO
        //* salePrice NEVER PAIRS A NEW basePrice WITH A STALE salePrice.
        const basePrice = dto.basePrice ?? defaultPricing.basePrice;
        const { discountType, discountValue, salePrice } =
          this.resolveSalePrice(
            basePrice,
            defaultPricing.discountType,
            defaultPricing.discountValue,
          );
        return {
          fields: {
            hasVariants: true,
            quantity: 0,
            totalStock,
            lowStockThreshold,
            stockStatus: this.computeStockStatus(totalStock, lowStockThreshold),
            basePrice,
            discountType,
            discountValue,
            salePrice,
          },
          variantPlan: plan,
          deactivatedVariantIds: deactivatedIds,
          finalVariantStatuses: finalStatuses,
        };
      }
      if (current.variants.length === 0) {
        throw new BadRequestException(
          'At least one variant is required when type is VARIABLE — include a `variants` array in this request',
        );
      }
      return {
        fields: {
          hasVariants: true,
          quantity: 0,
          lowStockThreshold,
          //* totalStock ISN'T CHANGING HERE (NO `variants` IN THIS REQUEST) —
          //* BUT stockStatus STILL NEEDS RECOMPUTING AGAINST current.totalStock
          //* SINCE THIS BRANCH CAN BE REACHED BY AN lowStockThreshold-ONLY UPDATE.
          stockStatus: this.computeStockStatus(
            current.totalStock,
            lowStockThreshold,
          ),
        },
      };
    }

    if (dto.variants !== undefined) {
      throw new BadRequestException('SIMPLE products cannot have variants');
    }
    if (current.variants.length > 0) {
      throw new BadRequestException(
        'Cannot switch to SIMPLE while variants exist — remove all variants first',
      );
    }

    const quantity = dto.quantity ?? current.quantity;
    return {
      fields: {
        hasVariants: false,
        quantity,
        totalStock: quantity,
        lowStockThreshold,
        stockStatus: this.computeStockStatus(quantity, lowStockThreshold),
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
   * guarantees the final set is never empty. Retiring every variant IS
   * allowed — it deactivates the product instead (see
   * `resolveVariableProductStatus`). Exactly one variant ends up
   * `isDefault`, preferring an ACTIVE one: an explicit flag in the payload
   * wins, an existing default that survives *and stays active* is kept,
   * otherwise the first active entry is promoted — or the first entry
   * outright when nothing is active, so there is still exactly one default to
   * restore later.
   *
   * Also returns `totalStock` for the final set — the payload quantity when
   * given, the variant's current quantity otherwise, counting ACTIVE variants
   * only, mirroring `sync_product_total_stock_from_variants` — so the caller
   * can refresh the product's cached stock fields. `defaultPricing` is the
   * default variant's own basePrice/discountType/discountValue *as they end
   * up after this plan applies* (not the partial update patch stored in
   * `updates`/`creates`, which leaves untouched fields `undefined`) — the
   * caller mirrors this onto the `Product` row itself so `Product.basePrice`/
   * `salePrice` always match what the storefront actually shows for this
   * product (the default variant), instead of a stale creation-time snapshot.
   *
   * `deactivatedIds` names the surviving variants this request moves OUT of
   * ACTIVE. The caller guards those against live combos before committing,
   * exactly as it already guards `deleteIds` — retiring a bundled variant and
   * deleting one break a live bundle the same way.
   *
   * `finalStatuses` is every surviving variant's `variantStatus` *as it ends
   * up after this plan applies* — the caller feeds it to
   * `resolveVariableProductStatus` to re-derive the product's own status.
   * It cannot be read off the payload alone (an omitted `variantStatus` means
   * "keep the stored one") nor off the DB alone (this request may be changing
   * several at once).
   */
  private buildVariantReconcilePlan(
    productName: string,
    productSlug: string,
    existingVariants: ExistingVariantState[],
    requested: UpdateProductVariantDto[],
  ): {
    plan: VariantReconcilePlan;
    totalStock: number;
    deactivatedIds: number[];
    finalStatuses: CategoryProductStatus[];
    defaultPricing: {
      basePrice: number;
      discountType: DiscountType | undefined;
      discountValue: number | undefined;
    };
  } {
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

    //* RESOLVE EACH ENTRY'S FINAL variantStatus FIRST — EVERYTHING BELOW (THE
    //* DEFAULT FLAG, totalStock, THE ACTIVE-VARIANT INVARIANT) IS A STATEMENT
    //* ABOUT THE SET *AFTER* THIS PLAN APPLIES, WHICH CANNOT BE READ OFF
    //* EITHER THE PAYLOAD OR THE CURRENT ROWS ALONE: AN OMITTED variantStatus
    //* MEANS "KEEP WHAT THE ROW HAS" ON AN UPDATE BUT "ACTIVE" ON A CREATE.
    const intendedStatuses = requested.map(
      (entry) =>
        entry.variantStatus ??
        (entry.id !== undefined
          ? existingById.get(entry.id)!.variantStatus
          : CategoryProductStatus.ACTIVE),
    );

    //* NO LONGER A REJECTION: RETIRING EVERY VARIANT IS THE SUPPORTED WAY TO
    //* TAKE A VARIABLE PRODUCT OFF SALE, AND THE CALLER TURNS IT INTO
    //* status = INACTIVE. -1 HERE JUST MEANS "NOTHING ACTIVE TO PREFER AS
    //* THE DEFAULT", HANDLED WHERE defaultIndex IS PICKED BELOW.
    const firstActive = intendedStatuses.indexOf(CategoryProductStatus.ACTIVE);

    //* SURVIVING VARIANTS THIS REQUEST TAKES *OUT OF* ACTIVE. NEW ENTRIES
    //* CANNOT APPEAR HERE (NO id, AND NOTHING BUNDLES THEM YET), AND NEITHER
    //* CAN ALREADY-RETIRED ONES — THE COMBO GUARD IS ABOUT THE TRANSITION, SO
    //* RE-SENDING A VARIANT THAT WAS ALREADY INACTIVE IS NOT A CHANGE.
    const deactivatedIds = requested
      .filter(
        (entry, index) =>
          entry.id !== undefined &&
          intendedStatuses[index] !== CategoryProductStatus.ACTIVE &&
          existingById.get(entry.id)!.variantStatus ===
            CategoryProductStatus.ACTIVE,
      )
      .map((entry) => entry.id!);

    //* RESOLVE THE FINAL isDefault FLAGS ACROSS THE WHOLE SET UP FRONT:
    //* PAYLOAD FLAG > SURVIVING EXISTING FLAG > NONE, THEN AND-ED WITH "IS
    //* ACTIVE". THEN FORCE EXACTLY ONE DEFAULT — THE FIRST FLAGGED ENTRY
    //* WINS, OR THE FIRST *ACTIVE* ENTRY IF NOBODY ELIGIBLE IS FLAGGED (E.G.
    //* THE OLD DEFAULT WAS JUST DELETED, OR IS BEING RETIRED BY THIS SAME
    //* REQUEST). THE ACTIVE TEST IS WHAT KEEPS THE PDP FROM PRE-SELECTING A
    //* VARIANT IT NO LONGER RENDERS.
    const intendedDefaults = requested.map(
      (entry, index) =>
        intendedStatuses[index] === CategoryProductStatus.ACTIVE &&
        (entry.isDefault ??
          (entry.id !== undefined
            ? existingById.get(entry.id)!.isDefault
            : false)),
    );
    const firstDefault = intendedDefaults.indexOf(true);
    //* FALLS BACK PAST firstActive TO INDEX 0 WHEN THE WHOLE SET IS RETIRED —
    //* THE PRODUCT IS ABOUT TO GO INACTIVE, BUT IT MUST STILL CARRY EXACTLY
    //* ONE DEFAULT SO REACTIVATING A VARIANT LATER HAS SOMETHING TO SHOW.
    const defaultIndex =
      firstDefault === -1
        ? firstActive === -1
          ? 0
          : firstActive
        : firstDefault;

    const updates: VariantReconcilePlan['updates'] = [];
    const creates: VariantReconcilePlan['creates'] = [];
    let totalStock = 0;

    requested.forEach((entry, index) => {
      const isDefault = index === defaultIndex;
      const isActive = intendedStatuses[index] === CategoryProductStatus.ACTIVE;
      const existing =
        entry.id !== undefined ? existingById.get(entry.id)! : undefined;

      if (existing) {
        //* RETIRED VARIANTS DO NOT COUNT — totalStock IS SELLABLE STOCK, AND
        //* THE DB TRIGGER THAT OWNS THE COLUMN SUMS ACTIVE ROWS ONLY.
        if (isActive) totalStock += entry.quantity ?? existing.quantity;
        const pricingFields = this.resolvePricingUpdate(existing, entry);
        //* THE ADMIN FORM NEVER SENDS `entry.name` — NAME/SLUG ARE ALWAYS
        //* SERVER-GENERATED FROM productName + SIZE, SO THEY MUST BE
        //* REGENERATED WHENEVER THE SIZE CHANGES TOO, NOT ONLY WHEN AN
        //* EXPLICIT NAME OVERRIDE ARRIVES — OTHERWISE A SIZE EDIT SILENTLY
        //* FREEZES THE STALE NAME/SLUG FROM CREATE TIME.
        const effectiveSize = entry.size ?? existing.size ?? undefined;
        const shouldRegenerate =
          entry.name !== undefined || entry.size !== undefined;
        const slugSeed =
          entry.name ?? effectiveSize ?? `variant-${existing.id}`;
        updates.push({
          id: existing.id,
          //* undefined FIELDS ARE SKIPPED BY PRISMA — ONLY WHAT THE PAYLOAD
          //* ACTUALLY PROVIDED (PLUS DERIVED slug/stockStatus/isDefault/
          //* PRICING) GETS WRITTEN.
          data: {
            name: shouldRegenerate
              ? (entry.name ??
                `${productName} variant ${effectiveSize ?? ''}`.trim())
              : undefined,
            slug: shouldRegenerate
              ? `${productSlug}-variant-${generateSlug(slugSeed)}`
              : undefined,
            size: entry.size,
            basePrice: entry.basePrice,
            ...pricingFields,
            costPrice: entry.costPrice,
            quantity: entry.quantity,
            lowStockThreshold: entry.lowStockThreshold,
            stockStatus:
              entry.quantity !== undefined ||
              entry.lowStockThreshold !== undefined
                ? this.computeStockStatus(
                    entry.quantity ?? existing.quantity,
                    entry.lowStockThreshold ?? existing.lowStockThreshold,
                  )
                : undefined,
            sku: entry.sku,
            barcode: entry.barcode,
            weight: entry.weight,
            attributes: toPlainJson(entry.attributes),
            isDefault,
            variantStatus: entry.variantStatus,
          },
        });
      } else {
        if (isActive) totalStock += entry.quantity ?? 0;
        creates.push({
          ...this.buildVariantInput(productName, productSlug, entry, index),
          isDefault,
        });
      }
    });

    const defaultEntry = requested[defaultIndex];
    const defaultExisting =
      defaultEntry.id !== undefined
        ? existingById.get(defaultEntry.id)
        : undefined;
    const defaultPricing = {
      basePrice: Number(
        defaultEntry.basePrice ?? defaultExisting?.basePrice ?? 0,
      ),
      discountType: defaultEntry.discountType ?? defaultExisting?.discountType,
      discountValue:
        defaultEntry.discountValue ??
        (defaultExisting?.discountValue != null
          ? Number(defaultExisting.discountValue)
          : undefined),
    };

    return {
      plan: { deleteIds, updates, creates },
      totalStock,
      deactivatedIds,
      finalStatuses: intendedStatuses,
      defaultPricing,
    };
  }

  /**
   * Flips ONE variant's own `variantStatus`, without touching the rest of the
   * product. This is the single-variant counterpart to `updateProduct`'s
   * whole-list reconcile: retiring one size out of five is a one-click
   * admin action, and routing it through `variants` would mean re-sending
   * (and risking clobbering) every sibling to change one column.
   *
   * The rules it enforces, in the order they are checked:
   *
   * 1. **No-op short-circuits.** Re-sending the status a variant already has
   *    returns the current state without a write — so a double-clicked toggle
   *    cannot trip the guards below or bump the product's audit trail.
   * 2. **The product's own status follows.** Retiring the last ACTIVE variant
   *    deactivates the product automatically, and reactivating any variant
   *    brings it back — see `resolveVariableProductStatus`. This used to be a
   *    409 refusing to retire the final variant; the rule now runs the other
   *    way, with product status derived from its variants rather than
   *    constraining them.
   * 3. **A live combo's parts may not be retired.** See
   *    `assertVariantsNotInLiveCombo`. Non-live combos are allowed through
   *    and reported back in `affectedCombos` instead.
   * 4. **The default variant must stay one the PDP renders.** Retiring the
   *    default hands `isDefault` to the first surviving ACTIVE variant, and
   *    re-mirrors that variant's pricing onto the product row — the same
   *    contract `buildVariantReconcilePlan` maintains, for the same reason:
   *    `Product.basePrice`/`salePrice` must match what the storefront shows.
   *
   * `totalStock`/`stockStatus` are NOT computed here — the `variant_status`
   * write fires the DB trigger chain that owns those columns (see
   * `ProductRepository.setVariantStatus`), so the product is re-read after
   * the transaction rather than predicted before it.
   */
  async updateVariantStatus(
    variantId: number,
    userId: number,
    dto: UpdateVariantStatusDto,
  ): Promise<VariantStatusChangeResponseDto> {
    const variant =
      await this.productRepository.findVariantForStatusUpdate(variantId);
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    if (variant.product.deletedAt) {
      throw new ConflictException(
        'Cannot change a variant of a deleted product — restore the product first',
      );
    }

    const target = dto.variantStatus;
    const siblings = variant.product.variants;

    if (variant.variantStatus === target) {
      return this.buildVariantStatusResponse(variantId, []);
    }

    const isRetiring = target !== CategoryProductStatus.ACTIVE;
    //* THE SURVIVORS OF THIS CHANGE, IN id ORDER — BOTH REMAINING GUARDS AND
    //* THE DEFAULT PROMOTION ARE QUESTIONS ABOUT THIS SET, NOT ABOUT THE ROW
    //* BEING EDITED.
    const otherActive = siblings.filter(
      (sibling) =>
        sibling.id !== variantId &&
        sibling.variantStatus === CategoryProductStatus.ACTIVE,
    );

    let promoteDefaultVariantId: number | undefined;
    let promotedPricing: (typeof siblings)[number] | undefined;

    if (isRetiring) {
      await this.assertVariantsNotInLiveCombo([variantId]);

      //* RETIRING THE DEFAULT HANDS THE FLAG TO A SURVIVING ACTIVE SIBLING —
      //* BUT ONLY IF THERE IS ONE. RETIRING THE *LAST* ACTIVE VARIANT IS
      //* ALLOWED (IT DEACTIVATES THE PRODUCT, SEE BELOW), AND THE DEFAULT FLAG
      //* SIMPLY STAYS PUT: THERE IS NO BETTER HOLDER, AND MOVING IT WOULD LOSE
      //* THE ADMIN'S CHOICE FOR WHEN THE PRODUCT COMES BACK.
      if (variant.isDefault && otherActive.length > 0) {
        promotedPricing = otherActive[0];
        promoteDefaultVariantId = promotedPricing.id;
      }
    } else if (!siblings.some((sibling) => sibling.isDefault)) {
      //* REACTIVATION ONLY EVER *ADDS* A SELLABLE VARIANT, SO IT NEEDS NO
      //* GUARDS — BUT IT IS ALSO THE MOMENT A PRODUCT LEFT WITHOUT ANY
      //* DEFAULT (LEGACY ROWS, OR A DEFAULT DELETED OUT FROM UNDER ONE) CAN
      //* GET ONE BACK FOR FREE, SINCE THIS VARIANT IS ABOUT TO BE ELIGIBLE.
      promotedPricing = siblings.find((sibling) => sibling.id === variantId);
      promoteDefaultVariantId = variantId;
    }

    const affectedCombos = isRetiring
      ? await this.productRepository.findDormantCombosUsingVariants([variantId])
      : [];

    await this.productRepository.withTransaction(async (tx) => {
      await this.productRepository.setVariantStatus(
        variantId,
        variant.productId,
        target,
        promoteDefaultVariantId,
        tx,
      );

      //* ProductVariant HAS NO AUDIT COLUMNS OF ITS OWN, SO THE TRAIL FOR A
      //* VARIANT-LEVEL EDIT LIVES ON THE PARENT — SAME PLACE AN ADMIN LOOKS
      //* AFTER ANY OTHER CHANGE TO THIS PRODUCT. THE PRICING RE-MIRROR RIDES
      //* ALONG IN THE SAME STATEMENT WHEN THE DEFAULT MOVED.
      //* THE VARIANT SET *AFTER* THIS WRITE — THE ROW BEING EDITED TAKES ITS
      //* NEW STATUS, EVERY SIBLING KEEPS ITS STORED ONE. BUILT HERE RATHER
      //* THAN RE-READ SO THE STATUS LANDS IN THE SAME STATEMENT AS THE AUDIT
      //* STAMP, IN THE SAME TRANSACTION AS THE VARIANT WRITE.
      const nextStatuses = siblings.map((sibling) =>
        sibling.id === variantId ? target : sibling.variantStatus,
      );
      const resolvedStatus = this.resolveVariableProductStatus(
        undefined,
        variant.product.status,
        nextStatuses,
      );

      await this.productRepository.updateProduct(
        variant.productId,
        {
          updatedBy: userId,
          status: resolvedStatus,
          //* SAME PAIRING RULE AS createProduct/updateProduct: A PRODUCT THE
          //* RULE JUST FORCED ACTIVE NEEDS A LAUNCH STAMP OR IT STAYS INVISIBLE
          //* BEHIND THE publishedAt GATE.
          publishedAt:
            resolvedStatus === CategoryProductStatus.ACTIVE &&
            !variant.product.publishedAt
              ? new Date()
              : undefined,
          ...this.mirrorDefaultVariantPricing(promotedPricing),
        },
        tx,
      );
    });

    return this.buildVariantStatusResponse(variantId, affectedCombos);
  }

  /**
   * The `Product` pricing patch for a newly promoted default variant — the
   * same mirror `resolveStockUpdate` applies after a reconcile, reduced to
   * the one case this endpoint can cause. `{}` when the default didn't move,
   * so a plain status toggle leaves pricing entirely alone.
   *
   * `discountValue` collapses `undefined` to `null` for the same reason
   * `resolvePricingUpdate` does: Prisma SKIPS `undefined` keys, so promoting
   * a variant that carries no discount would otherwise leave the product row
   * advertising the OLD default's discount against the NEW default's
   * basePrice — a wrong `discountValue` paired with a correct `salePrice`.
   */
  private mirrorDefaultVariantPricing(
    promoted:
      | {
          basePrice: unknown;
          discountType: DiscountType;
          discountValue: unknown;
        }
      | undefined,
  ): Partial<Prisma.ProductUncheckedUpdateInput> {
    if (!promoted) return {};

    const basePrice = Number(promoted.basePrice);
    const { discountType, discountValue, salePrice } = this.resolveSalePrice(
      basePrice,
      promoted.discountType,
      promoted.discountValue !== null
        ? Number(promoted.discountValue)
        : undefined,
    );

    return {
      basePrice,
      discountType,
      discountValue: discountValue ?? null,
      salePrice,
    };
  }

  /**
   * Re-reads the variant and its parent AFTER the write so the response
   * carries the DB's own `totalStock`/`stockStatus` rather than this
   * service's prediction of them — those two columns are trigger-derived
   * (see the migration note on `Product.totalStock`), and a variant status
   * change is precisely the case where predicting them would duplicate a
   * formula that lives in SQL.
   */
  private async buildVariantStatusResponse(
    variantId: number,
    affectedCombos: {
      combo: { id: number; title: string; status: CategoryProductStatus };
    }[],
  ): Promise<VariantStatusChangeResponseDto> {
    const fresh =
      await this.productRepository.findVariantForStatusResponse(variantId);
    if (!fresh) {
      throw new NotFoundException('Variant not found');
    }

    return new VariantStatusChangeResponseDto({
      variant: fresh,
      product: fresh.product,
      activeVariantCount: fresh.product.variants.length,
      //* DEDUPED BY COMBO ID — ONE COMBO CAN BUNDLE THE SAME VARIANT THROUGH
      //* MORE THAN ONE ROW ONLY IF ITS ITEM LIST IS EDITED INTO THAT STATE,
      //* BUT THE ADMIN STILL WANTS TO SEE IT NAMED ONCE.
      affectedCombos: [
        ...new Map(
          affectedCombos.map((item) => [item.combo.id, item.combo]),
        ).values(),
      ],
    });
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
