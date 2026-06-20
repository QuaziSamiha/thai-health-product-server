import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { CategoryRepository } from './category.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { generateSlug } from '../../common/utils/slug.util';
import {
  CategoryResponseDto,
  RootActiveCategoryResponseDto,
} from './dto/category-response.dto';
import { getBaseUrl } from '../../common/utils/env.util';
import { STORAGE_SERVICE_TOKEN } from '../../shared/storage/storage.constants';
import type { IStorageService } from '../../shared/storage/interfaces/storage.interface';
import { PaginationQueryDto, IPaginatedResult } from '../../shared/pagination';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ERROR_MESSAGES } from '../../common/constants/error-messages';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    private readonly categoryRepository: CategoryRepository,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: IStorageService,
  ) {}

  async createCategory(
    userId: number,
    createCategoryDto: CreateCategoryDto,
    images: {
      iconImage?: Express.Multer.File;
      thumbnailImage?: Express.Multer.File;
      bannerImage?: Express.Multer.File;
    },
  ): Promise<CategoryResponseDto> {
    const { parentId, name, ...restData } = createCategoryDto;

    let level = 0;
    if (parentId) {
      const parent = await this.categoryRepository.findById(parentId);
      if (!parent) {
        throw new NotFoundException(ERROR_MESSAGES.CATEGORY.PARENT_NOT_FOUND);
      }
      level = parent.level + 1;
    }

    const slug = generateSlug(name);
    const existingCategory = await this.categoryRepository.findBySlug(slug);
    if (existingCategory) {
      throw new ConflictException(ERROR_MESSAGES.CATEGORY.DUPLICATE_NAME);
    }

    let bannerImagePath: string | undefined;
    let iconImagePath: string | undefined;
    let thumbnailImagePath: string | undefined;

    const newCategory = await this.categoryRepository.createCategory({
      ...restData,
      name,
      slug,
      level,
      parentId,
      userId,
    });

    try {
      if (images.bannerImage) {
        bannerImagePath = await this.uploadFile(
          images.bannerImage,
          'categories/banner-images',
        );
      }
      if (images.iconImage) {
        iconImagePath = await this.uploadFile(
          images.iconImage,
          'categories/icon-images',
        );
      }
      if (images.thumbnailImage) {
        thumbnailImagePath = await this.uploadFile(
          images.thumbnailImage,
          'categories/thumbnail-images',
        );
      }

      if (bannerImagePath || iconImagePath || thumbnailImagePath) {
        await this.categoryRepository.updateCategory(newCategory.id, {
          ...(bannerImagePath && { bannerUrl: bannerImagePath }),
          ...(iconImagePath && { iconUrl: iconImagePath }),
          ...(thumbnailImagePath && { thumbnailUrl: thumbnailImagePath }),
          userId,
        });
      }
    } catch (uploadError) {
      this.logger.error(
        `File upload failed for category ${newCategory.id}, rolling back`,
        uploadError,
      );
      await this.categoryRepository
        .deleteCategory(newCategory.id)
        .catch((e) =>
          this.logger.warn(
            `Could not delete orphaned category ${newCategory.id}: ${e}`,
          ),
        );
      const pathsToDelete = [
        bannerImagePath,
        iconImagePath,
        thumbnailImagePath,
      ].filter(Boolean) as string[];
      for (const path of pathsToDelete) {
        const filename = path.split('/').pop();
        const folder = path.includes('banner')
          ? 'categories/banner-images'
          : path.includes('icon')
            ? 'categories/icon-images'
            : 'categories/thumbnail-images';
        if (filename) {
          await this.storageService
            .deleteFile(filename, folder)
            .catch((e) =>
              this.logger.warn(
                `Could not delete orphaned file ${filename}: ${e}`,
              ),
            );
        }
      }
      throw uploadError;
    }

    const created = await this.categoryRepository.findById(newCategory.id);
    return new CategoryResponseDto(created ?? newCategory, getBaseUrl());
  }

  async getAllCategories(
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<CategoryResponseDto>> {
    const paginatedCategories =
      await this.categoryRepository.findAllCategories(params);

    return {
      ...paginatedCategories,
      data: paginatedCategories.data.map(
        (category) => new CategoryResponseDto(category, getBaseUrl()),
      ),
    };
  }

  async getAllActiveCategories(): Promise<CategoryResponseDto[]> {
    const categories = await this.categoryRepository.findAllActiveCategories();
    return categories.map(
      (category) => new CategoryResponseDto(category, getBaseUrl()),
    );
  }

  async getActiveRootCategories(): Promise<RootActiveCategoryResponseDto[]> {
    const categories = await this.categoryRepository.findActiveRootCategories();
    return categories.map(
      (category) => new RootActiveCategoryResponseDto(category),
    );
  }

  async getCategoryBySlug(slug: string): Promise<CategoryResponseDto> {
    const existingCategory = await this.categoryRepository.findBySlug(slug);
    if (!existingCategory) {
      throw new NotFoundException(ERROR_MESSAGES.CATEGORY.NOT_FOUND);
    }
    return new CategoryResponseDto(existingCategory, getBaseUrl());
  }

  async updateCategory(
    id: number,
    userId: number,
    updateCategoryDto: UpdateCategoryDto,
    images: {
      image?: Express.Multer.File;
      iconImage?: Express.Multer.File;
      thumbnailImage?: Express.Multer.File;
      bannerImage?: Express.Multer.File;
    },
  ): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundException(ERROR_MESSAGES.CATEGORY.NOT_FOUND_BY_ID(id));
    }

    const updateData: Partial<UpdateCategoryDto> & {
      slug?: string;
      level?: number;
      bannerUrl?: string;
      iconUrl?: string;
      thumbnailUrl?: string;
    } = { ...updateCategoryDto };

    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      const newSlug = generateSlug(updateCategoryDto.name);
      const existingSlug = await this.categoryRepository.findBySlug(newSlug);
      if (existingSlug && existingSlug.id !== id) {
        throw new ConflictException(
          ERROR_MESSAGES.CATEGORY.DUPLICATE_NAME_ON_UPDATE,
        );
      }
      updateData.slug = newSlug;
    }

    if (updateCategoryDto.parentId !== undefined) {
      if (updateCategoryDto.parentId === id) {
        throw new BadRequestException(ERROR_MESSAGES.CATEGORY.SELF_PARENT);
      }

      if (updateCategoryDto.parentId === null) {
        updateData.level = 0;
      } else {
        const parent = await this.categoryRepository.findById(
          updateCategoryDto.parentId,
        );
        if (!parent) {
          throw new NotFoundException(ERROR_MESSAGES.CATEGORY.PARENT_NOT_FOUND);
        }
        updateData.level = parent.level + 1;
      }
    }

    const primaryImage = images.bannerImage || images.image;
    if (primaryImage) {
      updateData.bannerUrl = await this.uploadFile(
        primaryImage,
        'categories/banner-images',
      );
      if (category.bannerUrl) {
        const filename = category.bannerUrl.split('/').pop();
        if (filename) {
          await this.storageService
            .deleteFile(filename, 'categories/banner-images')
            .catch((e) =>
              this.logger.warn(`Could not delete old banner file: ${e}`),
            );
        }
      }
    }

    if (images.iconImage) {
      updateData.iconUrl = await this.uploadFile(
        images.iconImage,
        'categories/icon-images',
      );
      if (category.iconUrl) {
        const filename = category.iconUrl.split('/').pop();
        if (filename) {
          await this.storageService
            .deleteFile(filename, 'categories/icon-images')
            .catch((e) =>
              this.logger.warn(`Could not delete old icon file: ${e}`),
            );
        }
      }
    }

    if (images.thumbnailImage) {
      updateData.thumbnailUrl = await this.uploadFile(
        images.thumbnailImage,
        'categories/thumbnail-images',
      );
      if (category.thumbnailUrl) {
        const filename = category.thumbnailUrl.split('/').pop();
        if (filename) {
          await this.storageService
            .deleteFile(filename, 'categories/thumbnail-images')
            .catch((e) =>
              this.logger.warn(`Could not delete old thumbnail file: ${e}`),
            );
        }
      }
    }

    const updatedCategory = await this.categoryRepository.updateCategory(id, {
      ...updateData,
      userId,
    });

    return new CategoryResponseDto(updatedCategory, getBaseUrl());
  }

  private async uploadFile(
    file: Express.Multer.File,
    folder: string,
  ): Promise<string> {
    const savedFile = await this.storageService.saveFile(file, folder);
    return savedFile.path;
  }
}
