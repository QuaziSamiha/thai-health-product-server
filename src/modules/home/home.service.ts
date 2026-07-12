import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HomeRepository } from './home.repository';
import { CreateHomeDto } from './dto/create-home.dto';
import { UpdateHomeDto } from './dto/update-home.dto';
import { HomeQueryDto } from './dto/home-query.dto';
import {
  HomeResponseDto,
  HomeResponsePublicDto,
  FeaturedHomeContentsResponseDto,
} from './dto/home-response.dto';
import { STORAGE_SERVICE_TOKEN } from '../../shared/storage/storage.constants';
import type { IStorageService } from '../../shared/storage/interfaces/storage.interface';
import { IPaginatedResult, PaginationQueryDto } from '../../shared/pagination';
import { HomeContentType } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { CategoryService } from '../category/category.service';
import { ProductService } from '../product/product.service';

const HOME_IMAGE_FOLDER = 'home/images';

@Injectable()
export class HomeService {
  private readonly logger = new Logger(HomeService.name);

  constructor(
    private readonly homeRepository: HomeRepository,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: IStorageService,
    private readonly configService: ConfigService,
    private readonly categoryService: CategoryService,
    private readonly productService: ProductService,
  ) {}

  async createHome(
    userId: number,
    createHomeDto: CreateHomeDto,
    image?: Express.Multer.File,
  ): Promise<HomeResponseDto> {
    //* imageUrl IS NOT NULL AT THE DB LAYER — ENFORCE IT HERE SINCE MULTER
    //* FILES AREN'T RUN THROUGH class-validator
    if (!image) {
      throw new BadRequestException('An image is required');
    }

    const {
      type,
      status,
      heading,
      bodyText,
      headingTh,
      bodyTextTh,
      videoUrl,
      redirectUrl,
      displayOrder,
    } = createHomeDto;

    const imagePath = await this.uploadFile(image, HOME_IMAGE_FOLDER);

    try {
      //* ORDER RESOLUTION + INSERT RUN AS ONE TRANSACTION SO A CONCURRENT
      //* CREATE CAN'T OBSERVE A PARTIALLY-SHIFTED displayOrder SEQUENCE
      const newHome = await this.homeRepository.withTransaction((tx) =>
        this.insertAtDisplayOrder(
          {
            type,
            status,
            heading,
            bodyText,
            headingTh,
            bodyTextTh,
            videoUrl,
            redirectUrl,
            imageUrl: imagePath,
            createdBy: userId,
          },
          displayOrder,
          tx,
        ),
      );

      return new HomeResponseDto(
        newHome,
        this.configService.get<string>('app.baseUrl'),
      );
    } catch (error) {
      await this.deleteFile(imagePath, HOME_IMAGE_FOLDER);
      throw error;
    }
  }

  /**
   * Resolves the row's final displayOrder, scoped to its own `type`, then creates it:
   * - No position requested  → appended after the current last row of this type.
   * - Explicit position      → inserted there, pushing every later row of this
   *   type down by one, so two rows of the same type never collide on displayOrder.
   */
  private async insertAtDisplayOrder(
    data: Omit<Prisma.HomeUncheckedCreateInput, 'displayOrder'>,
    requestedOrder: number | undefined,
    tx: Prisma.TransactionClient,
  ) {
    let targetOrder = requestedOrder;
    if (targetOrder === undefined) {
      targetOrder =
        (await this.homeRepository.findMaxDisplayOrderByType(data.type, tx)) +
        1;
    } else {
      await this.homeRepository.shiftDisplayOrders(data.type, targetOrder, tx);
    }

    return this.homeRepository.createHome(
      { ...data, displayOrder: targetOrder },
      tx,
    );
  }

  async getAllHomeContents(
    params: HomeQueryDto,
  ): Promise<IPaginatedResult<HomeResponseDto>> {
    const { type, ...paginationParams } = params;
    return this.getHomeContentsByType(paginationParams, type);
  }

  private async getHomeContentsByType(
    params: PaginationQueryDto,
    type?: HomeContentType,
  ): Promise<IPaginatedResult<HomeResponseDto>> {
    const paginatedHomeContents = await this.homeRepository.findAllAdmin(
      params,
      type,
    );

    return {
      ...paginatedHomeContents,
      data: paginatedHomeContents.data.map(
        (home) =>
          new HomeResponseDto(
            home,
            this.configService.get<string>('app.baseUrl'),
          ),
      ),
    };
  }

  /**
   * Everything the public storefront homepage needs in one call: the two
   * "above the fold" slots, the root category list, and three product
   * sections. Categories/products are fetched via CategoryService/
   * ProductService, never queried directly here — this method only
   * composes what those modules already expose, in parallel since none of
   * the six lookups depend on another.
   */
  async getFeaturedHomeContents(): Promise<FeaturedHomeContentsResponseDto> {
    const baseUrl = this.configService.get<string>('app.baseUrl');
    const [
      heroSlider,
      promotionBanner,
      categories,
      comboProducts,
      featuredProducts,
      products,
    ] = await Promise.all([
      this.homeRepository.findFeaturedByType(HomeContentType.HERO_SLIDER),
      this.homeRepository.findFeaturedByType(HomeContentType.PROMOTION_BANNER),
      this.categoryService.getActiveRootCategoriesForHome(),
      this.productService.getComboProducts(),
      this.productService.getFeaturedProducts(),
      this.productService.getNonFeaturedProducts(),
    ]);

    return new FeaturedHomeContentsResponseDto(
      heroSlider ? new HomeResponsePublicDto(heroSlider, baseUrl) : null,
      promotionBanner
        ? new HomeResponsePublicDto(promotionBanner, baseUrl)
        : null,
      categories,
      comboProducts,
      featuredProducts,
      products,
    );
  }

  async updateHome(
    id: number,
    updateHomeDto: UpdateHomeDto,
    image?: Express.Multer.File,
  ): Promise<HomeResponseDto> {
    const home = await this.homeRepository.findByIdAdmin(id);
    if (!home) {
      throw new NotFoundException(`Home content with ID ${id} not found`);
    }
    this.assertVideoUrlAllowed(home.type, updateHomeDto.videoUrl);

    const {
      status,
      heading,
      bodyText,
      headingTh,
      bodyTextTh,
      videoUrl,
      redirectUrl,
      displayOrder,
    } = updateHomeDto;
    const updateData: {
      status?: UpdateHomeDto['status'];
      heading?: string;
      bodyText?: string;
      headingTh?: string;
      bodyTextTh?: string;
      videoUrl?: string;
      redirectUrl?: string;
      displayOrder?: number;
      imageUrl?: string;
    } = {
      status,
      heading,
      bodyText,
      headingTh,
      bodyTextTh,
      videoUrl,
      redirectUrl,
    };

    if (image) {
      updateData.imageUrl = await this.uploadFile(image, HOME_IMAGE_FOLDER);
      if (home.imageUrl) {
        await this.deleteFile(home.imageUrl, HOME_IMAGE_FOLDER);
      }
    }

    //* REORDER + UPDATE RUN AS ONE TRANSACTION SO A CONCURRENT REORDER ON THE
    //* SAME type CAN'T INTERLEAVE WITH THIS ROW'S SHIFT AND PRODUCE A COLLISION
    const updatedHome = await this.homeRepository.withTransaction(
      async (tx) => {
        if (displayOrder !== undefined) {
          updateData.displayOrder = await this.moveDisplayOrder(
            id,
            home.type,
            displayOrder,
            tx,
          );
        }
        return this.homeRepository.updateHome(id, updateData, tx);
      },
    );

    return new HomeResponseDto(
      updatedHome,
      this.configService.get<string>('app.baseUrl'),
    );
  }

  /**
   * Moves a row to `requestedOrder` within its own `type`, shifting every row
   * between the old and new position by one slot so the sequence stays dense —
   * no gaps, no collisions. `requestedOrder` is clamped to the last valid
   * position for the type (can't move past the end, that would leave a gap).
   * Re-reads the row's current position inside the transaction rather than
   * trusting a value captured before it started, so a concurrent reorder on
   * the same type can't produce a lost update.
   */
  private async moveDisplayOrder(
    id: number,
    type: HomeContentType,
    requestedOrder: number,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const [current, maxOrder] = await Promise.all([
      this.homeRepository.findDisplayOrderById(id, tx),
      this.homeRepository.findMaxDisplayOrderByType(type, tx),
    ]);
    const currentOrder = current?.displayOrder ?? 0;
    const targetOrder = Math.min(Math.max(requestedOrder, 0), maxOrder);

    if (targetOrder === currentOrder) {
      return currentOrder;
    }

    if (targetOrder < currentOrder) {
      //* MOVING EARLIER — EVERYTHING FROM targetOrder UP TO (BUT NOT INCLUDING) THE
      //* ROW'S OLD POSITION SHIFTS ONE SLOT LATER TO MAKE ROOM
      await this.homeRepository.shiftDisplayOrdersInRange(
        type,
        targetOrder,
        currentOrder - 1,
        1,
        id,
        tx,
      );
    } else {
      //* MOVING LATER — EVERYTHING BETWEEN THE ROW'S OLD POSITION AND ITS NEW
      //* ONE SHIFTS ONE SLOT EARLIER TO CLOSE THE GAP LEFT BEHIND
      await this.homeRepository.shiftDisplayOrdersInRange(
        type,
        currentOrder + 1,
        targetOrder,
        -1,
        id,
        tx,
      );
    }

    return targetOrder;
  }

  async deleteHome(id: number): Promise<void> {
    const home = await this.homeRepository.findByIdAdmin(id);
    if (!home) {
      throw new NotFoundException(`Home content with ID ${id} not found`);
    }

    //* DELETE + GAP-CLOSE RUN AS ONE TRANSACTION SO A CONCURRENT CREATE/REORDER
    //* ON THE SAME type CAN'T INTERLEAVE WITH THE SHIFT AND LEAVE A GAP OR COLLISION
    await this.homeRepository.withTransaction(async (tx) => {
      await this.homeRepository.deleteHome(id, tx);
      await this.homeRepository.closeDisplayOrderGap(
        home.type,
        home.displayOrder,
        tx,
      );
    });

    if (home.imageUrl) {
      await this.deleteFile(home.imageUrl, HOME_IMAGE_FOLDER);
    }
  }

  /**
   * videoUrl is OVC-only content — a hero slider must never carry one.
   * CreateHomeDto enforces this at the DTO layer via @IsEmptyWhen since `type`
   * is part of that payload; `type` is immutable on update (omitted from
   * UpdateHomeDto by design), so this direction can only be checked here,
   * against the row's actual stored type.
   */
  private assertVideoUrlAllowed(
    type: HomeContentType,
    videoUrl: string | undefined,
  ): void {
    if (type === HomeContentType.HERO_SLIDER && videoUrl) {
      throw new BadRequestException(
        'Video URL is not allowed for hero slider content',
      );
    }
  }

  private async uploadFile(
    file: Express.Multer.File,
    folder: string,
  ): Promise<string> {
    const savedFile = await this.storageService.saveFile(file, folder);
    return savedFile.path;
  }

  private async deleteFile(path: string, folder: string): Promise<void> {
    const filename = path.split('/').pop();
    if (!filename) {
      return;
    }
    await this.storageService
      .deleteFile(filename, folder)
      .catch((e) =>
        this.logger.warn(`Could not delete home content image: ${e}`),
      );
  }
}
