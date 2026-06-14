import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CategoryService } from '../category.service';
import { CategoryRepository } from '../category.repository';
import { STORAGE_SERVICE_TOKEN } from '../../../shared/storage/storage.constants';
import type { IStorageService } from '../../../shared/storage/interfaces/storage.interface';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { ERROR_MESSAGES } from '../../../common/constants/error-messages';
import {
  CategoryProductStatus,
  UserRole,
} from '../../../generated/prisma/enums';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'http://localhost:3000';

const makeFile = (name = 'test.jpg'): Express.Multer.File =>
  ({
    fieldname: 'image',
    originalname: name,
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: Buffer.from(''),
    size: 1024,
    destination: '',
    filename: name,
    path: '',
    stream: null as never,
  }) as Express.Multer.File;

const mockUser = { id: 1, role: UserRole.ADMIN, profile: { name: 'Admin' } };

const makeCategory = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  sid: 'uuid-111',
  status: CategoryProductStatus.ACTIVE,
  name: 'Electronics',
  slug: 'electronics',
  description: 'Electronic devices',
  nameTh: null,
  descriptionTh: null,
  parentId: null,
  parent: null,
  children: [],
  _count: { children: 0 },
  level: 0,
  thumbnailUrl: null,
  bannerUrl: null,
  iconUrl: null,
  displayOrder: 0,
  isFeatured: false,
  productCount: 0,
  metaTitle: null,
  metaDescription: null,
  metaTitleTh: null,
  metaDescriptionTh: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  createdByUser: mockUser,
  updatedByUser: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCategoryRepository = () => ({
  findById: jest.fn(),
  findBySlug: jest.fn(),
  createCategory: jest.fn(),
  deleteCategory: jest.fn(),
  updateCategory: jest.fn(),
  findAllCategories: jest.fn(),
  findAllActiveCategories: jest.fn(),
  findActiveRootCategories: jest.fn(),
});

const mockStorageService = (): jest.Mocked<IStorageService> => ({
  saveFile: jest.fn(),
  deleteFile: jest.fn(),
  getUploadPath: jest.fn(),
});

jest.mock('../../../common/utils/env.util', () => ({
  getBaseUrl: () => BASE_URL,
}));

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('CategoryService', () => {
  let service: CategoryService;
  let repo: ReturnType<typeof mockCategoryRepository>;
  let storage: jest.Mocked<IStorageService>;

  beforeEach(async () => {
    repo = mockCategoryRepository();
    storage = mockStorageService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: CategoryRepository, useValue: repo },
        { provide: STORAGE_SERVICE_TOKEN, useValue: storage },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // createCategory
  // =========================================================================

  describe('createCategory', () => {
    const dto: CreateCategoryDto = { name: 'Electronics' };
    const userId = 1;

    it('creates a root category (no parent, no images)', async () => {
      const created = makeCategory();
      repo.findBySlug.mockResolvedValue(null);
      repo.createCategory.mockResolvedValue(created);
      repo.findById.mockResolvedValue(created);

      const result = await service.createCategory(userId, dto, {});

      expect(repo.createCategory).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Electronics', slug: 'electronics', level: 0, userId }),
      );
      expect(result.name).toBe('Electronics');
      expect(result.level).toBe(0);
    });

    it('creates a child category and inherits parent level + 1', async () => {
      const parent = makeCategory({ id: 5, level: 1 });
      const child = makeCategory({ id: 6, parentId: 5, level: 2 });
      repo.findById.mockResolvedValueOnce(parent).mockResolvedValueOnce(child);
      repo.findBySlug.mockResolvedValue(null);
      repo.createCategory.mockResolvedValue(child);

      const result = await service.createCategory(
        userId,
        { name: 'Electronics', parentId: 5 },
        {},
      );

      expect(repo.createCategory).toHaveBeenCalledWith(
        expect.objectContaining({ level: 2, parentId: 5 }),
      );
      expect(result.level).toBe(2);
    });

    it('throws NotFoundException when parentId points to a non-existent category', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.createCategory(userId, { name: 'X', parentId: 99 }, {}),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.createCategory(userId, { name: 'X', parentId: 99 }, {}),
      ).rejects.toThrow(ERROR_MESSAGES.CATEGORY.PARENT_NOT_FOUND);
    });

    it('throws ConflictException when a category with the same name already exists', async () => {
      repo.findBySlug.mockResolvedValue(makeCategory());

      await expect(
        service.createCategory(userId, dto, {}),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.createCategory(userId, dto, {}),
      ).rejects.toThrow(ERROR_MESSAGES.CATEGORY.DUPLICATE_NAME);
    });

    it('uploads all three images and updates category URLs', async () => {
      const created = makeCategory();
      const updated = makeCategory({
        iconUrl: '/categories/icon-images/icon.jpg',
        thumbnailUrl: '/categories/thumbnail-images/thumb.jpg',
        bannerUrl: '/categories/banner-images/banner.jpg',
      });
      repo.findBySlug.mockResolvedValue(null);
      repo.createCategory.mockResolvedValue(created);
      repo.findById.mockResolvedValue(updated);
      repo.updateCategory.mockResolvedValue(updated);
      storage.saveFile
        .mockResolvedValueOnce({ filename: 'banner.jpg', path: '/categories/banner-images/banner.jpg' })
        .mockResolvedValueOnce({ filename: 'icon.jpg', path: '/categories/icon-images/icon.jpg' })
        .mockResolvedValueOnce({ filename: 'thumb.jpg', path: '/categories/thumbnail-images/thumb.jpg' });

      const result = await service.createCategory(userId, dto, {
        bannerImage: makeFile('banner.jpg'),
        iconImage: makeFile('icon.jpg'),
        thumbnailImage: makeFile('thumb.jpg'),
      });

      expect(storage.saveFile).toHaveBeenCalledTimes(3);
      expect(repo.updateCategory).toHaveBeenCalledWith(
        created.id,
        expect.objectContaining({
          bannerUrl: '/categories/banner-images/banner.jpg',
          iconUrl: '/categories/icon-images/icon.jpg',
          thumbnailUrl: '/categories/thumbnail-images/thumb.jpg',
        }),
      );
      expect(result.bannerUrl).toBe(`${BASE_URL}/categories/banner-images/banner.jpg`);
    });

    it('uploads only iconImage when only iconImage is provided', async () => {
      const created = makeCategory();
      const updated = makeCategory({ iconUrl: '/categories/icon-images/icon.jpg' });
      repo.findBySlug.mockResolvedValue(null);
      repo.createCategory.mockResolvedValue(created);
      repo.findById.mockResolvedValue(updated);
      repo.updateCategory.mockResolvedValue(updated);
      storage.saveFile.mockResolvedValue({ filename: 'icon.jpg', path: '/categories/icon-images/icon.jpg' });

      await service.createCategory(userId, dto, { iconImage: makeFile('icon.jpg') });

      expect(storage.saveFile).toHaveBeenCalledTimes(1);
      expect(repo.updateCategory).toHaveBeenCalledWith(
        created.id,
        expect.objectContaining({ iconUrl: '/categories/icon-images/icon.jpg' }),
      );
    });

    it('rolls back DB record and cleans up partial uploads on image upload failure', async () => {
      const created = makeCategory();
      repo.findBySlug.mockResolvedValue(null);
      repo.createCategory.mockResolvedValue(created);
      repo.deleteCategory.mockResolvedValue(undefined);
      // First upload succeeds, second throws
      storage.saveFile
        .mockResolvedValueOnce({ filename: 'banner.jpg', path: '/categories/banner-images/banner.jpg' })
        .mockRejectedValueOnce(new Error('S3 timeout'));
      storage.deleteFile.mockResolvedValue(undefined);

      await expect(
        service.createCategory(userId, dto, {
          bannerImage: makeFile('banner.jpg'),
          iconImage: makeFile('icon.jpg'),
        }),
      ).rejects.toThrow('S3 timeout');

      expect(repo.deleteCategory).toHaveBeenCalledWith(created.id);
      expect(storage.deleteFile).toHaveBeenCalledWith('banner.jpg', 'categories/banner-images');
    });

    it('does not call updateCategory when no images are provided', async () => {
      const created = makeCategory();
      repo.findBySlug.mockResolvedValue(null);
      repo.createCategory.mockResolvedValue(created);
      repo.findById.mockResolvedValue(created);

      await service.createCategory(userId, dto, {});

      expect(storage.saveFile).not.toHaveBeenCalled();
      expect(repo.updateCategory).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getAllCategories
  // =========================================================================

  describe('getAllCategories', () => {
    it('returns a paginated result with mapped DTOs', async () => {
      const cat = makeCategory();
      repo.findAllCategories.mockResolvedValue({
        data: [cat],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });

      const result = await service.getAllCategories({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Electronics');
      expect(result.meta.total).toBe(1);
    });
  });

  // =========================================================================
  // getAllActiveCategories
  // =========================================================================

  describe('getAllActiveCategories', () => {
    it('returns all active categories as DTOs', async () => {
      repo.findAllActiveCategories.mockResolvedValue([makeCategory(), makeCategory({ id: 2, name: 'Fashion', slug: 'fashion' })]);

      const result = await service.getAllActiveCategories();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Electronics');
      expect(result[1].name).toBe('Fashion');
    });

    it('returns an empty array when no active categories exist', async () => {
      repo.findAllActiveCategories.mockResolvedValue([]);

      const result = await service.getAllActiveCategories();

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // getActiveRootCategories
  // =========================================================================

  describe('getActiveRootCategories', () => {
    it('returns active root categories as minimal DTOs', async () => {
      repo.findActiveRootCategories.mockResolvedValue([
        { id: 1, name: 'Electronics' },
        { id: 2, name: 'Fashion' },
      ]);

      const result = await service.getActiveRootCategories();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 1, name: 'Electronics' });
    });
  });

  // =========================================================================
  // getCategoryBySlug
  // =========================================================================

  describe('getCategoryBySlug', () => {
    it('returns a category DTO when the slug exists', async () => {
      repo.findBySlug.mockResolvedValue(makeCategory());

      const result = await service.getCategoryBySlug('electronics');

      expect(result.slug).toBe('electronics');
    });

    it('throws NotFoundException when slug does not exist', async () => {
      repo.findBySlug.mockResolvedValue(null);

      await expect(service.getCategoryBySlug('unknown')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getCategoryBySlug('unknown')).rejects.toThrow(
        ERROR_MESSAGES.CATEGORY.NOT_FOUND,
      );
    });
  });

  // =========================================================================
  // updateCategory
  // =========================================================================

  describe('updateCategory', () => {
    const userId = 1;
    const categoryId = 1;
    const dto: UpdateCategoryDto = {};
    const noImages = { image: undefined, iconImage: undefined, thumbnailImage: undefined, bannerImage: undefined };

    it('throws NotFoundException when category does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.updateCategory(categoryId, userId, dto, noImages),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.updateCategory(categoryId, userId, dto, noImages),
      ).rejects.toThrow(ERROR_MESSAGES.CATEGORY.NOT_FOUND_BY_ID(categoryId));
    });

    it('throws BadRequestException when parentId equals the category id (self-parent)', async () => {
      repo.findById.mockResolvedValue(makeCategory());

      await expect(
        service.updateCategory(categoryId, userId, { parentId: categoryId }, noImages),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateCategory(categoryId, userId, { parentId: categoryId }, noImages),
      ).rejects.toThrow(ERROR_MESSAGES.CATEGORY.SELF_PARENT);
    });

    it('generates a new slug when name changes', async () => {
      const existing = makeCategory();
      repo.findById.mockResolvedValue(existing);
      repo.findBySlug.mockResolvedValue(null);
      repo.updateCategory.mockResolvedValue(makeCategory({ name: 'Consumer Electronics', slug: 'consumer-electronics' }));

      await service.updateCategory(categoryId, userId, { name: 'Consumer Electronics' }, noImages);

      expect(repo.updateCategory).toHaveBeenCalledWith(
        categoryId,
        expect.objectContaining({ slug: 'consumer-electronics' }),
      );
    });

    it('does not regenerate slug when name is unchanged', async () => {
      const existing = makeCategory();
      repo.findById.mockResolvedValue(existing);
      repo.updateCategory.mockResolvedValue(existing);

      await service.updateCategory(categoryId, userId, { name: 'Electronics' }, noImages);

      expect(repo.findBySlug).not.toHaveBeenCalled();
      const call = repo.updateCategory.mock.calls[0][1] as Record<string, unknown>;
      expect(call.slug).toBeUndefined();
    });

    it('throws ConflictException when new name collides with another category slug', async () => {
      const existing = makeCategory();
      const other = makeCategory({ id: 99, slug: 'fashion' });
      repo.findById.mockResolvedValue(existing);
      repo.findBySlug.mockResolvedValue(other);

      await expect(
        service.updateCategory(categoryId, userId, { name: 'Fashion' }, noImages),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.updateCategory(categoryId, userId, { name: 'Fashion' }, noImages),
      ).rejects.toThrow(ERROR_MESSAGES.CATEGORY.DUPLICATE_NAME_ON_UPDATE);
    });

    it('does not throw ConflictException when slug matches itself (safe rename to same name)', async () => {
      const existing = makeCategory();
      repo.findById.mockResolvedValue(existing);
      // findBySlug returns the same category (id matches)
      repo.findBySlug.mockResolvedValue(existing);
      repo.updateCategory.mockResolvedValue(existing);

      await expect(
        service.updateCategory(categoryId, userId, { name: 'Electronics' }, noImages),
      ).resolves.not.toThrow();
    });

    it('sets level to 0 when parentId is explicitly null (promote to root)', async () => {
      const existing = makeCategory({ parentId: 5, level: 2 });
      repo.findById.mockResolvedValue(existing);
      repo.updateCategory.mockResolvedValue(makeCategory({ level: 0 }));

      await service.updateCategory(categoryId, userId, { parentId: null as never }, noImages);

      expect(repo.updateCategory).toHaveBeenCalledWith(
        categoryId,
        expect.objectContaining({ level: 0 }),
      );
    });

    it('updates level to parent.level + 1 when parentId changes', async () => {
      const existing = makeCategory();
      const newParent = makeCategory({ id: 10, level: 3 });
      repo.findById.mockResolvedValueOnce(existing).mockResolvedValueOnce(newParent);
      repo.updateCategory.mockResolvedValue(makeCategory({ level: 4 }));

      await service.updateCategory(categoryId, userId, { parentId: 10 }, noImages);

      expect(repo.updateCategory).toHaveBeenCalledWith(
        categoryId,
        expect.objectContaining({ level: 4 }),
      );
    });

    it('throws NotFoundException when new parentId does not exist', async () => {
      repo.findById.mockResolvedValueOnce(makeCategory()).mockResolvedValueOnce(null);

      await expect(
        service.updateCategory(categoryId, userId, { parentId: 999 }, noImages),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.updateCategory(categoryId, userId, { parentId: 999 }, noImages),
      ).rejects.toThrow(ERROR_MESSAGES.CATEGORY.PARENT_NOT_FOUND);
    });

    it('uploads new bannerImage, saves URL, and deletes the old file', async () => {
      const existing = makeCategory({ bannerUrl: '/categories/banner-images/old.jpg' });
      const updatedCat = makeCategory({ bannerUrl: '/categories/banner-images/new.jpg' });
      repo.findById.mockResolvedValue(existing);
      repo.updateCategory.mockResolvedValue(updatedCat);
      storage.saveFile.mockResolvedValue({ filename: 'new.jpg', path: '/categories/banner-images/new.jpg' });
      storage.deleteFile.mockResolvedValue(undefined);

      await service.updateCategory(
        categoryId,
        userId,
        dto,
        { ...noImages, bannerImage: makeFile('new.jpg') },
      );

      expect(storage.saveFile).toHaveBeenCalledWith(expect.any(Object), 'categories/banner-images');
      expect(storage.deleteFile).toHaveBeenCalledWith('old.jpg', 'categories/banner-images');
      expect(repo.updateCategory).toHaveBeenCalledWith(
        categoryId,
        expect.objectContaining({ bannerUrl: '/categories/banner-images/new.jpg' }),
      );
    });

    it('treats image as an alias for bannerImage during update', async () => {
      const existing = makeCategory();
      repo.findById.mockResolvedValue(existing);
      repo.updateCategory.mockResolvedValue(makeCategory({ bannerUrl: '/categories/banner-images/img.jpg' }));
      storage.saveFile.mockResolvedValue({ filename: 'img.jpg', path: '/categories/banner-images/img.jpg' });

      await service.updateCategory(
        categoryId,
        userId,
        dto,
        { ...noImages, image: makeFile('img.jpg') },
      );

      expect(storage.saveFile).toHaveBeenCalledWith(expect.any(Object), 'categories/banner-images');
    });

    it('uploads new iconImage and deletes the old file', async () => {
      const existing = makeCategory({ iconUrl: '/categories/icon-images/old-icon.jpg' });
      repo.findById.mockResolvedValue(existing);
      repo.updateCategory.mockResolvedValue(makeCategory({ iconUrl: '/categories/icon-images/new-icon.jpg' }));
      storage.saveFile.mockResolvedValue({ filename: 'new-icon.jpg', path: '/categories/icon-images/new-icon.jpg' });
      storage.deleteFile.mockResolvedValue(undefined);

      await service.updateCategory(
        categoryId,
        userId,
        dto,
        { ...noImages, iconImage: makeFile('new-icon.jpg') },
      );

      expect(storage.deleteFile).toHaveBeenCalledWith('old-icon.jpg', 'categories/icon-images');
    });

    it('uploads new thumbnailImage and deletes the old file', async () => {
      const existing = makeCategory({ thumbnailUrl: '/categories/thumbnail-images/old-thumb.jpg' });
      repo.findById.mockResolvedValue(existing);
      repo.updateCategory.mockResolvedValue(makeCategory({ thumbnailUrl: '/categories/thumbnail-images/new-thumb.jpg' }));
      storage.saveFile.mockResolvedValue({ filename: 'new-thumb.jpg', path: '/categories/thumbnail-images/new-thumb.jpg' });
      storage.deleteFile.mockResolvedValue(undefined);

      await service.updateCategory(
        categoryId,
        userId,
        dto,
        { ...noImages, thumbnailImage: makeFile('new-thumb.jpg') },
      );

      expect(storage.deleteFile).toHaveBeenCalledWith('old-thumb.jpg', 'categories/thumbnail-images');
    });

    it('skips deleteFile when no previous image URL exists', async () => {
      const existing = makeCategory({ bannerUrl: null });
      repo.findById.mockResolvedValue(existing);
      repo.updateCategory.mockResolvedValue(makeCategory({ bannerUrl: '/categories/banner-images/new.jpg' }));
      storage.saveFile.mockResolvedValue({ filename: 'new.jpg', path: '/categories/banner-images/new.jpg' });

      await service.updateCategory(
        categoryId,
        userId,
        dto,
        { ...noImages, bannerImage: makeFile('new.jpg') },
      );

      expect(storage.deleteFile).not.toHaveBeenCalled();
    });

    it('returns the updated category as a CategoryResponseAdminDto', async () => {
      const existing = makeCategory();
      const updated = makeCategory({ name: 'Updated Name', slug: 'updated-name' });
      repo.findById.mockResolvedValue(existing);
      repo.findBySlug.mockResolvedValue(null);
      repo.updateCategory.mockResolvedValue(updated);

      const result = await service.updateCategory(
        categoryId,
        userId,
        { name: 'Updated Name' },
        noImages,
      );

      expect(result.name).toBe('Updated Name');
      expect(result.slug).toBe('updated-name');
    });
  });
});
