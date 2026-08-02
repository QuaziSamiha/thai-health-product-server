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
import { ComboItemDto } from './dto/combo-item.dto';
import {
  ComboProductResponseDto,
  ComboProductResponsePublicDto,
} from './dto/combo-product-response.dto';
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

//* MIRRORS THE SCHEMA COLUMN DEFAULT (ComboProduct.lowStockThreshold) — THE
//* CREATE PAYLOAD HAS NO FIELD FOR IT YET, SO THE APP-COMPUTED stockStatus
//* MUST USE THE SAME VALUE THE DB TRIGGER WILL DERIVE FROM THE COLUMN'S OWN
//* DEFAULT. SAME CONTRACT AS ProductService's DEFAULT_LOW_STOCK_THRESHOLD.
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

    const { items, quantity } = await this.resolveComboItems(dto.items);
    const totalPrice = items.reduce(
      (sum, item) => sum + Number(item.unitPrice ?? 0) * (item.quantity ?? 1),
      0,
    );

    //* comboPrice IS THE ACTUAL CHARGE; totalPrice IS THE SUM-OF-PARTS
    //* COMPARISON FIGURE. THE SCHEMA HAS NO CHECK CONSTRAINT FOR THIS (SEE
    //* combo-product-db-schema.md "Financial Integrity") — ENFORCED HERE.
    if (dto.comboPrice > totalPrice) {
      throw new BadRequestException(
        'Combo price cannot be greater than the sum of its bundled items',
      );
    }

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
        stockStatus: this.computeStockStatus(
          quantity,
          DEFAULT_LOW_STOCK_THRESHOLD,
        ),
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        status: dto.status,
        isFeatured: dto.isFeatured,
        seoMetadata: toPlainJson(dto.seoMetadata),
        //* UNLIKE Product (DEFAULTS TO ACTIVE), A COMBO DEFAULTS TO DRAFT AND
        //* "MUST BE EXPLICITLY PUBLISHED" (combo-product-db-schema.md) — SO
        //* ONLY STAMP publishedAt WHEN THE ADMIN EXPLICITLY CHOSE ACTIVE HERE.
        publishedAt:
          dto.status === CategoryProductStatus.ACTIVE ? new Date() : undefined,
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
   * actually belongs to the product it's paired with, and that the pin
   * matches the product's type (VARIABLE requires a variant, SIMPLE forbids
   * one) — then
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
        sourceStock: variant ? variant.quantity : product.quantity,
      };
    });

    return {
      items: resolved.map((entry) => entry.item),
      quantity: this.resolveComboAvailability(resolved),
    };
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
