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
import { CategoryProductStatus } from '../../generated/prisma/enums';

const COMBO_IMAGE_FOLDER = 'combos/gallery';
const DEFAULT_HOME_SECTION_LIMIT = 4;

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

    const items = await this.resolveComboItems(dto.items);
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
        shortDescription: dto.shortDescription,
        shortDescTh: dto.shortDescTh,
        description: dto.description,
        descriptionTh: dto.descriptionTh,
        totalPrice,
        comboPrice: dto.comboPrice,
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
   * Validates every bundled product/variant exists and, when a variant is
   * pinned, that it actually belongs to the product it's paired with — then
   * resolves each item's `unitPrice` snapshot (the client-supplied value
   * wins; otherwise falls back to the variant's/product's current
   * `salePrice ?? basePrice` at bundling time, per ComboItem's documented
   * "price snapshot" contract).
   */
  private async resolveComboItems(
    itemDtos: ComboItemDto[],
  ): Promise<Prisma.ComboItemCreateManyComboInput[]> {
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

    return itemDtos.map((item, index) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
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
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity ?? 1,
        unitPrice: resolvedUnitPrice,
        displayOrder: item.displayOrder ?? index,
      };
    });
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
