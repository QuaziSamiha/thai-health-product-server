import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CategoryController } from '../category.controller';
import { CategoryService } from '../category.service';
import {
  CategoryResponseDto,
  RootActiveCategoryResponseDto,
} from '../dto/category-response.dto';
import { CategoryProductStatus } from '../../../generated/prisma/enums';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal shape that satisfies CategoryResponseDto for assertion purposes. */
const makeCategoryDto = (
  overrides: Partial<CategoryResponseDto> = {},
): CategoryResponseDto =>
  ({
    id: 1,
    sid: 'uuid-111',
    status: CategoryProductStatus.ACTIVE,
    name: 'Electronics',
    slug: 'electronics',
    level: 0,
    displayOrder: 0,
    isFeatured: false,
    productCount: 0,
    childrenCount: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }) as CategoryResponseDto;

const makeRootDto = (): RootActiveCategoryResponseDto => ({
  id: 1,
  name: 'Electronics',
});

/** Creates a minimal authenticated request object. */
const makeAuthReq = (userId = 1) =>
  ({ user: { id: userId } }) as import('express').Request & {
    user: { id: number };
  };

const makeFile = (): Express.Multer.File =>
  ({
    fieldname: 'image',
    originalname: 'test.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: Buffer.from(''),
    size: 1024,
  }) as Express.Multer.File;

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockCategoryService = () => ({
  createCategory: jest.fn(),
  getAllCategories: jest.fn(),
  getAllActiveCategories: jest.fn(),
  getActiveRootCategories: jest.fn(),
  getCategoryBySlug: jest.fn(),
  updateCategory: jest.fn(),
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
//
// The controller no longer wraps responses itself (@Res() + sendResponse()) —
// it just returns data or throws, and the global ResponseInterceptor /
// GlobalExceptionFilter take care of the envelope. So these tests assert on
// the resolved/rejected value of the controller method directly.

describe('CategoryController', () => {
  let controller: CategoryController;
  let service: ReturnType<typeof mockCategoryService>;

  beforeEach(async () => {
    service = mockCategoryService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoryController],
      providers: [{ provide: CategoryService, useValue: service }],
    }).compile();

    controller = module.get<CategoryController>(CategoryController);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // createCategory
  // =========================================================================

  describe('createCategory', () => {
    it('returns the created category on success', async () => {
      const dto = makeCategoryDto();
      service.createCategory.mockResolvedValue(dto);

      const result = await controller.createCategory(
        { name: 'Electronics' },
        {},
        makeAuthReq(),
      );

      expect(result).toEqual(dto);
    });

    it('throws UnauthorizedException when user identity is missing from the request', async () => {
      const req = {
        user: undefined,
      } as unknown as import('express').Request & { user?: { id: number } };

      await expect(
        controller.createCategory({ name: 'X' }, {}, req),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('propagates NotFoundException from the service (parent not found)', async () => {
      service.createCategory.mockRejectedValue(
        new NotFoundException('Parent category not found'),
      );

      await expect(
        controller.createCategory(
          { name: 'X', parentId: 999 },
          {},
          makeAuthReq(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates ConflictException from the service (duplicate name)', async () => {
      service.createCategory.mockRejectedValue(
        new ConflictException('Category with this name already exists'),
      );

      await expect(
        controller.createCategory({ name: 'Electronics' }, {}, makeAuthReq()),
      ).rejects.toThrow(ConflictException);
    });

    it('propagates unexpected service errors unchanged', async () => {
      service.createCategory.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        controller.createCategory({ name: 'X' }, {}, makeAuthReq()),
      ).rejects.toThrow('DB connection lost');
    });

    it('passes uploaded files to the service', async () => {
      service.createCategory.mockResolvedValue(makeCategoryDto());
      const files = { iconImage: [makeFile()], bannerImage: [makeFile()] };

      await controller.createCategory({ name: 'X' }, files, makeAuthReq());

      expect(service.createCategory).toHaveBeenCalledWith(
        1,
        { name: 'X' },
        expect.objectContaining({
          iconImage: files.iconImage[0],
          bannerImage: files.bannerImage[0],
          thumbnailImage: undefined,
        }),
      );
    });
  });

  // =========================================================================
  // getAllCategories
  // =========================================================================

  describe('getAllCategories', () => {
    it('returns the paginated result from the service untouched', async () => {
      const paginatedResult = {
        data: [makeCategoryDto()],
        meta: {
          totalItems: 1,
          itemCount: 1,
          itemsPerPage: 10,
          totalPages: 1,
          currentPage: 1,
          nextCursor: null,
        },
      };
      service.getAllCategories.mockResolvedValue(paginatedResult);

      const result = await controller.getAllCategories({
        page: 1,
        limit: 10,
      } as never);

      expect(result).toEqual(paginatedResult);
    });

    it('propagates unexpected service errors unchanged', async () => {
      service.getAllCategories.mockRejectedValue(new Error('DB error'));

      await expect(
        controller.getAllCategories({ page: 1, limit: 10 } as never),
      ).rejects.toThrow('DB error');
    });
  });

  // =========================================================================
  // getAllActiveCategories
  // =========================================================================

  describe('getAllActiveCategories', () => {
    it('returns the active category list', async () => {
      const categories = [
        makeCategoryDto(),
        makeCategoryDto({ id: 2, name: 'Fashion' }),
      ];
      service.getAllActiveCategories.mockResolvedValue(categories);

      const result = await controller.getAllActiveCategories();

      expect(result).toEqual(categories);
    });

    it('propagates unexpected service errors unchanged', async () => {
      service.getAllActiveCategories.mockRejectedValue(new Error('fail'));

      await expect(controller.getAllActiveCategories()).rejects.toThrow('fail');
    });
  });

  // =========================================================================
  // getRootCategories
  // =========================================================================

  describe('getRootCategories', () => {
    it('returns the root category list', async () => {
      const roots = [makeRootDto()];
      service.getActiveRootCategories.mockResolvedValue(roots);

      const result = await controller.getRootCategories();

      expect(result).toEqual(roots);
    });

    it('propagates unexpected service errors unchanged', async () => {
      service.getActiveRootCategories.mockRejectedValue(new Error('fail'));

      await expect(controller.getRootCategories()).rejects.toThrow('fail');
    });
  });

  // =========================================================================
  // getCategoryBySlug
  // =========================================================================

  describe('getCategoryBySlug', () => {
    it('returns the category when the slug exists', async () => {
      const cat = makeCategoryDto();
      service.getCategoryBySlug.mockResolvedValue(cat);

      const result = await controller.getCategoryBySlug('electronics');

      expect(result).toEqual(cat);
    });

    it('propagates NotFoundException from the service', async () => {
      service.getCategoryBySlug.mockRejectedValue(
        new NotFoundException('Category not found'),
      );

      await expect(
        controller.getCategoryBySlug('unknown-slug'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // updateCategory
  // =========================================================================

  describe('updateCategory', () => {
    it('returns the updated category on success', async () => {
      const updated = makeCategoryDto({ name: 'New Name' });
      service.updateCategory.mockResolvedValue(updated);

      const result = await controller.updateCategory(
        1,
        { name: 'New Name' },
        {},
        makeAuthReq(),
      );

      expect(result).toEqual(updated);
    });

    it('throws UnauthorizedException when user identity is missing', async () => {
      const req = {
        user: undefined,
      } as unknown as import('express').Request & { user?: { id: number } };

      await expect(controller.updateCategory(1, {}, {}, req)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('propagates NotFoundException from the service', async () => {
      service.updateCategory.mockRejectedValue(
        new NotFoundException(`Category with ID 1 not found`),
      );

      await expect(
        controller.updateCategory(1, {}, {}, makeAuthReq()),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates ConflictException from the service (duplicate slug)', async () => {
      service.updateCategory.mockRejectedValue(
        new ConflictException('New category name results in a duplicate name'),
      );

      await expect(
        controller.updateCategory(1, { name: 'Duplicate' }, {}, makeAuthReq()),
      ).rejects.toThrow(ConflictException);
    });

    it('passes uploaded files to the service', async () => {
      service.updateCategory.mockResolvedValue(makeCategoryDto());
      const files = {
        image: [makeFile()],
        iconImage: [makeFile()],
        thumbnailImage: [makeFile()],
        bannerImage: [makeFile()],
      };

      await controller.updateCategory(1, {}, files, makeAuthReq());

      expect(service.updateCategory).toHaveBeenCalledWith(
        1,
        1,
        {},
        expect.objectContaining({
          image: files.image[0],
          iconImage: files.iconImage[0],
          thumbnailImage: files.thumbnailImage[0],
          bannerImage: files.bannerImage[0],
        }),
      );
    });

    it('propagates unexpected service errors unchanged', async () => {
      service.updateCategory.mockRejectedValue(new Error('Unexpected'));

      await expect(
        controller.updateCategory(1, {}, {}, makeAuthReq()),
      ).rejects.toThrow('Unexpected');
    });
  });
});
