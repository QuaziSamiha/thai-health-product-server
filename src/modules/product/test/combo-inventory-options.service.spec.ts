import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { ProductService } from '../product.service';
import { ProductRepository } from '../product.repository';
import { CategoryService } from '../../category/category.service';
import { STORAGE_SERVICE_TOKEN } from '../../../shared/storage/storage.constants';
import type { IStorageService } from '../../../shared/storage/interfaces/storage.interface';
import {
  CategoryProductStatus,
  ProductType,
  StockStatus,
} from '../../../generated/prisma/enums';

// ---------------------------------------------------------------------------
// Covers ONE rule: membership in the combo-builder option list is decided by
// STATUS ALONE — every ACTIVE simple product and every ACTIVE variant, at any
// stock level. `availableForCombo` rides along as data for the caller's Qty
// cap; it must never remove a row. The status filtering itself is a Prisma
// `where` (see findProductComboInventoryOptions) and so is exercised against
// a real DB, not here — these tests pin the SERVICE's own shaping.
// ---------------------------------------------------------------------------

const BASE_URL = 'http://localhost:8000';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Royal Jelly',
  slug: 'royal-jelly',
  sku: null,
  barcode: null,
  type: ProductType.SIMPLE,
  status: CategoryProductStatus.ACTIVE,
  quantity: 0,
  comboQuantity: 0,
  costPrice: null,
  basePrice: 250,
  salePrice: 250,
  stockStatus: StockStatus.OUT_OF_STOCK,
  images: [],
  updatedAt: new Date('2026-08-19'),
  variants: [],
  ...overrides,
});

const variantRow = (overrides: Record<string, unknown> = {}) => ({
  id: 11,
  name: 'Royal Jelly 30 Capsules',
  slug: 'royal-jelly-30-capsules',
  sku: null,
  barcode: null,
  quantity: 0,
  comboQuantity: 0,
  costPrice: null,
  basePrice: 250,
  salePrice: 250,
  stockStatus: StockStatus.OUT_OF_STOCK,
  ...overrides,
});

describe('ProductService.getProductComboInventoryOptions', () => {
  let service: ProductService;
  let repo: { findProductComboInventoryOptions: jest.Mock };

  beforeEach(async () => {
    repo = { findProductComboInventoryOptions: jest.fn() };

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

  it('keeps an ACTIVE simple product with zero free stock', async () => {
    repo.findProductComboInventoryOptions.mockResolvedValue([row()]);

    const options = await service.getProductComboInventoryOptions();

    //* AN EARLIER REVISION DROPPED THIS ROW (availableForCombo < 1), WHICH READ
    //* TO THE ADMIN AS "MY PRODUCT IS MISSING" RATHER THAN "NO FREE STOCK".
    expect(options).toHaveLength(1);
    expect(options[0].availableForCombo).toBe(0);
  });

  it('keeps an ACTIVE variant whose stock is already fully committed', async () => {
    repo.findProductComboInventoryOptions.mockResolvedValue([
      row({
        type: ProductType.VARIABLE,
        variants: [variantRow({ quantity: 5, comboQuantity: 9 })],
      }),
    ]);

    const options = await service.getProductComboInventoryOptions();

    expect(options).toHaveLength(1);
    expect(options[0].variantId).toBe(11);
    //* NEGATIVE IS REPORTED HONESTLY, NOT CLAMPED AND NOT FILTERED — THE FORMS
    //* FLOOR IT AT 0 FOR THE Qty CAP AND BLOCK SUBMIT ABOVE IT.
    expect(options[0].availableForCombo).toBe(-4);
  });

  it('returns one option per ACTIVE variant, not one per product', async () => {
    repo.findProductComboInventoryOptions.mockResolvedValue([
      row({
        type: ProductType.VARIABLE,
        variants: [
          variantRow({ id: 11 }),
          variantRow({ id: 12, name: 'Royal Jelly 60 Capsules' }),
        ],
      }),
    ]);

    const options = await service.getProductComboInventoryOptions();

    expect(options.map((option) => option.variantId)).toEqual([11, 12]);
  });

  it('drops a VARIABLE product whose every variant is retired', async () => {
    //* THE REPOSITORY'S variantStatus FILTER LEAVES SUCH A PRODUCT WITH AN
    //* EMPTY `variants` ARRAY. THE FLATTENING RULE WOULD FALL BACK TO AN
    //* UNPINNED PRODUCT-LEVEL OPTION, WHICH resolveComboItems REJECTS ON SAVE.
    repo.findProductComboInventoryOptions.mockResolvedValue([
      row({ type: ProductType.VARIABLE, variants: [] }),
    ]);

    await expect(service.getProductComboInventoryOptions()).resolves.toEqual(
      [],
    );
  });
});
