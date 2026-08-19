import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CategoryRepository } from './category.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { generateSlug } from '../../common/utils/slug.util';
import {
  CategoryResponseDto,
  RootActiveCategoryResponseDto,
  CategoryHomeResponseDto,
} from './dto/category-response.dto';
import {
  CategoryDeletionAction,
  CategoryDeletionResponseDto,
} from './dto/category-deletion-response.dto';
import { parseStoragePath } from '../../common/utils/storage-path.util';
import { STORAGE_SERVICE_TOKEN } from '../../shared/storage/storage.constants';
import type { IStorageService } from '../../shared/storage/interfaces/storage.interface';
import { PaginationQueryDto, IPaginatedResult } from '../../shared/pagination';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryProductStatus } from '../../generated/prisma/enums';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    private readonly categoryRepository: CategoryRepository,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: IStorageService,
    private readonly configService: ConfigService,
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
        throw new NotFoundException('Parent category not found');
      }
      level = parent.level + 1;
    }

    const slug = generateSlug(name);
    const existingCategory = await this.categoryRepository.findBySlug(slug);
    if (existingCategory) {
      throw new ConflictException('Category with this name already exists');
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
    return new CategoryResponseDto(
      created ?? newCategory,
      this.configService.get<string>('app.baseUrl'),
    );
  }

  async getAllCategories(
    params: PaginationQueryDto,
  ): Promise<IPaginatedResult<CategoryResponseDto>> {
    const paginatedCategories =
      await this.categoryRepository.findAllCategories(params);

    return {
      ...paginatedCategories,
      data: paginatedCategories.data.map(
        (category) =>
          new CategoryResponseDto(
            category,
            this.configService.get<string>('app.baseUrl'),
          ),
      ),
    };
  }

  async getAllActiveCategories(): Promise<CategoryResponseDto[]> {
    const categories = await this.categoryRepository.findAllActiveCategories();
    return categories.map(
      (category) =>
        new CategoryResponseDto(
          category,
          this.configService.get<string>('app.baseUrl'),
        ),
    );
  }

  async getActiveRootCategories(): Promise<RootActiveCategoryResponseDto[]> {
    const categories = await this.categoryRepository.findActiveRootCategories();
    return categories.map(
      (category) => new RootActiveCategoryResponseDto(category),
    );
  }

  /**
   * Root categories for a home-page "shop by category" widget. Not exposed
   * via this module's own controller — a home-content module composing
   * this alongside product sections imports CategoryModule and injects
   * CategoryService directly, which already exports it.
   */
  async getActiveRootCategoriesForHome(): Promise<CategoryHomeResponseDto[]> {
    const categories =
      await this.categoryRepository.findActiveRootCategoriesForHome();
    const baseUrl = this.configService.get<string>('app.baseUrl');
    return categories.map(
      (category) => new CategoryHomeResponseDto(category, baseUrl),
    );
  }

  async getProductCategories(): Promise<RootActiveCategoryResponseDto[]> {
    const categories = await this.categoryRepository.findProductCategories();
    return categories.map(
      (category) => new RootActiveCategoryResponseDto(category),
    );
  }

  async getCategoryBySlug(slug: string): Promise<CategoryResponseDto> {
    const existingCategory = await this.categoryRepository.findBySlug(slug);
    if (!existingCategory) {
      throw new NotFoundException('Category not found');
    }
    return new CategoryResponseDto(
      existingCategory,
      this.configService.get<string>('app.baseUrl'),
    );
  }

  /**
   * Validates that a category is a legal target to file a product under:
   * it must exist, be ACTIVE, and must NOT be a root category. Root
   * categories (`parentId IS NULL`) are organizational containers only —
   * every product must be filed under one of their children instead, so the
   * storefront's category browsing tree never has products sitting directly
   * on a top-level node alongside its subcategories.
   */
  async assertCategoryAssignableToProduct(categoryId: number): Promise<void> {
    const category = await this.categoryRepository.findById(categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    if (category.status !== CategoryProductStatus.ACTIVE) {
      throw new BadRequestException(
        'Category is not active and cannot be assigned to a product',
      );
    }
    if (category.parentId === null) {
      throw new BadRequestException(
        'Products cannot be assigned directly to a root category — choose one of its subcategories',
      );
    }
  }

  /**
   * Removes a category — by destroying it when that is safe, and by retiring
   * it when it is not. The caller does not choose between the two; the data
   * does.
   *
   * The database already refuses the unsafe cases, but only as raw FK
   * violations (`Category.parentId` is `NO ACTION`, `Product.categoryId` is
   * `RESTRICT`), which surface as opaque `500`s. This method pre-checks both
   * so every outcome is a deliberate, explainable response:
   *
   * 1. **Has sub-categories → `409`.** The only real fix is to re-parent or
   *    remove them first, and doing that implicitly would either orphan a
   *    subtree or silently cascade a delete across it. Archiving instead is
   *    not a safe substitute either: the children would stay `ACTIVE` and
   *    keep appearing in `all-active-categories`, which lists every depth
   *    flat — the tree would look intact on the storefront while its parent
   *    was gone from the nav. The count is in the message so the admin knows
   *    how much work that is.
   *
   * 2. **Has (or ever had) products → archive, not delete.** Any product row
   *    still pointing here — including a soft-deleted one — holds the
   *    `RESTRICT` FK, so a hard delete is impossible regardless of intent.
   *    `status = ARCHIVED` is the module's documented retirement path: the
   *    row survives, its slug stays resolvable so old links do not 404 into
   *    nothing, its images are left on disk, and an admin can undo it from
   *    the ordinary edit form. Re-archiving an already-`ARCHIVED` category is
   *    a `409` rather than a silent no-op, mirroring
   *    `ProductService.softDeleteProduct`.
   *
   * 3. **Neither → hard delete.** An empty, never-used category is a mistake
   *    to be erased, not history to be kept. Its three image files go with
   *    it, best-effort, *after* the row is gone — the reverse of
   *    `updateCategory`'s ordering, so a failed delete never leaves a
   *    surviving row pointing at files that no longer exist.
   *
   * Both write paths are audited automatically: `Category` is a tracked audit
   * model, so the archive lands as an `UPDATE` diff and the hard delete as a
   * `DELETE` row, with no audit code here.
   */
  async deleteCategory(
    id: number,
    userId: number,
  ): Promise<CategoryDeletionResponseDto> {
    const category = await this.categoryRepository.findForDeletion(id);
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    const { childrenCount, productCount, activeProductCount } = category;

    if (childrenCount > 0) {
      throw new ConflictException({
        message: `Cannot remove "${category.name}" — it still has ${childrenCount} sub-categor${
          childrenCount === 1 ? 'y' : 'ies'
        }. Move them under another parent, or remove them first.`,
        error: 'Conflict',
        errorCode: 'CATEGORY_HAS_CHILDREN',
      });
    }

    if (productCount > 0) {
      if (category.status === CategoryProductStatus.ARCHIVED) {
        throw new ConflictException({
          message: `"${category.name}" is already archived. It cannot be deleted outright because ${productCount} product${
            productCount === 1 ? ' is' : 's are'
          } still filed under it.`,
          error: 'Conflict',
          errorCode: 'CATEGORY_ALREADY_ARCHIVED',
        });
      }

      const archived = await this.categoryRepository.updateCategory(id, {
        status: CategoryProductStatus.ARCHIVED,
        userId,
      });

      return new CategoryDeletionResponseDto({
        id: archived.id,
        name: archived.name,
        slug: archived.slug,
        action: CategoryDeletionAction.ARCHIVED,
        status: archived.status,
        childrenCount,
        productCount,
        activeProductCount,
      });
    }

    await this.categoryRepository.deleteCategory(id);

    const imagePaths = [
      category.bannerUrl,
      category.iconUrl,
      category.thumbnailUrl,
    ].filter((path): path is string => Boolean(path));
    await Promise.all(imagePaths.map((path) => this.deleteStoredFile(path)));

    return new CategoryDeletionResponseDto({
      id: category.id,
      name: category.name,
      slug: category.slug,
      action: CategoryDeletionAction.DELETED,
      status: null,
      childrenCount,
      productCount,
      activeProductCount,
    });
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
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    //* removeBannerImage IS A TRANSPORT-ONLY INSTRUCTION, NOT A COLUMN. IT
    //* MUST BE DESTRUCTURED OFF *HERE* RATHER THAN IGNORED LATER: the
    //* repository spreads whatever it is handed straight into
    //* `category.update({ data })`, so leaving it in would fail the write with
    //* a raw Prisma "Unknown argument" instead of doing anything useful.
    const { removeBannerImage, ...categoryFields } = updateCategoryDto;

    const updateData: Partial<UpdateCategoryDto> & {
      slug?: string;
      level?: number;
      //* null = CLEAR THE COLUMN, undefined = LEAVE IT ALONE (PRISMA SKIPS
      //* undefined KEYS). THAT DISTINCTION IS THE WHOLE REMOVAL MECHANISM.
      bannerUrl?: string | null;
      iconUrl?: string;
      thumbnailUrl?: string;
    } = { ...categoryFields };

    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      const newSlug = generateSlug(updateCategoryDto.name);
      const existingSlug = await this.categoryRepository.findBySlug(newSlug);
      if (existingSlug && existingSlug.id !== id) {
        throw new ConflictException(
          'New category name results in a duplicate name',
        );
      }
      updateData.slug = newSlug;
    }

    if (updateCategoryDto.parentId !== undefined) {
      if (updateCategoryDto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }

      if (updateCategoryDto.parentId === null) {
        updateData.level = 0;
      } else {
        const parent = await this.categoryRepository.findById(
          updateCategoryDto.parentId,
        );
        if (!parent) {
          throw new NotFoundException('Parent category not found');
        }

        await this.assertNoCycle(id, category.name, updateCategoryDto.parentId);

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
    } else if (removeBannerImage && category.bannerUrl) {
      //* ONLY REACHABLE WHEN NO REPLACEMENT WAS UPLOADED — AN UPLOAD ALREADY
      //* REPLACES THE BANNER AND DELETES THE OLD FILE ABOVE, SO HONOURING THE
      //* FLAG TOO WOULD NULL THE COLUMN THE UPLOAD JUST SET AND ORPHAN THE
      //* FILE IT JUST WROTE. THE `category.bannerUrl` GUARD MAKES THE FLAG
      //* IDEMPOTENT: REMOVING AN ALREADY-EMPTY BANNER IS A NO-OP, NOT AN ERROR.
      //* THE COLUMN IS CLEARED WHETHER OR NOT THE FILE DELETE SUCCEEDS —
      //* deleteStoredFile IS BEST-EFFORT BY DESIGN, AND AN ORPHANED FILE ON
      //* DISK IS A FAR SMALLER PROBLEM THAN A ROW STILL POINTING AT AN IMAGE
      //* THE ADMIN ASKED TO REMOVE.
      updateData.bannerUrl = null;
      await this.deleteStoredFile(category.bannerUrl);
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

    return new CategoryResponseDto(
      updatedCategory,
      this.configService.get<string>('app.baseUrl'),
    );
  }

  /**
   * Refuses a re-parent that would close a loop in the hierarchy.
   *
   * `parentId === id` is the one-node case and is rejected by the caller with
   * its own message. This handles every longer one: **A → B → A**, and any
   * depth beyond it. The test is simple once stated correctly — a move is a
   * cycle exactly when the category being moved is already an *ancestor of*
   * (or is) its prospective parent, because the new edge would then point from
   * the branch back into its own root.
   *
   * Walking **up** from the new parent, rather than down from the moved
   * category, is deliberate: an ancestry chain is at most the tree's depth,
   * while a subtree can be the entire table. Both answer the same question.
   *
   * Why this matters more than a tidy data model: `CategoryResponseDto`
   * recurses `parent` and `children`, the storefront builds breadcrumbs by
   * walking `parentId` upward, and the `productCount` rollup walks the tree in
   * both directions. A loop turns every one of those into a non-terminating
   * walk, and nothing downstream re-checks — so this is the last place a cycle
   * can be stopped in application code. (`categories_no_hierarchy_cycle`, the
   * database trigger added in `20260819120000_prevent_category_hierarchy_cycles`,
   * is the backstop underneath it — see the migration for why both exist.)
   */
  private async assertNoCycle(
    id: number,
    name: string,
    newParentId: number,
  ): Promise<void> {
    const chain = await this.categoryRepository.findAncestorChain(newParentId);
    const hit = chain.find((ancestor) => ancestor.id === id);
    if (!hit) return;

    //* `chain` runs new-parent-first; the slice up to and including the moved
    //* category, reversed, is the existing top-down path from it to the
    //* proposed parent — the loop the admin is about to close, spelled out.
    const path = chain
      .slice(0, hit.depth + 1)
      .reverse()
      .map((node) => node.name)
      .join(' → ');

    throw new BadRequestException(
      `Cannot move "${name}" here — that would create a loop in the category tree, because the chosen parent already sits inside its own branch (${path}). Move the sub-branch out first, or pick a parent outside it.`,
    );
  }

  private async uploadFile(
    file: Express.Multer.File,
    folder: string,
  ): Promise<string> {
    const savedFile = await this.storageService.saveFile(file, folder);
    return savedFile.path;
  }

  /**
   * Best-effort file removal. Splits the stored path back into
   * `{ filename, folder }` with `parseStoragePath` — which reverses what
   * `saveFile` produced, at any folder depth — rather than guessing the
   * folder from substrings of the path the way the create-rollback still
   * does. A cleanup failure is logged, never thrown: the DB row is already
   * gone by this point, and failing the request would tell the admin their
   * delete did not happen when it did.
   */
  private async deleteStoredFile(path: string): Promise<void> {
    const { filename, folder } = parseStoragePath(path);
    await this.storageService
      .deleteFile(filename, folder)
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Could not delete category file ${path}: ${message}`);
      });
  }
}
