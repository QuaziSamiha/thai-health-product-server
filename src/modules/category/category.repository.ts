import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import { CategoryProductStatus } from '../../generated/prisma/enums';
import { PaginationService } from '../../shared/pagination/pagination.service';
import { PaginationParamsDto } from '../../shared/pagination/dto/pagination-params.dto';
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
          select: { name: true },
        },
      },
    },
    updatedByUser: {
      select: {
        id: true,
        role: true,
        profile: {
          select: { name: true },
        },
      },
    },
  } as const;

  private readonly ROOT_ACTIVE_CATEGORY_SELECT = {
    id: true,
    name: true,
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
    params: PaginationParamsDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await this.paginationService.paginate(client.category, params, {
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
      bannerUrl?: string;
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
