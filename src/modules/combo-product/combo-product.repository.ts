import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import { CategoryProductStatus } from '../../generated/prisma/enums';
import { PaginationService } from '../../shared/pagination';
import {
  COMBO_PRODUCT_SELECT_ADMIN,
  COMBO_PRODUCT_SELECT_PUBLIC,
} from './combo-product.select';

@Injectable()
export class ComboProductRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  // ─── Reads — Single Lookups (role-based) ────────────────────────────────────

  async findByIdAdmin(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboProduct.findUnique({
      where: { id },
      select: COMBO_PRODUCT_SELECT_ADMIN,
    });
  }

  async findBySlugAdmin(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboProduct.findUnique({
      where: { slug },
      select: COMBO_PRODUCT_SELECT_ADMIN,
    });
  }

  async findByTitle(title: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboProduct.findUnique({
      where: { title },
      select: COMBO_PRODUCT_SELECT_ADMIN,
    });
  }

  async findBySlugPublic(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboProduct.findUnique({
      where: { slug },
      select: COMBO_PRODUCT_SELECT_PUBLIC,
    });
  }

  /** Active combos, newest first — for a "Combo Deals" home section. */
  async findActiveCombosForHome(
    limit: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.comboProduct.findMany({
      where: { deletedAt: null, status: CategoryProductStatus.ACTIVE },
      select: COMBO_PRODUCT_SELECT_PUBLIC,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ─── Reads — Item Bundling Validation ────────────────────────────────────────
  //* USED BY THE SERVICE TO CONFIRM EVERY BUNDLED product/variantId ACTUALLY
  //* EXISTS AND TO RESOLVE THE FALLBACK unitPrice SNAPSHOT WHEN THE CLIENT
  //* DOESN'T SUPPLY ONE. KEPT DELIBERATELY LEAN — NO GALLERY/CATEGORY JOINS.

  async findProductsByIds(ids: number[], tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    if (ids.length === 0) return [];
    return await client.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, basePrice: true, salePrice: true },
    });
  }

  async findVariantsByIds(ids: number[], tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    if (ids.length === 0) return [];
    return await client.productVariant.findMany({
      where: { id: { in: ids } },
      select: { id: true, productId: true, basePrice: true, salePrice: true },
    });
  }

  // ─── Mutations ───────────────────────────────────────────────────────────────

  async createComboProduct(
    data: Omit<Prisma.ComboProductUncheckedCreateInput, 'images' | 'items'> & {
      images?: Prisma.ComboImageCreateManyComboInput[];
      items?: Prisma.ComboItemCreateManyComboInput[];
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const { images, items, ...comboData } = data;

    return await client.comboProduct.create({
      data: {
        ...comboData,
        images: images?.length ? { createMany: { data: images } } : undefined,
        items: items?.length ? { createMany: { data: items } } : undefined,
      },
      select: COMBO_PRODUCT_SELECT_ADMIN,
    });
  }

  /** Rollback path for a create that failed after the row was written (e.g. a later image upload). */
  async deleteComboProduct(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.comboProduct.delete({
      where: { id },
      select: { id: true },
    });
  }
}
