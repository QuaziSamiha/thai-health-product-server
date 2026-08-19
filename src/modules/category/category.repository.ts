import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import { CategoryProductStatus } from '../../generated/prisma/enums';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoryRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  private readonly CATEGORY_SELECT = {
    id: true,
    sid: true,
    status: true,
    name: true,
    slug: true,
    description: true,
    nameTh: true,
    descriptionTh: true,
    parentId: true,
    parent: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    children: {
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        description: true,
      },
    },
    _count: {
      select: { children: true },
    },
    level: true,
    thumbnailUrl: true,
    bannerUrl: true,
    iconUrl: true,
    displayOrder: true,
    isFeatured: true,
    productCount: true,
    metaTitle: true,
    metaDescription: true,
    metaTitleTh: true,
    metaDescriptionTh: true,
    createdAt: true,
    updatedAt: true,
    createdByUser: {
      select: {
        id: true,
        role: true,
        profile: {
          select: { firstName: true, lastName: true },
        },
      },
    },
    updatedByUser: {
      select: {
        id: true,
        role: true,
        profile: {
          select: { firstName: true, lastName: true },
        },
      },
    },
  } as const;

  private readonly ROOT_ACTIVE_CATEGORY_SELECT = {
    id: true,
    name: true,
  } as const;

  //* HOME-PAGE CARD SHAPE — a "shop by category" widget needs a bit more than
  //* the nav dropdown (slug to link to, bannerUrl to render, productCount to
  //* display), but still far less than the full CATEGORY_SELECT.
  private readonly HOME_ROOT_CATEGORY_SELECT = {
    id: true,
    name: true,
    slug: true,
    bannerUrl: true,
    productCount: true,
  } as const;

  async findById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.category.findUnique({
      where: { id },
      select: this.CATEGORY_SELECT,
    });
  }

  async findBySlug(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.category.findUnique({
      where: { slug },
      select: this.CATEGORY_SELECT,
    });
  }

  /**
   * The chain of categories from `startId` up to its root: `startId` itself at
   * `depth: 0`, its parent at `depth: 1`, and so on. Used by
   * `CategoryService.updateCategory` to refuse a re-parent that would close a
   * loop — if the category being moved appears anywhere in its prospective
   * parent's ancestry, the move would make it its own ancestor.
   *
   * A recursive CTE rather than a `findUnique` loop: the whole ancestry is one
   * round trip at any depth, and depth here is unbounded (nothing caps
   * `level`).
   *
   * **It carries a `path` array and refuses to revisit an id already in it.**
   * That is not decoration — this query has to be safe on a tree that is
   * *already* cyclic, since rows predating this guard (or written by a seed or
   * a manual `UPDATE`) may contain one. Note that plain `UNION` deduplication
   * would NOT save it: `depth` increments on every pass, so no row ever
   * repeats exactly and the recursion would never terminate. The path check
   * stops at the first repeat instead, returning the loop once.
   *
   * Ordered by `depth`, so `[0]` is always `startId` and reversing a prefix
   * gives the top-down path an error message can print.
   */
  async findAncestorChain(
    startId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<Array<{ id: number; name: string; depth: number }>> {
    const client = tx || this.prisma;
    return await client.$queryRaw<
      Array<{ id: number; name: string; depth: number }>
    >`
      WITH RECURSIVE chain AS (
        SELECT c."id", c."name", c."parentId", 0 AS depth, ARRAY[c."id"] AS path
        FROM "public"."categories" c
        WHERE c."id" = ${startId}
        UNION ALL
        SELECT p."id", p."name", p."parentId", ch.depth + 1, ch.path || p."id"
        FROM "public"."categories" p
        JOIN chain ch ON p."id" = ch."parentId"
        WHERE NOT p."id" = ANY(ch.path)
      )
      SELECT "id", "name", depth FROM chain ORDER BY depth
    `;
  }

  async createCategory(
    data: Omit<
      Prisma.CategoryCreateInput,
      'parent' | 'createdByUser' | 'updatedByUser' | 'children' | 'products'
    > & {
      userId: number;
      parentId?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const { userId, parentId, ...restData } = data;

    return await client.category.create({
      data: {
        ...restData,
        ...(parentId && {
          parent: {
            connect: { id: parentId },
          },
        }),
        createdByUser: {
          connect: { id: userId },
        },
      },
      select: this.CATEGORY_SELECT,
    });
  }

  async findAllCategories(
    params: PaginationQueryDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await this.paginationService.paginate<
      Prisma.CategoryGetPayload<{ select: typeof this.CATEGORY_SELECT }>,
      typeof client.category
    >(client.category, params, {
      select: this.CATEGORY_SELECT,
      searchableFields: ['name', 'slug', 'nameTh'],
      defaultSortField: 'createdAt',
    });
  }

  async findAllActiveCategories(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.category.findMany({
      where: {
        status: CategoryProductStatus.ACTIVE,
      },
      select: this.CATEGORY_SELECT,
      orderBy: {
        displayOrder: 'desc',
      },
    });
  }

  async findActiveRootCategories(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.category.findMany({
      where: {
        status: CategoryProductStatus.ACTIVE,
        parentId: null,
      },
      select: this.ROOT_ACTIVE_CATEGORY_SELECT,
    });
  }

  /** Active root categories with the extra fields a home-page category card needs. */
  async findActiveRootCategoriesForHome(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.category.findMany({
      where: {
        status: CategoryProductStatus.ACTIVE,
        parentId: null,
      },
      select: this.HOME_ROOT_CATEGORY_SELECT,
      orderBy: { displayOrder: 'asc' },
    });
  }

  /**
   * Active, level-1 categories (direct children of a root) — the set of
   * categories legal to assign to a product via `categoryId`. Level 1
   * specifically, not "any non-root": a root itself (level 0) is never
   * assignable, and this listing is scoped to the first tier below it.
   */
  async findProductCategories(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.category.findMany({
      where: {
        status: CategoryProductStatus.ACTIVE,
        parentId: { not: null },
        level: 1,
      },
      select: this.ROOT_ACTIVE_CATEGORY_SELECT,
    });
  }

  /**
   * Everything `CategoryService.deleteCategory` needs to decide — and carry
   * out — a removal, in one query: identity for the response, the three image
   * paths to clean up on a hard delete, and the two counts that gate it.
   *
   * `_count.products` is deliberately **unfiltered** — it counts soft-deleted
   * rows too. Those rows still hold `Product.categoryId`, whose FK is
   * `RESTRICT`, so they block a hard delete exactly as live ones do.
   *
   * `activeProductCount` is a second query rather than a filtered `_count`,
   * because a single `_count` block cannot count the same relation twice
   * under two different predicates. It narrows to what is actually on the
   * storefront, using the same predicate as
   * `ProductRepository.activeVisibilityWhere()`. Returns `null` — not a
   * zero-filled shell — when the category does not exist, so the caller's
   * 404 stays a single check.
   */
  async findForDeletion(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;

    const [category, activeProductCount] = await Promise.all([
      client.category.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          thumbnailUrl: true,
          bannerUrl: true,
          iconUrl: true,
          _count: { select: { children: true, products: true } },
        },
      }),
      client.product.count({
        where: {
          categoryId: id,
          status: CategoryProductStatus.ACTIVE,
          deletedAt: null,
        },
      }),
    ]);

    if (!category) return null;

    return {
      ...category,
      childrenCount: category._count.children,
      productCount: category._count.products,
      activeProductCount,
    };
  }

  async deleteCategory(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.category.delete({ where: { id } });
  }

  async updateCategory(
    id: number,
    data: Partial<UpdateCategoryDto> & {
      userId: number;
      slug?: string;
      level?: number;
      //* null IS A REAL, DISTINCT INSTRUCTION HERE — "CLEAR THIS COLUMN" —
      //* WHEREAS undefined STILL MEANS "LEAVE IT ALONE" (PRISMA SKIPS IT).
      //* THE CALLER ONLY EVER PASSES null AFTER IT HAS DELETED THE FILE.
      bannerUrl?: string | null;
      iconUrl?: string;
      thumbnailUrl?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const {
      userId,
      parentId,
      // image,
      // iconImage,
      // thumbnailImage,
      // bannerImage,
      ...rest
    } = data;

    return await client.category.update({
      where: { id },
      data: {
        ...rest,
        // Connect parent if provided, disconnect if null
        parent:
          parentId === null
            ? { disconnect: true }
            : parentId
              ? { connect: { id: parentId } }
              : undefined,
        // Track the user who performed the update
        updatedByUser: {
          connect: { id: userId },
        },
      },
      select: this.CATEGORY_SELECT,
    });
  }
}
