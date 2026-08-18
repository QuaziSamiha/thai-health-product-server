import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ComboProductRepository } from './combo-product.repository';
import { CreateComboProductDto } from './dto/create-combo-product.dto';
import { UpdateComboProductDto } from './dto/update-combo-product.dto';
import { AllCombosQueryDto } from './dto/all-combos-query.dto';
import { PublishedCombosQueryDto } from './dto/published-combos-query.dto';
import { ComboItemDto } from './dto/combo-item.dto';
import {
  ComboProductResponseDto,
  ComboProductResponsePublicDto,
} from './dto/combo-product-response.dto';
import { IPaginatedResult } from '../../shared/pagination';
import { generateSlug } from '../../common/utils/slug.util';
import { parseStoragePath } from '../../common/utils/storage-path.util';
import { STORAGE_SERVICE_TOKEN } from '../../shared/storage/storage.constants';
import type { IStorageService } from '../../shared/storage/interfaces/storage.interface';
import { Prisma } from '../../generated/prisma/client';
import {
  CategoryProductStatus,
  ProductType,
  StockStatus,
} from '../../generated/prisma/enums';

const COMBO_IMAGE_FOLDER = 'combos/gallery';
const DEFAULT_HOME_SECTION_LIMIT = 4;

//* MIRRORS THE SCHEMA COLUMN DEFAULT (ComboProduct.lowStockThreshold) — USED
//* WHEN THE CREATE PAYLOAD OMITS IT, SO THE APP-COMPUTED stockStatus MATCHES
//* WHAT THE DB TRIGGER WILL DERIVE FROM THE COLUMN'S OWN DEFAULT. SAME
//* CONTRACT AS ProductService's DEFAULT_LOW_STOCK_THRESHOLD.
const DEFAULT_LOW_STOCK_THRESHOLD = 10;

@Injectable()
export class ComboProductService {
  private readonly logger = new Logger(ComboProductService.name);

  constructor(
    private readonly comboProductRepository: ComboProductRepository,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: IStorageService,
    private readonly configService: ConfigService,
  ) {}

  async createComboProduct(
    userId: number,
    dto: CreateComboProductDto,
    images: Express.Multer.File[],
  ): Promise<ComboProductResponseDto> {
    const existingByTitle = await this.comboProductRepository.findByTitle(
      dto.title,
    );
    if (existingByTitle) {
      throw new ConflictException('A combo with this title already exists');
    }

    const slug = generateSlug(dto.title);
    const existingBySlug =
      await this.comboProductRepository.findBySlugAdmin(slug);
    if (existingBySlug) {
      throw new ConflictException(
        'This title results in a duplicate combo slug',
      );
    }

    //* sku/barcode ARE UNIQUE COLUMNS — CHECKED UP FRONT SO A CLASH RETURNS A
    //* NAMED 409 INSTEAD OF A RAW P2002 FROM THE INSERT, MATCHING HOW title
    //* AND slug ARE ALREADY HANDLED ABOVE.
    if (dto.sku) {
      const existingBySku = await this.comboProductRepository.findBySku(
        dto.sku,
      );
      if (existingBySku) {
        throw new ConflictException('A combo with this SKU already exists');
      }
    }
    if (dto.barcode) {
      const existingByBarcode = await this.comboProductRepository.findByBarcode(
        dto.barcode,
      );
      if (existingByBarcode) {
        throw new ConflictException('A combo with this barcode already exists');
      }
    }

    const { items, quantity, limitingItemName } = await this.resolveComboItems(
      dto.items,
    );
    //* THE ADMIN CANNOT OFFER MORE BUNDLES THAN STOCK CAN ASSEMBLE. CHECKED
    //* HERE RATHER THAN IN THE DTO BECAUSE THE CEILING DEPENDS ON LIVE STOCK.
    this.assertOfferedQuantityFits(
      dto.offeredQuantity,
      quantity,
      limitingItemName,
    );
    //* FALLS BACK TO THE CONSTANT THAT MIRRORS THE COLUMN DEFAULT, SO THE
    //* APP-COMPUTED stockStatus MATCHES WHAT THE DB TRIGGER WOULD DERIVE.
    const lowStockThreshold =
      dto.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    const totalPrice = items.reduce(
      (sum, item) => sum + Number(item.unitPrice ?? 0) * (item.quantity ?? 1),
      0,
    );

    this.assertComboPriceBelowParts(dto.comboPrice, totalPrice);

    const uploadedPaths: string[] = [];
    try {
      for (const file of images) {
        uploadedPaths.push(await this.uploadFile(file, COMBO_IMAGE_FOLDER));
      }
    } catch (uploadError) {
      await Promise.all(
        uploadedPaths.map((path) => this.deleteStoredFile(path)),
      );
      throw uploadError;
    }

    try {
      const created = await this.comboProductRepository.createComboProduct({
        title: dto.title,
        titleTh: dto.titleTh,
        slug,
        sku: dto.sku,
        barcode: dto.barcode,
        costPrice: dto.costPrice,
        shortDescription: dto.shortDescription,
        shortDescTh: dto.shortDescTh,
        description: dto.description,
        descriptionTh: dto.descriptionTh,
        totalPrice,
        comboPrice: dto.comboPrice,
        //* WRITTEN HERE SO THE RESPONSE FROM THIS CREATE ALREADY CARRIES THE
        //* RIGHT AVAILABILITY — THE DB TRIGGER RECOMPUTES quantity ONLY AFTER
        //* THE combo_items ROWS LAND, WHICH IS AFTER THE combo_products ROW
        //* PRISMA RETURNS. THE TWO RULES ARE IDENTICAL BY CONSTRUCTION; SEE
        //* resolveComboAvailability.
        quantity,
        //* THE THRESHOLD THE ADMIN CHOSE MUST FEED BOTH THE COLUMN AND THE
        //* APP-SIDE stockStatus, OR THE TWO DISAGREE UNTIL THE NEXT TRIGGER RUN.
        lowStockThreshold,
        //* ADMIN INTENT, STORED ALONGSIDE THE DERIVED CEILING — NOT INSTEAD OF
        //* IT. THE TRIGGERS OWN `quantity`; NOTHING BUT AN ADMIN TOUCHES THIS.
        offeredQuantity: dto.offeredQuantity,
        stockStatus: this.computeStockStatus(quantity, lowStockThreshold),
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        status: dto.status,
        isFeatured: dto.isFeatured,
        seoMetadata: toPlainJson(dto.seoMetadata),
        //* UNLIKE Product (DEFAULTS TO ACTIVE), A COMBO DEFAULTS TO DRAFT AND
        //* MUST BE EXPLICITLY PUBLISHED. AN EXPLICIT publishedAt WINS (IT IS
        //* HOW A LAUNCH IS SCHEDULED); OTHERWISE ONLY STAMP now() WHEN THE
        //* ADMIN CHOSE ACTIVE RIGHT HERE.
        publishedAt: dto.publishedAt
          ? new Date(dto.publishedAt)
          : dto.status === CategoryProductStatus.ACTIVE
            ? new Date()
            : undefined,
        createdBy: userId,
        images: uploadedPaths.map((path, index) => ({
          url: path,
          displayOrder: index,
          isPrimary: index === 0,
        })),
        items,
      });

      return new ComboProductResponseDto(
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
   * PATCH a combo. Only the fields present in `dto` are written, so editing
   * one field can never blank the rest.
   *
   * Ordering is deliberate and mirrors `createComboProduct`: every rejection
   * that can be decided from the payload plus the DB happens **before** any
   * file is uploaded, and the row/item/image writes all share one transaction
   * so a failure part-way cannot leave items swapped but prices stale.
   * Physical files are only unlinked after the transaction commits — a failed
   * unlink must not roll back a committed edit.
   */
  async updateComboProduct(
    id: number,
    userId: number,
    dto: UpdateComboProductDto,
    images: Express.Multer.File[],
  ): Promise<ComboProductResponseDto> {
    const existing = await this.comboProductRepository.findByIdAdmin(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Combo not found');
    }

    //* TITLE DRIVES THE SLUG, SO BOTH ARE RE-CHECKED WHENEVER IT MOVES.
    let slug: string | undefined;
    if (dto.title && dto.title !== existing.title) {
      const titleConflict = await this.comboProductRepository.findByTitle(
        dto.title,
      );
      if (titleConflict && titleConflict.id !== id) {
        throw new ConflictException('A combo with this title already exists');
      }
      slug = generateSlug(dto.title);
      const slugConflict =
        await this.comboProductRepository.findBySlugAdmin(slug);
      if (slugConflict && slugConflict.id !== id) {
        throw new ConflictException(
          'This title results in a duplicate combo slug',
        );
      }
    }

    if (dto.sku && dto.sku !== existing.sku) {
      const skuConflict = await this.comboProductRepository.findBySku(dto.sku);
      if (skuConflict && skuConflict.id !== id) {
        throw new ConflictException('A combo with this SKU already exists');
      }
    }
    if (dto.barcode && dto.barcode !== existing.barcode) {
      const barcodeConflict = await this.comboProductRepository.findByBarcode(
        dto.barcode,
      );
      if (barcodeConflict && barcodeConflict.id !== id) {
        throw new ConflictException('A combo with this barcode already exists');
      }
    }

    //* WHEN `items` IS OMITTED THE BUNDLE IS UNTOUCHED, SO THE EXISTING
    //* totalPrice STANDS AND THE CEILING IS THE TRIGGER-MAINTAINED COLUMN.
    const resolved = dto.items
      ? await this.resolveComboItems(dto.items)
      : undefined;
    const totalPrice = resolved
      ? resolved.items.reduce(
          (sum, item) =>
            sum + Number(item.unitPrice ?? 0) * (item.quantity ?? 1),
          0,
        )
      : Number(existing.totalPrice ?? 0);
    const maxAssemblable = resolved ? resolved.quantity : existing.quantity;

    //* THE PRICE RULE IS CHECKED AGAINST WHICHEVER SIDE MOVED — A PATCH THAT
    //* ONLY LOWERS comboPrice STILL COMPARES AGAINST THE STORED totalPrice,
    //* AND A PATCH THAT ONLY SWAPS ITEMS RE-CHECKS THE STORED comboPrice.
    const effectiveComboPrice =
      dto.comboPrice ?? Number(existing.comboPrice ?? 0);
    this.assertComboPriceBelowParts(effectiveComboPrice, totalPrice);

    this.assertOfferedQuantityFits(
      dto.offeredQuantity,
      maxAssemblable,
      resolved?.limitingItemName ?? 'a bundled product',
    );

    //* PUBLISHING WITHOUT RE-SENDING `items` IS THE ONE WAY A COMBO CAN GO
    //* LIVE AROUND A VARIANT THAT WAS RETIRED AFTER IT WAS BUNDLED — SEE
    //* ComboProductRepository.findInactiveBundledVariants. WHEN `items` *IS*
    //* PRESENT, resolveComboItems ABOVE HAS ALREADY REJECTED ANY SUCH ROW,
    //* SO THIS ONLY HAS TO COVER THE UNTOUCHED-ITEMS CASE.
    if (
      dto.status === CategoryProductStatus.ACTIVE &&
      existing.status !== CategoryProductStatus.ACTIVE &&
      !resolved
    ) {
      await this.assertNoInactiveBundledVariants(id);
    }

    //* SCOPED TO THIS COMBO SO A FOREIGN IMAGE ID CANNOT BE DELETED THROUGH
    //* ANOTHER COMBO'S PAYLOAD — AND AN UNKNOWN ID FAILS THE WHOLE REQUEST
    //* BEFORE ANY FILE IS UPLOADED, SAME AS ProductService.updateProduct.
    const requestedImageIds = [...new Set(dto.deleteImageIds ?? [])];
    const imagesToDelete =
      await this.comboProductRepository.findComboImagesByIds(
        id,
        requestedImageIds,
      );
    if (imagesToDelete.length !== requestedImageIds.length) {
      throw new BadRequestException(
        'One or more image IDs do not belong to this combo',
      );
    }

    const lowStockThreshold =
      dto.lowStockThreshold ?? existing.lowStockThreshold;

    const uploadedPaths: string[] = [];
    try {
      for (const file of images) {
        uploadedPaths.push(await this.uploadFile(file, COMBO_IMAGE_FOLDER));
      }
    } catch (uploadError) {
      await Promise.all(
        uploadedPaths.map((path) => this.deleteStoredFile(path)),
      );
      throw uploadError;
    }

    try {
      const updated = await this.comboProductRepository.withTransaction(
        async (tx) => {
          if (resolved) {
            await this.comboProductRepository.replaceComboItems(
              id,
              resolved.items,
              tx,
            );
          }

          if (imagesToDelete.length) {
            await this.comboProductRepository.deleteComboImages(
              imagesToDelete.map((image) => image.id),
              tx,
            );
          }

          if (uploadedPaths.length) {
            //* PROMOTE A NEW UPLOAD ONLY IF THE DELETIONS ABOVE LEFT THE COMBO
            //* WITHOUT A COVER — combo_images_one_primary_per_combo ALLOWS AT
            //* MOST ONE, SO THIS MUST BE COUNTED *AFTER* THE DELETE.
            const survivingPrimaries =
              await this.comboProductRepository.countPrimaryImages(id, tx);
            const startOrder =
              (await this.comboProductRepository.findMaxImageDisplayOrder(
                id,
                tx,
              )) + 1;
            await this.comboProductRepository.createComboImages(
              id,
              uploadedPaths.map((path, index) => ({
                url: path,
                displayOrder: startOrder + index,
                isPrimary: survivingPrimaries === 0 && index === 0,
              })),
              tx,
            );
          }

          //* quantity/stockStatus ARE RECOMPUTED HERE ONLY WHEN THE ITEM LIST
          //* CHANGED, FOR THE SAME REASON AS CREATE: THE TRIGGER FIRES AFTER
          //* THE combo_items WRITES ABOVE BUT THE ROW PRISMA RETURNS IS READ
          //* IN THIS STATEMENT. WITH ITEMS UNTOUCHED THE COLUMN IS ALREADY
          //* CORRECT AND MUST NOT BE OVERWRITTEN FROM STALE INPUT.
          return await this.comboProductRepository.updateComboProduct(
            id,
            {
              title: dto.title,
              slug,
              titleTh: dto.titleTh,
              sku: dto.sku,
              barcode: dto.barcode,
              shortDescription: dto.shortDescription,
              shortDescTh: dto.shortDescTh,
              description: dto.description,
              descriptionTh: dto.descriptionTh,
              costPrice: dto.costPrice,
              comboPrice: dto.comboPrice,
              totalPrice: resolved ? totalPrice : undefined,
              quantity: resolved ? resolved.quantity : undefined,
              stockStatus: resolved
                ? this.computeStockStatus(resolved.quantity, lowStockThreshold)
                : undefined,
              lowStockThreshold: dto.lowStockThreshold,
              offeredQuantity: dto.offeredQuantity,
              startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
              endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
              status: dto.status,
              isFeatured: dto.isFeatured,
              seoMetadata: toPlainJson(dto.seoMetadata),
              //* SAME PUBLISH RULE AS CREATE, PLUS A BACKFILL: A COMBO BEING
              //* SWITCHED TO ACTIVE FOR THE FIRST TIME GETS STAMPED NOW.
              publishedAt: dto.publishedAt
                ? new Date(dto.publishedAt)
                : dto.status === CategoryProductStatus.ACTIVE &&
                    !existing.publishedAt
                  ? new Date()
                  : undefined,
              updatedBy: userId,
            },
            tx,
          );
        },
      );

      //* ROWS ARE GONE — REMOVE THE PHYSICAL FILES BEST-EFFORT. A FAILED
      //* UNLINK MUST NOT ROLL BACK A COMMITTED UPDATE.
      await Promise.all(
        imagesToDelete.flatMap((image) =>
          [image.url, image.thumbnailUrl, image.bannerUrl, image.iconUrl]
            .filter((path): path is string => Boolean(path))
            .map((path) => this.deleteStoredFile(path)),
        ),
      );

      return new ComboProductResponseDto(
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
   * Hard delete — permanently removes the combo row along with its bundled
   * items and gallery images. `ComboItem`/`ComboImage` cascade via the DB
   * relation; the physical gallery files are cleaned up here afterward,
   * best-effort, same rationale as `ProductService.hardDeleteProduct`.
   *
   * Does NOT touch `Product.quantity`/`ProductVariant.quantity`: a combo's
   * own `quantity` is derived from live product/variant stock (see the
   * Availability Model doc), never reserved from it, so there is nothing to
   * give back when the combo disappears.
   */
  async hardDeleteComboProduct(id: number): Promise<void> {
    const combo =
      await this.comboProductRepository.findComboImagePathsForDeletion(id);
    if (!combo) {
      throw new NotFoundException('Combo not found');
    }

    await this.comboProductRepository.deleteComboProduct(id);

    const filePaths = combo.images.flatMap((image) =>
      [image.url, image.thumbnailUrl, image.bannerUrl, image.iconUrl].filter(
        (path): path is string => Boolean(path),
      ),
    );
    await Promise.all(filePaths.map((path) => this.deleteStoredFile(path)));
  }

  /**
   * Admin listing — paginated, searchable, filterable and sortable, matching
   * the contract every other admin table uses. Soft-deleted combos are
   * excluded (see the repository note); drafts, archived, and hidden ones are
   * not, since a management dashboard needs to see what customers cannot.
   */
  async getAllCombos(
    query: AllCombosQueryDto,
  ): Promise<IPaginatedResult<ComboProductResponseDto>> {
    //* SPLIT THE FILTER/SORT FIELDS OFF THE SHARED page/limit/search/sortOrder
    //* CONTRACT — PaginationService ONLY UNDERSTANDS THE LATTER, AND PASSING
    //* THE WHOLE DTO THROUGH WOULD LEAK FILTER KEYS INTO ITS params.
    const { status, stockStatus, isFeatured, sortBy, ...paginationParams } =
      query;

    const paginated = await this.comboProductRepository.findAllCombosAdmin(
      paginationParams,
      { status, stockStatus, isFeatured, sortBy },
    );

    const baseUrl = this.configService.get<string>('app.baseUrl');
    return {
      ...paginated,
      data: paginated.data.map(
        (combo) => new ComboProductResponseDto(combo, baseUrl),
      ),
    };
  }

  /**
   * Storefront combo listing — paginated, searchable (title/titleTh/slug),
   * optionally featured-only, sortable by createdAt/comboPrice/title. Every
   * row is ACTIVE + published (see `ComboProductRepository.publicVisibilityWhere`);
   * unlike `getAllCombos` there is no status/stockStatus filter to leak
   * non-visible rows through. Mirrors `ProductService.getActiveProducts`.
   */
  async getPublishedCombos(
    query: PublishedCombosQueryDto,
  ): Promise<IPaginatedResult<ComboProductResponsePublicDto>> {
    const { isFeatured, sortBy, ...paginationParams } = query;

    const paginated = await this.comboProductRepository.findPublishedCombos(
      paginationParams,
      { isFeatured, sortBy },
    );

    const baseUrl = this.configService.get<string>('app.baseUrl');
    return {
      ...paginated,
      data: paginated.data.map(
        (combo) => new ComboProductResponsePublicDto(combo, baseUrl),
      ),
    };
  }

  /**
   * Storefront combo details (PDP-equivalent) — looks up a single combo by
   * its slug, gated to ACTIVE + published rows only (see
   * `ComboProductRepository.publicVisibilityWhere`). Mirrors
   * `ProductService.getProductBySlug`.
   */
  async getComboBySlug(slug: string): Promise<ComboProductResponsePublicDto> {
    const combo = await this.comboProductRepository.findBySlugPublic(slug);
    if (!combo) {
      throw new NotFoundException('Combo not found');
    }
    return new ComboProductResponsePublicDto(
      combo,
      this.configService.get<string>('app.baseUrl'),
    );
  }

  /** Active combos for a "Combo Deals" home section. */
  async getActiveCombosForHome(
    limit = DEFAULT_HOME_SECTION_LIMIT,
  ): Promise<ComboProductResponsePublicDto[]> {
    const baseUrl = this.configService.get<string>('app.baseUrl');
    const combos =
      await this.comboProductRepository.findActiveCombosForHome(limit);
    return combos.map(
      (combo) => new ComboProductResponsePublicDto(combo, baseUrl),
    );
  }

  /**
   * Validates every bundled product/variant exists, that a pinned variant
   * actually belongs to the product it's paired with, that the pin matches
   * the product's type (VARIABLE requires a variant, SIMPLE forbids one),
   * and that the pinned variant is ACTIVE — then
   * resolves each item's `unitPrice` snapshot (the client-supplied value
   * wins; otherwise falls back to the variant's/product's current
   * `salePrice ?? basePrice` at bundling time, per ComboItem's documented
   * "price snapshot" contract).
   *
   * Also returns the combo's `quantity` — how many complete bundles the
   * current stock can assemble — since the per-item stock needed to derive
   * it is already loaded here. See `resolveComboAvailability`.
   */
  private async resolveComboItems(itemDtos: ComboItemDto[]): Promise<{
    items: Prisma.ComboItemCreateManyComboInput[];
    quantity: number;
    limitingItemName: string;
  }> {
    const productIds = [...new Set(itemDtos.map((item) => item.productId))];
    const variantIds = [
      ...new Set(
        itemDtos
          .filter((item) => item.variantId != null)
          .map((item) => item.variantId!),
      ),
    ];

    const [products, variants] = await Promise.all([
      this.comboProductRepository.findProductsByIds(productIds),
      this.comboProductRepository.findVariantsByIds(variantIds),
    ]);

    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );
    const variantMap = new Map(
      variants.map((variant) => [variant.id, variant]),
    );

    const resolved = itemDtos.map((item, index) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      //* A VARIANT-LEVEL AND A PRODUCT-LEVEL ROW FOR THE SAME PRODUCT ARE BOTH
      //* VALID ON THEIR OWN BUT AMBIGUOUS TOGETHER, AND NO UNIQUE INDEX CAN
      //* EXPRESS A CROSS-ROW RULE — SO PIN IT TO THE PRODUCT'S TYPE INSTEAD:
      //* VARIABLE ALWAYS BUNDLES A SPECIFIC VARIANT, SIMPLE NEVER DOES. THAT
      //* ALSO GUARANTEES EVERY ROW OF ONE PRODUCT SITS ON THE SAME SIDE OF THE
      //* variant_id IS NULL SPLIT THE TWO UNIQUE INDEXES ARE BUILT AROUND.
      if (product.type === ProductType.VARIABLE && item.variantId == null) {
        throw new BadRequestException(
          `"${product.name}" is a variable product — choose which variant to bundle`,
        );
      }
      if (product.type === ProductType.SIMPLE && item.variantId != null) {
        throw new BadRequestException(
          `"${product.name}" is a simple product and has no variants to pin`,
        );
      }

      let variant: NonNullable<typeof variants>[number] | undefined;
      if (item.variantId != null) {
        variant = variantMap.get(item.variantId);
        if (!variant) {
          throw new NotFoundException(`Variant ${item.variantId} not found`);
        }
        if (variant.productId !== item.productId) {
          throw new BadRequestException(
            `Variant ${item.variantId} does not belong to product ${item.productId}`,
          );
        }
        //* A RETIRED VARIANT CONTRIBUTES 0 STOCK TO THE BUNDLE (SEE
        //* resolveComboAvailability AND recompute_combo_quantity), SO
        //* BUNDLING ONE COULD ONLY EVER PRODUCE A COMBO THAT IS PERMANENTLY
        //* 0-ASSEMBLABLE. REJECT IT AT THE BOUNDARY INSTEAD OF SILENTLY
        //* CREATING AN UNSELLABLE OFFER. THE COMPLEMENTARY RULE LIVES IN
        //* ProductService.assertVariantsNotInLiveCombo, WHICH STOPS AN
        //* ALREADY-BUNDLED VARIANT FROM BEING RETIRED OUT FROM UNDER A LIVE
        //* COMBO.
        if (variant.variantStatus !== CategoryProductStatus.ACTIVE) {
          throw new BadRequestException(
            `"${product.name} - ${variant.name}" is ${variant.variantStatus.toLowerCase()}, not active, so it cannot be bundled — reactivate the variant or pick another one`,
          );
        }
      }

      const priceSource = variant ?? product;
      const resolvedUnitPrice =
        item.unitPrice ??
        Number(priceSource.salePrice ?? priceSource.basePrice);

      return {
        item: {
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity ?? 1,
          unitPrice: resolvedUnitPrice,
          displayOrder: item.displayOrder ?? index,
        },
        //* AN UNPINNED ROW IS ALWAYS A SIMPLE PRODUCT (ENFORCED ABOVE), SO ITS
        //* OWN quantity IS THE STOCK THAT LIMITS THE BUNDLE — NOT total_stock,
        //* WHICH IS THE VARIANTS ROLL-UP AND IS 0 FOR A SIMPLE PRODUCT'S PARTS.
        //* A NON-ACTIVE VARIANT READS AS 0 REGARDLESS OF ITS SHELF STOCK,
        //* MIRRORING recompute_combo_quantity. UNREACHABLE FROM THIS PATH
        //* TODAY (THE GUARD ABOVE ALREADY REJECTED IT) — IT IS HERE BECAUSE
        //* THIS FORMULA MUST READ IDENTICALLY TO THE SQL IT MIRRORS, WHICH
        //* *IS* REACHED THAT WAY: A VARIANT CAN BE RETIRED LONG AFTER IT WAS
        //* BUNDLED INTO A DRAFT COMBO.
        sourceStock: variant
          ? variant.variantStatus === CategoryProductStatus.ACTIVE
            ? variant.quantity
            : 0
          : product.quantity,
        //* CARRIED SO A REJECTED offeredQuantity CAN NAME THE BOTTLENECK
        name: product.name,
      };
    });

    const quantity = this.resolveComboAvailability(resolved);

    //* THE ITEM WHOSE OWN BUNDLE CEILING EQUALS THE COMBO'S — i.e. THE SCARCEST
    //* PART. FALLS BACK TO THE FIRST ROW FOR AN EMPTY/DEGENERATE SET.
    const limiting =
      resolved.find(
        (entry) =>
          Math.floor(
            Math.max(entry.sourceStock, 0) / Math.max(entry.item.quantity, 1),
          ) === quantity,
      ) ?? resolved[0];

    return {
      items: resolved.map((entry) => entry.item),
      quantity,
      limitingItemName: limiting?.name ?? 'a bundled product',
    };
  }

  /**
   * Refuses to publish a combo that still pins a retired variant. Such a
   * bundle can never be assembled — `recompute_combo_quantity` reads a
   * non-ACTIVE variant's stock as 0, so its `quantity` is pinned at 0 and
   * its `stockStatus` at OUT_OF_STOCK for as long as the variant stays
   * retired. Letting it go live would put a card on the storefront that can
   * only ever say "out of stock".
   *
   * Third and last of the three rules that keep combos and variant status
   * consistent, each closing a different moment:
   *   1. bundle time   — `resolveComboItems` (cannot add a retired variant)
   *   2. retire time   — `ProductService.assertVariantsNotInLiveCombo`
   *                      (cannot retire a variant a LIVE combo needs)
   *   3. publish time  — here (cannot go live around one retired in between)
   */
  private async assertNoInactiveBundledVariants(
    comboId: number,
  ): Promise<void> {
    const inactive =
      await this.comboProductRepository.findInactiveBundledVariants(comboId);
    if (inactive.length === 0) return;

    const blockers = inactive
      .map((item) => `"${item.variant!.name}"`)
      .join(', ');
    throw new BadRequestException(
      `This combo cannot be published while it bundles a variant that is not active: ${blockers}. Reactivate the variant, or swap it out of the combo, first.`,
    );
  }

  /**
   * How many complete bundles the current stock can assemble. A combo is
   * sellable only if EVERY item has enough stock, so the bundle is capped by
   * its scarcest part — a MIN over items, not a sum. An empty combo yields 0.
   *
   * MUST STAY IN SYNC WITH `recompute_combo_quantity` in migration
   * 20260802140000_add_combo_stock_availability, which is the authority once
   * rows exist; this exists so the create response is already correct (the
   * trigger fires only after the combo_items rows land, which is after the
   * combo_products row Prisma returns). Same dual-rule contract as
   * `Product.stockStatus`.
   */
  private resolveComboAvailability(
    resolved: { item: { quantity: number }; sourceStock: number }[],
  ): number {
    if (resolved.length === 0) return 0;
    return resolved.reduce((fewest, { item, sourceStock }) => {
      //* GUARDS MIRROR THE SQL: NEGATIVE STOCK CAN'T PRODUCE A NEGATIVE BUNDLE
      //* COUNT, AND A per-bundle QUANTITY OF 0 CAN'T DIVIDE BY ZERO.
      const perBundle = Math.max(item.quantity, 1);
      return Math.min(fewest, Math.floor(Math.max(sourceStock, 0) / perBundle));
    }, Number.POSITIVE_INFINITY);
  }

  /**
   * A combo must be a discount, not a repackaging: `comboPrice` has to sit
   * strictly below the sum of its parts. Equality is rejected too — paying
   * exactly the sum-of-parts is not an offer, and it is the case an admin
   * lands on by accident when the price field is left matching the items.
   *
   * Checked here rather than in the DTO because `totalPrice` is derived from
   * `items` and is not client input. The floor (`comboPrice > 0`) lives in
   * the DTO instead, since it needs nothing but the payload.
   *
   * NOTE: the DB backstop `combo_products_price_valid` (migration
   * 20260802180000_combo_check_constraints) is the looser `<=` — this is the
   * authority for the strict rule.
   */
  private assertComboPriceBelowParts(
    comboPrice: number,
    totalPrice: number,
  ): void {
    if (comboPrice < totalPrice) return;

    throw new BadRequestException(
      totalPrice <= 0
        ? 'The bundled items have no value to discount, so this combo cannot be priced'
        : `Combo price must be less than the sum of its bundled items (${totalPrice.toFixed(2)})`,
    );
  }

  /**
   * Rejects an admin-entered bundle count that current stock cannot cover.
   * `maxAssemblable` is the derived ceiling; `offeredQuantity` is the cap the
   * admin wants underneath it. The message names the scarcest item, because
   * "only 2 possible" is useless without knowing *which* product caps it.
   */
  private assertOfferedQuantityFits(
    offeredQuantity: number | undefined,
    maxAssemblable: number,
    limiting: string,
  ): void {
    if (offeredQuantity === undefined) return;
    if (offeredQuantity <= maxAssemblable) return;

    throw new BadRequestException(
      maxAssemblable === 0
        ? `This combo cannot be assembled at all right now — "${limiting}" is out of stock`
        : `Only ${maxAssemblable} bundle${maxAssemblable === 1 ? '' : 's'} can be assembled from current stock (limited by "${limiting}"), but ${offeredQuantity} were requested`,
    );
  }

  //* MIRRORS ProductService.computeStockStatus AND THE sync_combo_stock_status
  //* TRIGGER — THE THREE-STATE RULE MUST READ THE SAME IN ALL THREE PLACES.
  private computeStockStatus(
    quantity: number,
    lowStockThreshold: number,
  ): StockStatus {
    if (quantity <= 0) return StockStatus.OUT_OF_STOCK;
    if (quantity <= lowStockThreshold) return StockStatus.LOW_STOCK;
    return StockStatus.IN_STOCK;
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
//* INSTANCE METADATA AND ANY undefined FIELDS FROM THE VALIDATED NESTED DTO.
function toPlainJson(
  value: object | undefined,
): Prisma.InputJsonValue | undefined {
  return value
    ? (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue)
    : undefined;
}
