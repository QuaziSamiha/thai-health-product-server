import {
  ConflictException,
  HttpStatus,
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
import {
  CategoryProductStatus,
  UserRole,
} from '../../../generated/prisma/enums';

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

/** Creates a mock Express Response with a spy-able json() and status() chain. */
const makeMockResponse = () => {
  const res: Record<string, jest.Mock> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as unknown as import('express').Response;
};

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
    it('returns 201 with the created category on success', async () => {
      const dto = makeCategoryDto();
      service.createCategory.mockResolvedValue(dto);
      const res = makeMockResponse();
      const req = makeAuthReq();

      await controller.createCategory({ name: 'Electronics' }, {}, req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: dto }),
      );
    });

    it('returns 401 when user identity is missing from the request', async () => {
      const res = makeMockResponse();
      const req = {
        user: undefined,
      } as unknown as import('express').Request & { user?: { id: number } };

      await controller.createCategory({ name: 'X' }, {}, req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      );
    });

    it('returns 404 when service throws NotFoundException (parent not found)', async () => {
      service.createCategory.mockRejectedValue(
        new NotFoundException('Parent category not found'),
      );
      const res = makeMockResponse();

      await controller.createCategory(
        { name: 'X', parentId: 999 },
        {},
        makeAuthReq(),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Parent category not found',
        }),
      );
    });

    it('returns 409 when service throws ConflictException (duplicate name)', async () => {
      service.createCategory.mockRejectedValue(
        new ConflictException('Category with this name already exists'),
      );
      const res = makeMockResponse();

      await controller.createCategory(
        { name: 'Electronics' },
        {},
        makeAuthReq(),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      );
    });

    it('returns 500 when service throws an unexpected error', async () => {
      service.createCategory.mockRejectedValue(new Error('DB connection lost'));
      const res = makeMockResponse();

      await controller.createCategory({ name: 'X' }, {}, makeAuthReq(), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('passes uploaded files to the service', async () => {
      service.createCategory.mockResolvedValue(makeCategoryDto());
      const res = makeMockResponse();
      const files = { iconImage: [makeFile()], bannerImage: [makeFile()] };

      await controller.createCategory({ name: 'X' }, files, makeAuthReq(), res);

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
    it('returns 200 with paginated data and meta', async () => {
      const paginatedResult = {
        data: [makeCategoryDto()],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      service.getAllCategories.mockResolvedValue(paginatedResult);
      const res = makeMockResponse();

      await controller.getAllCategories({ page: 1, limit: 10 }, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: paginatedResult.data,
          meta: paginatedResult.meta,
        }),
      );
    });

    it('returns 500 when service throws an unexpected error', async () => {
      service.getAllCategories.mockRejectedValue(new Error('DB error'));
      const res = makeMockResponse();

      await controller.getAllCategories({ page: 1, limit: 10 }, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      );
    });
  });

  // =========================================================================
  // getAllActiveCategories
  // =========================================================================

  describe('getAllActiveCategories', () => {
    it('returns 200 with the active category list', async () => {
      const categories = [
        makeCategoryDto(),
        makeCategoryDto({ id: 2, name: 'Fashion' }),
      ];
      service.getAllActiveCategories.mockResolvedValue(categories);
      const res = makeMockResponse();

      await controller.getAllActiveCategories(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: categories }),
      );
    });

    it('returns 500 on unexpected service error', async () => {
      service.getAllActiveCategories.mockRejectedValue(new Error('fail'));
      const res = makeMockResponse();

      await controller.getAllActiveCategories(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // =========================================================================
  // getRootCategories
  // =========================================================================

  describe('getRootCategories', () => {
    it('returns 200 with root category list', async () => {
      const roots = [makeRootDto()];
      service.getActiveRootCategories.mockResolvedValue(roots);
      const res = makeMockResponse();

      await controller.getRootCategories(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: roots }),
      );
    });

    it('returns 500 on unexpected service error', async () => {
      service.getActiveRootCategories.mockRejectedValue(new Error('fail'));
      const res = makeMockResponse();

      await controller.getRootCategories(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // =========================================================================
  // getCategoryBySlug
  // =========================================================================

  describe('getCategoryBySlug', () => {
    it('returns 200 with the category when slug exists', async () => {
      const cat = makeCategoryDto();
      service.getCategoryBySlug.mockResolvedValue(cat);
      const res = makeMockResponse();

      await controller.getCategoryBySlug(res, 'electronics');

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: cat }),
      );
    });

    it('returns 404 when service throws NotFoundException', async () => {
      service.getCategoryBySlug.mockRejectedValue(
        new NotFoundException('Category not found'),
      );
      const res = makeMockResponse();

      await controller.getCategoryBySlug(res, 'unknown-slug');

      expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Category not found',
        }),
      );
    });
  });

  // =========================================================================
  // updateCategory
  // =========================================================================

  describe('updateCategory', () => {
    it('returns 200 with the updated category on success', async () => {
      const updated = makeCategoryDto({ name: 'New Name' });
      service.updateCategory.mockResolvedValue(updated);
      const res = makeMockResponse();

      await controller.updateCategory(
        1,
        { name: 'New Name' },
        {},
        makeAuthReq(),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: updated }),
      );
    });

    it('returns 401 when user identity is missing', async () => {
      const res = makeMockResponse();
      const req = {
        user: undefined,
      } as unknown as import('express').Request & { user?: { id: number } };

      await controller.updateCategory(1, {}, {}, req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    });

    it('returns 404 when service throws NotFoundException', async () => {
      service.updateCategory.mockRejectedValue(
        new NotFoundException(`Category with ID 1 not found`),
      );
      const res = makeMockResponse();

      await controller.updateCategory(1, {}, {}, makeAuthReq(), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    });

    it('returns 409 when service throws ConflictException (duplicate slug)', async () => {
      service.updateCategory.mockRejectedValue(
        new ConflictException('New category name results in a duplicate name'),
      );
      const res = makeMockResponse();

      await controller.updateCategory(
        1,
        { name: 'Duplicate' },
        {},
        makeAuthReq(),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    });

    it('returns 400 when service throws UnauthorizedException via guard failure', async () => {
      service.updateCategory.mockRejectedValue(
        new UnauthorizedException('User identity missing from request'),
      );
      const res = makeMockResponse();

      await controller.updateCategory(1, {}, {}, makeAuthReq(), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    });

    it('passes uploaded files to the service', async () => {
      service.updateCategory.mockResolvedValue(makeCategoryDto());
      const res = makeMockResponse();
      const files = {
        image: [makeFile()],
        iconImage: [makeFile()],
        thumbnailImage: [makeFile()],
        bannerImage: [makeFile()],
      };

      await controller.updateCategory(1, {}, files, makeAuthReq(), res);

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

    it('returns 500 on unexpected service error', async () => {
      service.updateCategory.mockRejectedValue(new Error('Unexpected'));
      const res = makeMockResponse();

      await controller.updateCategory(1, {}, {}, makeAuthReq(), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
