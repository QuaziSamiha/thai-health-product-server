import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { ProductService } from '../product.service';
import { ProductRepository } from '../product.repository';
import { CategoryService } from '../../category/category.service';
import { STORAGE_SERVICE_TOKEN } from '../../../shared/storage/storage.constants';
import type { IStorageService } from '../../../shared/storage/interfaces/storage.interface';
import {
  CategoryProductStatus,
  DiscountType,
  ProductType,
  StockStatus,
} from '../../../generated/prisma/enums';

// ---------------------------------------------------------------------------
// Covers the promotional-product rules: at most two products hold a slot, only
// an ACTIVE product can take one, and a product that holds one cannot be
// deactivated or deleted until its slot is replaced or removed.
// ---------------------------------------------------------------------------

const BASE_URL = 'http://localhost:8000';
const ACTIVE = CategoryProductStatus.ACTIVE;
const INACTIVE = CategoryProductStatus.INACTIVE;

const makeVariant = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Royal Jelly variant 30 Capsules',
  size: '30 Capsules',
  quantity: 10,
  lowStockThreshold: 10,
  isDefault: true,
  variantStatus: ACTIVE,
  basePrice: 250,
  discountType: DiscountType.PERCENTAGE,
  discountValue: null,
  ...overrides,
});

const makeProduct = (overrides: Record<string, unknown> = {}) => ({
  id: 12,
  name: 'Royal Jelly',
  slug: 'royal-jelly',
  type: ProductType.SIMPLE,
  status: ACTIVE,
  isPromotional: false,
  publishedAt: new Date('2026-01-01'),
  deletedAt: null,
  quantity: 10,
  totalStock: 0,
  lowStockThreshold: 10,
  stockStatus: StockStatus.IN_STOCK,
  basePrice: 250,
  discountType: DiscountType.PERCENTAGE,
  discountValue: null,
  images: [],
  variants: [],
  ...overrides,
});

const mockProductRepository = () => ({
  findByIdAdmin: jest.fn(),
  findBySlugAdmin: jest.fn(),
  findByName: jest.fn(),
  updateProduct: jest.fn(),
  reconcileVariants: jest.fn(),
  deleteImages: jest.fn(),
  createImages: jest.fn(),
  reorderImages: jest.fn(),
  softDeleteProduct: jest.fn(),
  hardDeleteProduct: jest.fn(),
  findImagePathsForDeletion: jest.fn(),
  findCombosUsingVariants: jest.fn().mockResolvedValue([]),
  findLiveCombosUsingVariants: jest.fn().mockResolvedValue([]),
  findDormantCombosUsingVariants: jest.fn().mockResolvedValue([]),
  findVariantForStatusUpdate: jest.fn(),
  findVariantForStatusResponse: jest.fn(),
  setVariantStatus: jest.fn(),
  countPromotionalProducts: jest.fn().mockResolvedValue(0),
  lockPromotionalSlots: jest.fn(),
  withTransaction: jest.fn((cb: (tx: unknown) => unknown) => cb({})),
});

describe('ProductService — promotional products', () => {
  let service: ProductService;
  let repo: ReturnType<typeof mockProductRepository>;

  beforeEach(async () => {
    repo = mockProductRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: ProductRepository, useValue: repo },
        {
          provide: CategoryService,
          useValue: { assertCategoryAssignableToProduct: jest.fn() },
        },
        {
          provide: STORAGE_SERVICE_TOKEN,
          useValue: {
            saveFile: jest.fn(),
            deleteFile: jest.fn(),
            getUploadPath: jest.fn(),
          } as unknown as IStorageService,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(BASE_URL) },
        },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  describe('addPromotionalProduct', () => {
    it('promotes an active product while a slot is free, under the slot lock', async () => {
      const product = makeProduct();
      repo.findByIdAdmin.mockResolvedValue(product);
      repo.countPromotionalProducts.mockResolvedValue(1);
      repo.updateProduct.mockResolvedValue({ ...product, isPromotional: true });

      const result = await service.addPromotionalProduct(12, 1);

      expect(repo.lockPromotionalSlots).toHaveBeenCalled();
      expect(repo.updateProduct).toHaveBeenCalledWith(
        12,
        { isPromotional: true, updatedBy: 1 },
        expect.anything(),
      );
      expect(result.isPromotional).toBe(true);
    });

    it('refuses a third promotional product', async () => {
      repo.findByIdAdmin.mockResolvedValue(makeProduct());
      repo.countPromotionalProducts.mockResolvedValue(2);

      await expect(service.addPromotionalProduct(12, 1)).rejects.toThrow(
        ConflictException,
      );
      expect(repo.updateProduct).not.toHaveBeenCalled();
    });

    it('refuses an inactive product', async () => {
      repo.findByIdAdmin.mockResolvedValue(makeProduct({ status: INACTIVE }));

      await expect(service.addPromotionalProduct(12, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a product that is already promotional', async () => {
      repo.findByIdAdmin.mockResolvedValue(
        makeProduct({ isPromotional: true }),
      );

      await expect(service.addPromotionalProduct(12, 1)).rejects.toThrow(
        ConflictException,
      );
    });

    it('404s an unknown product', async () => {
      repo.findByIdAdmin.mockResolvedValue(null);

      await expect(service.addPromotionalProduct(99, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  describe('replacePromotionalProduct', () => {
    it('hands the slot over even when both slots are taken', async () => {
      const current = makeProduct({ id: 12, isPromotional: true });
      const next = makeProduct({ id: 20, name: 'Fish Oil', slug: 'fish-oil' });
      repo.findByIdAdmin.mockImplementation((id: number) =>
        Promise.resolve(id === 12 ? current : next),
      );
      repo.countPromotionalProducts.mockResolvedValue(2);
      repo.updateProduct.mockResolvedValue({ ...next, isPromotional: true });

      await service.replacePromotionalProduct(12, 20, 1);

      expect(repo.updateProduct).toHaveBeenNthCalledWith(
        1,
        12,
        { isPromotional: false, updatedBy: 1 },
        expect.anything(),
      );
      expect(repo.updateProduct).toHaveBeenNthCalledWith(
        2,
        20,
        { isPromotional: true, updatedBy: 1 },
        expect.anything(),
      );
    });

    it('refuses when the current product is not promotional', async () => {
      repo.findByIdAdmin.mockResolvedValue(makeProduct());

      await expect(
        service.replacePromotionalProduct(12, 20, 1),
      ).rejects.toThrow(ConflictException);
      expect(repo.updateProduct).not.toHaveBeenCalled();
    });

    it('refuses to replace a product with itself', async () => {
      await expect(
        service.replacePromotionalProduct(12, 12, 1),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  describe('removePromotionalProduct', () => {
    it('clears the flag', async () => {
      const product = makeProduct({ isPromotional: true });
      repo.findByIdAdmin.mockResolvedValue(product);
      repo.updateProduct.mockResolvedValue({
        ...product,
        isPromotional: false,
      });

      await service.removePromotionalProduct(12, 1);

      expect(repo.updateProduct).toHaveBeenCalledWith(
        12,
        { isPromotional: false, updatedBy: 1 },
        expect.anything(),
      );
    });

    it('refuses a product that is not promotional', async () => {
      repo.findByIdAdmin.mockResolvedValue(makeProduct());

      await expect(service.removePromotionalProduct(12, 1)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // =========================================================================
  describe('a promotional product cannot leave ACTIVE', () => {
    it('refuses a direct status edit to INACTIVE', async () => {
      repo.findByIdAdmin.mockResolvedValue(
        makeProduct({ isPromotional: true }),
      );

      await expect(
        service.updateProduct(12, 1, { status: INACTIVE }, []),
      ).rejects.toThrow(ConflictException);
      expect(repo.updateProduct).not.toHaveBeenCalled();
    });

    it('still allows other edits to a promotional product', async () => {
      const product = makeProduct({ isPromotional: true });
      repo.findByIdAdmin.mockResolvedValue(product);
      repo.updateProduct.mockResolvedValue(product);

      await service.updateProduct(12, 1, { nameTh: 'นมผึ้ง' }, []);

      expect(repo.updateProduct).toHaveBeenCalled();
    });

    it('lets a non-promotional product be deactivated as before', async () => {
      const product = makeProduct();
      repo.findByIdAdmin.mockResolvedValue(product);
      repo.updateProduct.mockResolvedValue(product);

      await service.updateProduct(12, 1, { status: INACTIVE }, []);

      expect(repo.updateProduct).toHaveBeenCalled();
    });

    it('refuses retiring the last active variant of a promotional VARIABLE product', async () => {
      const variant = makeVariant({ id: 1 });
      const product = makeProduct({
        type: ProductType.VARIABLE,
        isPromotional: true,
        variants: [variant],
      });
      repo.findVariantForStatusUpdate.mockResolvedValue({
        ...variant,
        productId: product.id,
        product,
      });

      await expect(
        service.updateVariantStatus(1, 1, { variantStatus: INACTIVE }),
      ).rejects.toThrow(ConflictException);
      expect(repo.setVariantStatus).not.toHaveBeenCalled();
    });

    it('refuses a soft delete', async () => {
      repo.findByIdAdmin.mockResolvedValue(
        makeProduct({ isPromotional: true }),
      );

      await expect(service.softDeleteProduct(12, 1)).rejects.toThrow(
        ConflictException,
      );
      expect(repo.softDeleteProduct).not.toHaveBeenCalled();
    });

    it('refuses a hard delete', async () => {
      repo.findImagePathsForDeletion.mockResolvedValue({
        id: 12,
        name: 'Royal Jelly',
        isPromotional: true,
        images: [],
      });

      await expect(service.hardDeleteProduct(12)).rejects.toThrow(
        ConflictException,
      );
      expect(repo.hardDeleteProduct).not.toHaveBeenCalled();
    });
  });
});
