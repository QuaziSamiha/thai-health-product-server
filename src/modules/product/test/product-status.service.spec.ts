import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

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
// Covers ONE rule: a VARIABLE product's `status` follows its variants, while a
// SIMPLE product's is whatever the admin typed. Every other product concern
// (pricing, images, slugs) is deliberately out of scope here.
// ---------------------------------------------------------------------------

const BASE_URL = 'http://localhost:8000';
const ACTIVE = CategoryProductStatus.ACTIVE;
const INACTIVE = CategoryProductStatus.INACTIVE;
const DRAFT = CategoryProductStatus.DRAFT;

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
  type: ProductType.VARIABLE,
  status: ACTIVE,
  publishedAt: new Date('2026-01-01'),
  deletedAt: null,
  quantity: 0,
  totalStock: 10,
  lowStockThreshold: 10,
  stockStatus: StockStatus.IN_STOCK,
  basePrice: 250,
  discountType: DiscountType.PERCENTAGE,
  discountValue: null,
  images: [],
  variants: [makeVariant()],
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
  findCombosUsingVariants: jest.fn().mockResolvedValue([]),
  findLiveCombosUsingVariants: jest.fn().mockResolvedValue([]),
  findDormantCombosUsingVariants: jest.fn().mockResolvedValue([]),
  findVariantForStatusUpdate: jest.fn(),
  findVariantForStatusResponse: jest.fn(),
  setVariantStatus: jest.fn(),
  //* RUNS THE CALLBACK INLINE — THE RULE UNDER TEST WRITES INSIDE THE
  //* TRANSACTION, SO A NO-OP WRAPPER WOULD SKIP IT ENTIRELY.
  withTransaction: jest.fn((cb: (tx: unknown) => unknown) => cb({})),
});

describe('ProductService — a variable product status follows its variants', () => {
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

  /** The `data` object the service handed to the repository update. */
  const writtenUpdate = () =>
    repo.updateProduct.mock.calls[0][1] as Record<string, unknown>;

  // =========================================================================
  describe('updateProduct', () => {
    it('lets a SIMPLE product be deactivated directly', async () => {
      const existing = makeProduct({
        type: ProductType.SIMPLE,
        variants: [],
        quantity: 5,
      });
      repo.findByIdAdmin.mockResolvedValue(existing);
      repo.updateProduct.mockResolvedValue(existing);

      await service.updateProduct(12, 1, { status: INACTIVE }, []);

      expect(writtenUpdate().status).toBe(INACTIVE);
    });

    it('refuses to deactivate a VARIABLE product while a variant is active', async () => {
      repo.findByIdAdmin.mockResolvedValue(
        makeProduct({ variants: [makeVariant({ variantStatus: ACTIVE })] }),
      );
      repo.updateProduct.mockResolvedValue(makeProduct());

      await service.updateProduct(12, 1, { status: INACTIVE }, []);

      //* OVERRIDDEN, NOT REJECTED — SOMETHING IS STILL ON SALE, SO INACTIVE
      //* WOULD HIDE A LIVE VARIANT BEHIND A DEAD PRODUCT PAGE. THE STORED
      //* VALUE IS ALREADY ACTIVE, SO NOTHING IS WRITTEN AT ALL.
      expect(writtenUpdate().status).toBeUndefined();
    });

    it('deactivates a VARIABLE product when the reconcile retires every variant', async () => {
      repo.findByIdAdmin.mockResolvedValue(
        makeProduct({
          status: ACTIVE,
          variants: [
            makeVariant({ id: 1 }),
            makeVariant({ id: 2, isDefault: false }),
          ],
        }),
      );
      repo.updateProduct.mockResolvedValue(makeProduct());

      await service.updateProduct(
        12,
        1,
        {
          variants: [
            { id: 1, variantStatus: INACTIVE },
            { id: 2, variantStatus: INACTIVE },
          ],
        },
        [],
      );

      expect(writtenUpdate().status).toBe(INACTIVE);
    });

    it('reactivates a VARIABLE product when a variant comes back, stamping publishedAt', async () => {
      repo.findByIdAdmin.mockResolvedValue(
        makeProduct({
          status: INACTIVE,
          publishedAt: null,
          variants: [makeVariant({ variantStatus: INACTIVE })],
        }),
      );
      repo.updateProduct.mockResolvedValue(makeProduct());

      await service.updateProduct(
        12,
        1,
        { variants: [{ id: 1, variantStatus: ACTIVE }] },
        [],
      );

      const written = writtenUpdate();
      expect(written.status).toBe(ACTIVE);
      //* ACTIVE WITHOUT A LAUNCH STAMP NEVER PASSES THE PUBLIC
      //* publishedAt <= now() GATE — THE PAIR HAS TO MOVE TOGETHER.
      expect(written.publishedAt).toBeInstanceOf(Date);
    });

    it('leaves DRAFT alone — a lifecycle position, not a sellability toggle', async () => {
      repo.findByIdAdmin.mockResolvedValue(
        makeProduct({ status: DRAFT, variants: [makeVariant()] }),
      );
      repo.updateProduct.mockResolvedValue(makeProduct());

      await service.updateProduct(12, 1, { status: DRAFT }, []);

      //* AN ACTIVE VARIANT MUST NOT PUBLISH A DRAFT PRODUCT OUT FROM UNDER
      //* THE ADMIN.
      expect(writtenUpdate().status).toBe(DRAFT);
    });
  });

  // =========================================================================
  describe('updateVariantStatus', () => {
    const arrangeToggle = (product: ReturnType<typeof makeProduct>) => {
      const variant = product.variants[0];
      repo.findVariantForStatusUpdate.mockResolvedValue({
        ...variant,
        productId: product.id,
        product,
      });
      repo.findVariantForStatusResponse.mockResolvedValue({
        id: variant.id,
        name: variant.name,
        variantStatus: ACTIVE,
        isDefault: true,
        product: {
          id: product.id,
          name: product.name,
          totalStock: 0,
          stockStatus: StockStatus.OUT_OF_STOCK,
          variants: [],
        },
      });
      repo.updateProduct.mockResolvedValue(product);
    };

    it('retiring the LAST active variant is allowed and deactivates the product', async () => {
      arrangeToggle(
        makeProduct({ status: ACTIVE, variants: [makeVariant({ id: 1 })] }),
      );

      await service.updateVariantStatus(1, 1, { variantStatus: INACTIVE });

      //* AN EARLIER REVISION THREW 409 HERE. THE RULE NOW RUNS THE OTHER WAY:
      //* PRODUCT STATUS FOLLOWS ITS VARIANTS RATHER THAN CONSTRAINING THEM.
      expect(repo.setVariantStatus).toHaveBeenCalled();
      expect(writtenUpdate().status).toBe(INACTIVE);
    });

    it('keeps the product ACTIVE when a sibling is still active', async () => {
      arrangeToggle(
        makeProduct({
          status: ACTIVE,
          variants: [
            makeVariant({ id: 1 }),
            makeVariant({ id: 2, isDefault: false, variantStatus: ACTIVE }),
          ],
        }),
      );

      await service.updateVariantStatus(1, 1, { variantStatus: INACTIVE });

      //* undefined = ALREADY CORRECT, SO NO REDUNDANT WRITE.
      expect(writtenUpdate().status).toBeUndefined();
    });

    it('reactivating a variant brings the product back and stamps publishedAt', async () => {
      arrangeToggle(
        makeProduct({
          status: INACTIVE,
          publishedAt: null,
          variants: [makeVariant({ id: 1, variantStatus: INACTIVE })],
        }),
      );

      await service.updateVariantStatus(1, 1, { variantStatus: ACTIVE });

      const written = writtenUpdate();
      expect(written.status).toBe(ACTIVE);
      expect(written.publishedAt).toBeInstanceOf(Date);
    });

    it('still refuses to retire a variant a live combo depends on', async () => {
      arrangeToggle(
        makeProduct({ status: ACTIVE, variants: [makeVariant({ id: 1 })] }),
      );
      repo.findLiveCombosUsingVariants.mockResolvedValue([
        {
          variantId: 1,
          variant: { name: 'Royal Jelly 30 Capsules' },
          combo: { id: 7, title: 'Starter Bundle' },
        },
      ]);

      //* THE COMBO GUARD IS INDEPENDENT OF THE STATUS RULE AND HAD TO SURVIVE
      //* THE REMOVAL OF THE LAST-ACTIVE-VARIANT CHECK.
      await expect(
        service.updateVariantStatus(1, 1, { variantStatus: INACTIVE }),
      ).rejects.toThrow('Starter Bundle');
      expect(repo.setVariantStatus).not.toHaveBeenCalled();
    });
  });
});
